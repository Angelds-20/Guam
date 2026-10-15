/**
 * SERVICIO DE NEGOCIO TRIBUTARIO - nuam exchange
 * Implementa:
 * 1. Validador estricto de Regla Fiscal: sum(F8..F19) <= 1.0
 * 2. Operaciones CRUD con aislamiento Multitenant
 * 3. Ingesta Masiva Inteligente (Lógica Upsert: Update + Insert)
 * 4. Generación y descarga de Log de Rechazos CSV
 * 5. Exportación oficial de Declaración Consolidada
 */

const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const { 
  calificaciones, 
  persistirAuditoria, 
  sqliteGuardarCalificacion, 
  sqliteEliminarCalificacion 
} = require('../models/dataStore');

// Almacén temporal en memoria para descargas de rechazos por lote
const lotesRechazosCache = new Map();

/**
 * Valida la regla fiscal: La sumatoria de factores F8 a F19 no puede superar 1.0
 */
function validarReglaFiscal(factores = {}) {
  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  let suma = 0;

  for (const campo of campos) {
    const val = parseFloat(factores[campo]) || 0;
    if (val < 0) {
      return { valida: false, sumaTotal: 0, error: `El factor ${campo.toUpperCase()} no puede ser negativo.` };
    }
    suma += val;
  }

  // Redondeo a 6 decimales para evitar problemas de coma flotante
  suma = Math.round(suma * 1000000) / 1000000;

  if (suma > 1.000001) {
    return {
      valida: false,
      sumaTotal: suma,
      error: `Violación de regla fiscal: La suma de factores F8 a F19 es ${suma.toFixed(6)}, superando el límite legal máximo de 1.000000.`
    };
  }

  return { valida: true, sumaTotal: suma };
}

/**
 * Parsea números considerando locale latinoamericano/español (coma decimal y punto de miles)
 * Ejemplos: "0,35" -> 0.35, "15.400.000" -> 15400000, "15.400.000,50" -> 15400000.5, 0.35 -> 0.35
 */
function parsearNumero(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = val.toString().trim();
  if (str.includes(',') && !str.includes('.')) {
    str = str.replace(',', '.');
  } else if (str.includes('.') && str.includes(',')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.') && (str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, '');
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function obtenerValorFila(row, patrones) {
  const keys = Object.keys(row);
  // 1. Coincidencia exacta (case-insensitive)
  for (const patron of patrones) {
    const key = keys.find(k => k.trim().toLowerCase() === patron.trim().toLowerCase());
    if (key && row[key] !== undefined && row[key] !== '') {
      return row[key];
    }
  }
  // 2. Coincidencia parcial (por inclusión)
  for (const patron of patrones) {
    if (patron.length < 4) continue;
    const pLower = patron.toLowerCase();
    const key = keys.find(k => {
      const kLower = k.trim().toLowerCase();
      return kLower.includes(pLower) || pLower.includes(kLower);
    });
    if (key && row[key] !== undefined && row[key] !== '') {
      return row[key];
    }
  }
  return '';
}

/**
 * Extrae los 12 factores fiscales (f08..f19) reconociendo variantes de encabezados
 */
function extraerFactoresFila(row) {
  const factores = {};
  const keys = Object.keys(row);

  for (let i = 8; i <= 19; i++) {
    const numPadded = i < 10 ? '0' + i : String(i);
    const keyCanonico = 'f' + numPadded;

    // Buscar coincidencia como: f08, F08, f8, F8, o "F08 Rta Atrib"
    const regex = new RegExp(`^f0?${i}(\\b|_|\\s|$)`, 'i');
    const matchedKey = keys.find(k => regex.test(k.trim()));

    const raw = matchedKey ? row[matchedKey] : (row[keyCanonico] || row[keyCanonico.toUpperCase()] || 0);
    factores[keyCanonico] = parsearNumero(raw);
  }

  return factores;
}

/**
 * Obtener calificaciones filtradas estrictamente por Tenant (Corredora)
 */
function obtenerCalificaciones(tenantId, filtro = '') {
  let listado = calificaciones.filter(c => c.tenant_id === tenantId);

  if (filtro && filtro.trim() !== '') {
    const q = filtro.toLowerCase().trim();
    listado = listado.filter(c =>
      c.rut_cliente.toLowerCase().includes(q) ||
      c.nemotecnico.toLowerCase().includes(q) ||
      (c.razon_social && c.razon_social.toLowerCase().includes(q))
    );
  }

  return listado;
}

/**
 * Crear calificación individual con validación tributaria y trazabilidad
 */
function crearCalificacion(tenantId, payload, usuario = 'operador@corredora.cl') {
  if (!payload.rut_cliente || !payload.nemotecnico || !payload.periodo_fiscal) {
    throw new Error('RUT de cliente, nemotécnico bursátil y período fiscal son obligatorios.');
  }

  const factores = payload.factores || {};
  const validacion = validarReglaFiscal(factores);

  if (!validacion.valida) {
    throw new Error(validacion.error);
  }

  // Verificar si ya existe registro único por (tenant, rut, nemotécnico, período)
  const existe = calificaciones.find(c =>
    c.tenant_id === tenantId &&
    c.rut_cliente.trim().toUpperCase() === payload.rut_cliente.trim().toUpperCase() &&
    c.nemotecnico.trim().toUpperCase() === payload.nemotecnico.trim().toUpperCase() &&
    parseInt(c.periodo_fiscal) === parseInt(payload.periodo_fiscal)
  );

  if (existe) {
    throw new Error(`Ya existe una calificación para el cliente ${payload.rut_cliente} en el instrumento ${payload.nemotecnico} para el período ${payload.periodo_fiscal}. Utilice la opción de edición o carga masiva (Upsert).`);
  }

  const nuevaCalificacion = {
    id: uuidv4(),
    tenant_id: tenantId,
    rut_cliente: payload.rut_cliente.trim().toUpperCase(),
    razon_social: payload.razon_social ? payload.razon_social.trim() : 'Cliente Inversionista',
    nemotecnico: payload.nemotecnico.trim().toUpperCase(),
    periodo_fiscal: parseInt(payload.periodo_fiscal) || 2026,
    modalidad: payload.modalidad === 'MONTO' ? 'MONTO' : 'FACTOR',
    valor_nominal: parseFloat(payload.valor_nominal) || 0,
    no_inscrito: Boolean(payload.no_inscrito),
    factores: {
      f08: parseFloat(factores.f08) || 0,
      f09: parseFloat(factores.f09) || 0,
      f10: parseFloat(factores.f10) || 0,
      f11: parseFloat(factores.f11) || 0,
      f12: parseFloat(factores.f12) || 0,
      f13: parseFloat(factores.f13) || 0,
      f14: parseFloat(factores.f14) || 0,
      f15: parseFloat(factores.f15) || 0,
      f16: parseFloat(factores.f16) || 0,
      f17: parseFloat(factores.f17) || 0,
      f18: parseFloat(factores.f18) || 0,
      f19: parseFloat(factores.f19) || 0,
    },
    suma_factores: validacion.sumaTotal,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  calificaciones.unshift(nuevaCalificacion);
  if (typeof sqliteGuardarCalificacion === 'function') {
    sqliteGuardarCalificacion(nuevaCalificacion);
  }

  // Registro inmutable de auditoría
  persistirAuditoria({
    tenant_id: tenantId,
    usuario,
    accion: 'CREACION_MANUAL',
    entidad: 'CALIFICACION_TRIBUTARIA',
    registro_id: nuevaCalificacion.id,
    detalle: {
      rut_cliente: nuevaCalificacion.rut_cliente,
      nemotecnico: nuevaCalificacion.nemotecnico,
      suma_factores: nuevaCalificacion.suma_factores,
      valor_nominal: nuevaCalificacion.valor_nominal
    }
  });

  return nuevaCalificacion;
}

/**
 * Actualizar calificación existente
 */
function actualizarCalificacion(tenantId, id, payload, usuario = 'operador@corredora.cl') {
  const index = calificaciones.findIndex(c => c.id === id && c.tenant_id === tenantId);
  if (index === -1) {
    throw new Error('Calificación no encontrada o no pertenece a la corredora seleccionada.');
  }

  const actual = calificaciones[index];
  const factores = payload.factores ? { ...actual.factores, ...payload.factores } : actual.factores;
  const validacion = validarReglaFiscal(factores);

  if (!validacion.valida) {
    throw new Error(validacion.error);
  }

  const valoresAnteriores = {
    suma_factores: actual.suma_factores,
    valor_nominal: actual.valor_nominal,
    modalidad: actual.modalidad
  };

  actual.modalidad = payload.modalidad || actual.modalidad;
  actual.valor_nominal = payload.valor_nominal !== undefined ? parseFloat(payload.valor_nominal) : actual.valor_nominal;
  actual.no_inscrito = payload.no_inscrito !== undefined ? Boolean(payload.no_inscrito) : actual.no_inscrito;
  actual.razon_social = payload.razon_social || actual.razon_social;
  actual.factores = {
    f08: parseFloat(factores.f08) || 0,
    f09: parseFloat(factores.f09) || 0,
    f10: parseFloat(factores.f10) || 0,
    f11: parseFloat(factores.f11) || 0,
    f12: parseFloat(factores.f12) || 0,
    f13: parseFloat(factores.f13) || 0,
    f14: parseFloat(factores.f14) || 0,
    f15: parseFloat(factores.f15) || 0,
    f16: parseFloat(factores.f16) || 0,
    f17: parseFloat(factores.f17) || 0,
    f18: parseFloat(factores.f18) || 0,
    f19: parseFloat(factores.f19) || 0,
  };
  actual.suma_factores = validacion.sumaTotal;
  actual.updated_at = new Date().toISOString();
  if (typeof sqliteGuardarCalificacion === 'function') {
    sqliteGuardarCalificacion(actual);
  }

  persistirAuditoria({
    tenant_id: tenantId,
    usuario,
    accion: 'ACTUALIZACION_MANUAL',
    entidad: 'CALIFICACION_TRIBUTARIA',
    registro_id: actual.id,
    detalle: {
      rut_cliente: actual.rut_cliente,
      nemotecnico: actual.nemotecnico,
      antes: valoresAnteriores,
      despues: {
        suma_factores: actual.suma_factores,
        valor_nominal: actual.valor_nominal
      }
    }
  });

  return actual;
}

/**
 * Eliminar calificación individual
 */
function eliminarCalificacion(tenantId, id, usuario = 'operador@corredora.cl') {
  const index = calificaciones.findIndex(c => c.id === id && c.tenant_id === tenantId);
  if (index === -1) {
    throw new Error('Calificación no encontrada o no pertenece a la corredora seleccionada.');
  }

  const eliminada = calificaciones.splice(index, 1)[0];
  if (typeof sqliteEliminarCalificacion === 'function') {
    sqliteEliminarCalificacion(id);
  }

  persistirAuditoria({
    tenant_id: tenantId,
    usuario,
    accion: 'ELIMINACION',
    entidad: 'CALIFICACION_TRIBUTARIA',
    registro_id: id,
    detalle: {
      rut_cliente: eliminada.rut_cliente,
      nemotecnico: eliminada.nemotecnico
    }
  });

  return { success: true, id };
}

/**
 * Ingesta Masiva Inteligente con Lógica Upsert
 * Procesa archivos CSV o Excel (XLSX)
 * No frena el lote completo si una fila falla; aísla los rechazos para descarga posterior.
 */
function procesarCargaMasiva(tenantId, fileBuffer, filename, usuario = 'operador@corredora.cl') {
  let rows = [];

  try {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  } catch (err) {
    throw new Error('No se pudo leer el archivo. Asegúrese de que sea un formato CSV o XLSX válido.');
  }

  if (!rows || rows.length === 0) {
    throw new Error('El archivo cargado se encuentra vacío.');
  }

  let insertados = 0;
  let actualizados = 0;
  const rechazadosList = [];

  rows.forEach((row, idx) => {
    const numeroFila = idx + 2; // +2 considerando encabezado base 1

    const rawRut = obtenerValorFila(row, ['rut_cliente', 'RUT_CLIENTE', 'RUT', 'rut', 'Rut', 'RUT Cliente', 'rut cliente', 'rut titular', 'identificacion']);
    const rawNemo = obtenerValorFila(row, ['nemotecnico', 'NEMOTECNICO', 'nemotécnico', 'Nemotécnico', 'instrumento', 'Instrumento', 'nemo', 'Nemo', 'ticker', 'Ticker', 'accion', 'Accion']);
    const rawPeriodo = obtenerValorFila(row, ['periodo_fiscal', 'PERIODO_FISCAL', 'periodo', 'Periodo', 'período', 'Período', 'año', 'Año', 'ano', 'ejercicio']);
    const rawModalidad = obtenerValorFila(row, ['modalidad', 'MODALIDAD', 'Modalidad', 'tipo', 'Tipo']);
    const rawValor = obtenerValorFila(row, ['valor_nominal', 'VALOR_NOMINAL', 'Valor Nominal', 'Valor Nominal (CLP)', 'valor nominal clp', 'monto', 'Monto', 'total', 'Total', 'nominal', 'patrimonio']);
    const rawRazon = obtenerValorFila(row, ['razon_social', 'RAZON_SOCIAL', 'Razón Social', 'razon social', 'Razón Social Inversionista', 'razon social inversionista', 'inversionista', 'Inversionista', 'cliente', 'Cliente', 'Nombre', 'nombre']);
    const rawNoInscrito = obtenerValorFila(row, ['no_inscrito', 'NO_INSCRITO', 'No Inscrito', 'no inscrito']);

    const rut = rawRut.toString().trim().toUpperCase();
    const nemotecnico = rawNemo.toString().trim().toUpperCase();
    const periodo = parseInt(rawPeriodo) || 2026;
    const modalidad = (rawModalidad.toString().trim().toUpperCase() === 'MONTO') ? 'MONTO' : 'FACTOR';
    const valorNominal = parsearNumero(rawValor);
    const razonSocial = rawRazon ? rawRazon.toString().trim() : 'Cliente Inversionista';
    const noInscrito = Boolean(rawNoInscrito === 'true' || rawNoInscrito === true || rawNoInscrito === 1 || rawNoInscrito === '1' || rawNoInscrito === 'SI');

    if (!rut || !nemotecnico) {
      rechazadosList.push({
        fila: numeroFila,
        rut: rut || 'SIN RUT',
        nemotecnico: nemotecnico || 'SIN NEMOTECNICO',
        motivo: 'Campos obligatorios faltantes: RUT o Nemotécnico no informados.'
      });
      return;
    }

    const factores = extraerFactoresFila(row);

    const validacion = validarReglaFiscal(factores);
    if (!validacion.valida) {
      rechazadosList.push({
        fila: numeroFila,
        rut,
        nemotecnico,
        motivo: validacion.error
      });
      return;
    }

    // Comprobar si ya existe para aplicar UPSERT (Update o Insert)
    const existente = calificaciones.find(c =>
      c.tenant_id === tenantId &&
      c.rut_cliente === rut &&
      c.nemotecnico === nemotecnico &&
      parseInt(c.periodo_fiscal) === periodo
    );

    if (existente) {
      // ACCIÓN UPDATE (Upsert)
      const antes = { suma_factores: existente.suma_factores, valor_nominal: existente.valor_nominal };
      existente.modalidad = modalidad;
      existente.valor_nominal = valorNominal;
      existente.razon_social = razonSocial;
      existente.no_inscrito = noInscrito;
      existente.factores = factores;
      existente.suma_factores = validacion.sumaTotal;
      existente.updated_at = new Date().toISOString();
      actualizados++;
      if (typeof sqliteGuardarCalificacion === 'function') {
        sqliteGuardarCalificacion(existente);
      }

      persistirAuditoria({
        tenant_id: tenantId,
        usuario,
        accion: 'UPSERT_UPDATE',
        entidad: 'CALIFICACION_TRIBUTARIA',
        registro_id: existente.id,
        detalle: { rut, nemotecnico, fila: numeroFila, antes, despues: { suma: validacion.sumaTotal, valor: valorNominal } }
      });
    } else {
      // ACCIÓN INSERT (Upsert)
      const nueva = {
        id: uuidv4(),
        tenant_id: tenantId,
        rut_cliente: rut,
        razon_social: razonSocial,
        nemotecnico,
        periodo_fiscal: periodo,
        modalidad,
        valor_nominal: valorNominal,
        no_inscrito: noInscrito,
        factores,
        suma_factores: validacion.sumaTotal,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      calificaciones.unshift(nueva);
      insertados++;
      if (typeof sqliteGuardarCalificacion === 'function') {
        sqliteGuardarCalificacion(nueva);
      }

      persistirAuditoria({
        tenant_id: tenantId,
        usuario,
        accion: 'UPSERT_INSERT',
        entidad: 'CALIFICACION_TRIBUTARIA',
        registro_id: nueva.id,
        detalle: { rut, nemotecnico, fila: numeroFila, suma: validacion.sumaTotal }
      });
    }
  });

  const batchId = uuidv4();
  if (rechazadosList.length > 0) {
    lotesRechazosCache.set(batchId, rechazadosList);
  }

  return {
    batchId,
    archivo: filename,
    totalLeidos: rows.length,
    insertados,
    actualizados,
    rechazados: rechazadosList.length,
    rechazadosList
  };
}

/**
 * Genera el CSV de filas rechazadas para descarga del operador (Compatible Excel Mac/Windows)
 */
function generarCsvRechazos(batchId) {
  const rechazados = lotesRechazosCache.get(batchId) || [];
  if (rechazados.length === 0) {
    return 'sep=,\r\nfila,rut_cliente,nemotecnico,motivo_rechazo\r\n';
  }

  let csv = 'sep=,\r\nfila,rut_cliente,nemotecnico,motivo_rechazo\r\n';
  for (const r of rechazados) {
    const motivoLimpio = `"${r.motivo.replace(/"/g, '""')}"`;
    csv += `${r.fila},${r.rut},${r.nemotecnico},${motivoLimpio}\r\n`;
  }
  return csv;
}

/**
 * Genera el archivo CSV consolidado oficial de Declaración Jurada (Compatible Excel Mac/Windows)
 */
function exportarDeclaracionOficial(tenantId) {
  const data = obtenerCalificaciones(tenantId);
  let csv = 'sep=,\r\nRUT_CLIENTE,RAZON_SOCIAL,NEMOTECNICO,PERIODO_FISCAL,MODALIDAD,VALOR_NOMINAL,SUMA_FACTORES,F08,F09,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,NO_INSCRITO,FECHA_REGISTRO\r\n';

  for (const c of data) {
    const f = c.factores || {};
    csv += `${c.rut_cliente},"${c.razon_social}",${c.nemotecnico},${c.periodo_fiscal},${c.modalidad},${c.valor_nominal},${c.suma_factores},${f.f08||0},${f.f09||0},${f.f10||0},${f.f11||0},${f.f12||0},${f.f13||0},${f.f14||0},${f.f15||0},${f.f16||0},${f.f17||0},${f.f18||0},${f.f19||0},${c.no_inscrito},${c.created_at}\r\n`;
  }

  return csv;
}

/**
 * Genera el archivo Excel (.xlsx) oficial de Declaración Jurada para una corredora
 */
function exportarDeclaracionExcel(tenantId) {
  const data = obtenerCalificaciones(tenantId);
  const rows = [
    [
      'RUT_CLIENTE', 'RAZON_SOCIAL', 'NEMOTECNICO', 'PERIODO_FISCAL', 'MODALIDAD',
      'VALOR_NOMINAL', 'SUMA_FACTORES', 'F08', 'F09', 'F10', 'F11', 'F12',
      'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'NO_INSCRITO', 'FECHA_REGISTRO'
    ]
  ];

  for (const c of data) {
    const f = c.factores || {};
    rows.push([
      c.rut_cliente,
      c.razon_social || '',
      c.nemotecnico,
      c.periodo_fiscal,
      c.modalidad,
      c.valor_nominal || 0,
      c.suma_factores || 0,
      f.f08 || 0, f.f09 || 0, f.f10 || 0, f.f11 || 0, f.f12 || 0,
      f.f13 || 0, f.f14 || 0, f.f15 || 0, f.f16 || 0, f.f17 || 0, f.f18 || 0, f.f19 || 0,
      c.no_inscrito ? 'SI' : 'NO',
      c.created_at || ''
    ]);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 16 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 22 }
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Declaracion_Consolidada');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera la plantilla Excel oficial (.xlsx) formateada para importación
 */
function generarPlantillaExcel() {
  const rows = [
    [
      'rut_cliente', 'razon_social', 'nemotecnico', 'periodo_fiscal', 'modalidad',
      'valor_nominal', 'no_inscrito', 'f08', 'f09', 'f10', 'f11', 'f12',
      'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'
    ],
    ['76.123.456-7', 'Inversiones Los Andes SpA', 'CHILE', 2026, 'FACTOR', 15400000, false, 0.35, 0.15, 0.10, 0.05, 0.00, 0.12, 0.00, 0.00, 0.00, 0.00, 0.00, 0.03],
    ['88.999.000-1', 'Renta Global Fondos Mutuos', 'SQM-B', 2026, 'FACTOR', 35000000, false, 0.30, 0.20, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.05],
    ['99.111.222-3', 'Inmobiliaria El Roble Ltda', 'FALABELLA', 2026, 'MONTO', 12000000, false, 0.35, 0.15, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    ['11.222.333-4', 'Empresas Delta S.A.', 'CMPC', 2026, 'FACTOR', 18000000, false, 0.30, 0.25, 0.15, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.10]
  ];

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 15 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Plantilla_Calificaciones');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera lotes de prueba listos para demostraciones
 * @param {boolean} conRechazo Si es true, incluye 1 fila con factores que suman 1.25 para demostrar el log de rechazos
 */
function generarLotePrueba(conRechazo = false, formato = 'xlsx') {
  const rows = [
    [
      'rut_cliente', 'razon_social', 'nemotecnico', 'periodo_fiscal', 'modalidad',
      'valor_nominal', 'no_inscrito', 'f08', 'f09', 'f10', 'f11', 'f12',
      'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'
    ],
    ['76.123.456-7', 'Inversiones Los Andes SpA', 'CHILE', 2026, 'FACTOR', 20000000, false, 0.40, 0.20, 0.10, 0.05, 0.00, 0.15, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    ['55.444.333-2', 'Nuevo Holding Andino SpA', 'ENELAM', 2026, 'FACTOR', 8000000, false, 0.30, 0.20, 0.10, 0.00, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    ['88.999.000-1', 'Renta Global Fondos Mutuos', 'SQM-B', 2026, 'FACTOR', 35000000, false, 0.30, 0.20, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.05],
    ['99.111.222-3', 'Inmobiliaria El Roble Ltda', 'FALABELLA', 2026, 'MONTO', 12000000, false, 0.35, 0.15, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00]
  ];

  if (conRechazo) {
    // Fila 5: F08(0.70) + F09(0.40) + F10(0.15) = 1.25 > 1.0 (Provoca rechazo intencional para demostrar aislamiento)
    rows.push([
      '66.555.444-1', 'Cliente Caso Rechazo', 'CMPC', 2026, 'FACTOR',
      1000000, false, 0.70, 0.40, 0.15, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00
    ]);
  }

  if (formato === 'csv') {
    let csv = '';
    rows.forEach(r => {
      csv += r.map(c => typeof c === 'string' && c.includes(' ') ? `"${c}"` : c).join(',') + '\n';
    });
    return csv;
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 15 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }
  ];
  xlsx.utils.book_append_sheet(wb, ws, conRechazo ? 'Lote_Con_Rechazo' : 'Lote_Valido');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  validarReglaFiscal,
  parsearNumero,
  obtenerCalificaciones,
  crearCalificacion,
  actualizarCalificacion,
  eliminarCalificacion,
  procesarCargaMasiva,
  generarCsvRechazos,
  exportarDeclaracionOficial,
  exportarDeclaracionExcel,
  generarPlantillaExcel,
  generarLotePrueba
};
