/**
 * SERVICIO DE NEGOCIO TRIBUTARIO - nuam exchange
 * Implementa:
 * 1. Validador estricto de Regla Fiscal: sum(F8..F19) <= 1.0
 * 2. Operaciones CRUD con aislamiento multi-tenant (corredoras)
 * 3. Carga masiva de declaraciones (upsert transaccional con rechazos aislados)
 * 4. Generación y descarga del log de rechazos CSV
 * 5. Exportación oficial de la Declaración Consolidada
 *
 * Persistencia directa en SQLite (calificaciones_tributarias + factores_detalle).
 */
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const { getDb } = require('../database/connection');
const AppError = require('../utils/AppError');
const { esRutValido, formatearRut } = require('../utils/rut');
const auditService = require('./auditService');

const FACTOR_CAMPOS = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
const NEMOTECNICO_REGEX = /^[A-Z0-9][A-Z0-9.\-]{1,19}$/;

// Caché en memoria de rechazos por lote, para la descarga posterior del CSV.
const lotesRechazosCache = new Map();

/**
 * Valida la regla fiscal: la sumatoria de factores F8 a F19 no puede superar 1.0.
 */
function validarReglaFiscal(factores = {}) {
  let suma = 0;
  for (const campo of FACTOR_CAMPOS) {
    const val = parseFloat(factores[campo]) || 0;
    if (val < 0) {
      return { valida: false, sumaTotal: 0, error: `El factor ${campo.toUpperCase()} no puede ser negativo.` };
    }
    suma += val;
  }
  suma = Math.round(suma * 1000000) / 1000000;
  if (suma > 1.000001) {
    return {
      valida: false,
      sumaTotal: suma,
      error: `Violación de regla fiscal: la suma de factores F8 a F19 es ${suma.toFixed(6)}, superando el límite legal máximo de 1.000000.`,
    };
  }
  return { valida: true, sumaTotal: suma };
}

/**
 * Parsea números considerando el locale latinoamericano (coma decimal y punto de miles).
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
  for (const patron of patrones) {
    const key = keys.find((k) => k.trim().toLowerCase() === patron.trim().toLowerCase());
    if (key && row[key] !== undefined && row[key] !== '') return row[key];
  }
  for (const patron of patrones) {
    if (patron.length < 4) continue;
    const pLower = patron.toLowerCase();
    const key = keys.find((k) => {
      const kLower = k.trim().toLowerCase();
      return kLower.includes(pLower) || pLower.includes(kLower);
    });
    if (key && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return '';
}

/**
 * Extrae los 12 factores fiscales (f08..f19) reconociendo variantes de encabezados.
 */
function extraerFactoresFila(row) {
  const factores = {};
  const keys = Object.keys(row);
  for (let i = 8; i <= 19; i++) {
    const numPadded = i < 10 ? '0' + i : String(i);
    const keyCanonico = 'f' + numPadded;
    const regex = new RegExp(`^f0?${i}(\\b|_|\\s|$)`, 'i');
    const matchedKey = keys.find((k) => regex.test(k.trim()));
    const raw = matchedKey ? row[matchedKey] : (row[keyCanonico] || row[keyCanonico.toUpperCase()] || 0);
    factores[keyCanonico] = parsearNumero(raw);
  }
  return factores;
}

function normalizarFactores(factores = {}) {
  const out = {};
  for (const c of FACTOR_CAMPOS) out[c] = parseFloat(factores[c]) || 0;
  return out;
}

function sumaFactores(factores) {
  return Math.round(FACTOR_CAMPOS.reduce((acc, c) => acc + (parseFloat(factores[c]) || 0), 0) * 1000000) / 1000000;
}

function registrarAuditoria(usuario, ip, accion, tenant, entidadId, detalle) {
  auditService.registrar({
    usuario,
    accion,
    entidad: 'DECLARACION_TRIBUTARIA',
    entidadId,
    tenant,
    detalle: detalle ? JSON.stringify(detalle) : null,
    ip,
  });
}

function leerFactores(db, calificacionId) {
  const fila = db.prepare('SELECT * FROM factores_detalle WHERE calificacion_id = ?').get(calificacionId);
  if (!fila) return normalizarFactores({});
  const factores = {};
  for (const c of FACTOR_CAMPOS) factores[c] = fila[c] || 0;
  return factores;
}

function mapearCalificacion(db, fila) {
  return {
    ...fila,
    no_inscrito: !!fila.no_inscrito,
    factores: leerFactores(db, fila.id),
  };
}

function obtenerCalificaciones(tenantId, filtro = '') {
  const db = getDb();
  const condiciones = [];
  const params = [];
  if (tenantId) {
    condiciones.push('tenant_id = ?');
    params.push(tenantId);
  }
  if (filtro && filtro.trim() !== '') {
    const q = `%${filtro.toLowerCase().trim()}%`;
    condiciones.push('(lower(rut_cliente) LIKE ? OR lower(nemotecnico) LIKE ? OR lower(razon_social) LIKE ?)');
    params.push(q, q, q);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `SELECT * FROM calificaciones_tributarias ${where} ORDER BY updated_at DESC, created_at DESC`;
  const filas = db.prepare(sql).all(...params);
  return filas.map((f) => mapearCalificacion(db, f));
}

function obtenerPorId(id, tenantId = null) {
  const db = getDb();
  let query = 'SELECT * FROM calificaciones_tributarias WHERE id = ?';
  const params = [id];
  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  const fila = db.prepare(query).get(...params);
  return fila ? mapearCalificacion(db, fila) : null;
}

function validarRut(rutCrudo) {
  const rut = String(rutCrudo || '').trim().toUpperCase();
  if (!rut) throw new AppError(400, 'RUT_REQUERIDO', 'El RUT del cliente es obligatorio.');
  if (!esRutValido(rut)) {
    throw new AppError(400, 'RUT_INVALIDO', `El RUT '${rut}' no es válido (dígito verificador incorrecto).`);
  }
  return formatearRut(rut);
}

function validarNemotecnico(nem) {
  const nemotecnico = String(nem || '').trim().toUpperCase();
  if (!nemotecnico) throw new AppError(400, 'NEMOTECNICO_REQUERIDO', 'El nemotécnico bursátil es obligatorio.');
  if (!NEMOTECNICO_REGEX.test(nemotecnico)) {
    throw new AppError(400, 'NEMOTECNICO_INVALIDO', `El nemotécnico '${nemotecnico}' no tiene un formato válido.`);
  }
  return nemotecnico;
}

function validarPeriodo(periodo) {
  const anio = parseInt(periodo, 10);
  if (!anio || anio < 2000 || anio > 2100) {
    throw new AppError(400, 'PERIODO_INVALIDO', `El período fiscal '${periodo}' no es válido.`);
  }
  return anio;
}

function crearCalificacion(tenantId, payload, usuario, ip) {
  const db = getDb();
  const rut = validarRut(payload.rut_cliente);
  const nemotecnico = validarNemotecnico(payload.nemotecnico);
  const periodo = validarPeriodo(payload.periodo_fiscal);

  const factores = normalizarFactores(payload.factores);
  const validacion = validarReglaFiscal(factores);
  if (!validacion.valida) {
    throw new AppError(400, 'REGLA_FISCAL_VIOLADA', validacion.error);
  }

  const existente = db
    .prepare('SELECT id FROM calificaciones_tributarias WHERE tenant_id = ? AND rut_cliente = ? AND nemotecnico = ? AND periodo_fiscal = ?')
    .get(tenantId, rut, nemotecnico, periodo);
  if (existente) {
    throw new AppError(409, 'DECLARACION_DUPLICADA', `Ya existe una declaración para ${rut} en ${nemotecnico} del período ${periodo}.`);
  }

  const id = uuidv4();
  const modalidad = payload.modalidad === 'MONTO' ? 'MONTO' : 'FACTOR';
  const valorNominal = parsearNumero(payload.valor_nominal);
  const razonSocial = (payload.razon_social || '').trim() || 'Cliente Inversionista';
  const noInscrito = payload.no_inscrito ? 1 : 0;

  const crear = db.transaction(() => {
    db.prepare(
      `INSERT INTO calificaciones_tributarias
         (id, tenant_id, rut_cliente, razon_social, nemotecnico, periodo_fiscal, modalidad, valor_nominal, no_inscrito, suma_factores)
       VALUES (@id, @tenant_id, @rut_cliente, @razon_social, @nemotecnico, @periodo_fiscal, @modalidad, @valor_nominal, @no_inscrito, @suma_factores)`
    ).run({
      id, tenant_id: tenantId, rut_cliente: rut, razon_social: razonSocial, nemotecnico,
      periodo_fiscal: periodo, modalidad, valor_nominal: valorNominal, no_inscrito: noInscrito,
      suma_factores: validacion.sumaTotal,
    });
    db.prepare(
      `INSERT INTO factores_detalle (id, calificacion_id, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, suma_total)
       VALUES (@id, @calificacion_id, @f08, @f09, @f10, @f11, @f12, @f13, @f14, @f15, @f16, @f17, @f18, @f19, @suma_total)`
    ).run({ id: `fac-${id}`, calificacion_id: id, ...factores, suma_total: validacion.sumaTotal });

    registrarAuditoria(usuario, ip, 'DECLARACION_CREAR', tenantId, id, {
      rut_cliente: rut, nemotecnico, periodo_fiscal: periodo, suma_factores: validacion.sumaTotal,
    });
  });
  crear();

  return mapearCalificacion(db, db.prepare('SELECT * FROM calificaciones_tributarias WHERE id = ?').get(id));
}

function actualizarCalificacion(tenantId, id, payload, usuario, ip) {
  const db = getDb();
  const fila = db.prepare('SELECT * FROM calificaciones_tributarias WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!fila) {
    throw new AppError(404, 'DECLARACION_NO_ENCONTRADA', 'La declaración no existe o no pertenece a la corredora seleccionada.');
  }

  const factores = normalizarFactores(payload.factores !== undefined ? payload.factores : leerFactores(db, id));
  const validacion = validarReglaFiscal(factores);
  if (!validacion.valida) {
    throw new AppError(400, 'REGLA_FISCAL_VIOLADA', validacion.error);
  }

  const modalidad = payload.modalidad !== undefined ? (payload.modalidad === 'MONTO' ? 'MONTO' : 'FACTOR') : fila.modalidad;
  const valorNominal = payload.valor_nominal !== undefined ? parsearNumero(payload.valor_nominal) : fila.valor_nominal;
  const razonSocial = payload.razon_social !== undefined ? payload.razon_social.trim() : fila.razon_social;
  const noInscrito = payload.no_inscrito !== undefined ? (payload.no_inscrito ? 1 : 0) : fila.no_inscrito;

  const antes = { suma_factores: fila.suma_factores, valor_nominal: fila.valor_nominal, modalidad: fila.modalidad };

  const actualizar = db.transaction(() => {
    db.prepare(
      `UPDATE calificaciones_tributarias
       SET razon_social = @razon_social, modalidad = @modalidad, valor_nominal = @valor_nominal,
           no_inscrito = @no_inscrito, suma_factores = @suma_factores, updated_at = CURRENT_TIMESTAMP
       WHERE id = @id`
    ).run({ razon_social: razonSocial, modalidad, valor_nominal: valorNominal, no_inscrito: noInscrito, suma_factores: validacion.sumaTotal, id });
    db.prepare(
      `UPDATE factores_detalle SET f08 = @f08, f09 = @f09, f10 = @f10, f11 = @f11, f12 = @f12,
         f13 = @f13, f14 = @f14, f15 = @f15, f16 = @f16, f17 = @f17, f18 = @f18, f19 = @f19, suma_total = @suma_total
       WHERE calificacion_id = @calificacion_id`
    ).run({ ...factores, suma_total: validacion.sumaTotal, calificacion_id: id });

    registrarAuditoria(usuario, ip, 'DECLARACION_ACTUALIZAR', tenantId, id, {
      rut_cliente: fila.rut_cliente, nemotecnico: fila.nemotecnico, antes,
      despues: { suma_factores: validacion.sumaTotal, valor_nominal: valorNominal },
    });
  });
  actualizar();

  return mapearCalificacion(db, db.prepare('SELECT * FROM calificaciones_tributarias WHERE id = ?').get(id));
}

function eliminarCalificacion(tenantId, id, usuario, ip) {
  const db = getDb();
  const fila = db.prepare('SELECT * FROM calificaciones_tributarias WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!fila) {
    throw new AppError(404, 'DECLARACION_NO_ENCONTRADA', 'La declaración no existe o no pertenece a la corredora seleccionada.');
  }

  const eliminar = db.transaction(() => {
    db.prepare('DELETE FROM calificaciones_tributarias WHERE id = ?').run(id);
    registrarAuditoria(usuario, ip, 'DECLARACION_ELIMINAR', tenantId, id, {
      rut_cliente: fila.rut_cliente, nemotecnico: fila.nemotecnico, periodo_fiscal: fila.periodo_fiscal,
    });
  });
  eliminar();

  return { success: true, id };
}

/**
 * Carga masiva de declaraciones: parsea CSV/XLSX, valida cada fila y aísla los
 * rechazos; los registros válidos se aplican en una única transacción (upsert).
 */
function procesarCargaMasiva(tenantId, fileBuffer, filename, usuario, ip) {
  let rows = [];
  try {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
  } catch (err) {
    throw new AppError(400, 'ARCHIVO_ILEGIBLE', 'No se pudo leer el archivo. Asegúrese de que sea un formato CSV o XLSX válido.');
  }

  if (!rows || rows.length === 0) {
    throw new AppError(400, 'ARCHIVO_VACIO', 'El archivo cargado se encuentra vacío.');
  }

  const rechazadosList = [];
  const validos = [];

  rows.forEach((row, idx) => {
    const numeroFila = idx + 2;

    const rawRut = obtenerValorFila(row, ['rut_cliente', 'RUT_CLIENTE', 'RUT', 'rut', 'Rut', 'RUT Cliente', 'rut cliente', 'rut titular', 'identificacion']);
    const rawNemo = obtenerValorFila(row, ['nemotecnico', 'NEMOTECNICO', 'nemotécnico', 'Nemotécnico', 'instrumento', 'Instrumento', 'nemo', 'Nemo', 'ticker', 'Ticker', 'accion', 'Accion']);
    const rawPeriodo = obtenerValorFila(row, ['periodo_fiscal', 'PERIODO_FISCAL', 'periodo', 'Periodo', 'período', 'Período', 'año', 'Año', 'ano', 'ejercicio']);
    const rawModalidad = obtenerValorFila(row, ['modalidad', 'MODALIDAD', 'Modalidad', 'tipo', 'Tipo']);
    const rawValor = obtenerValorFila(row, ['valor_nominal', 'VALOR_NOMINAL', 'Valor Nominal', 'Valor Nominal (CLP)', 'valor nominal clp', 'monto', 'Monto', 'total', 'Total', 'nominal', 'patrimonio']);
    const rawRazon = obtenerValorFila(row, ['razon_social', 'RAZON_SOCIAL', 'Razón Social', 'razon social', 'Razón Social Inversionista', 'razon social inversionista', 'inversionista', 'Inversionista', 'cliente', 'Cliente', 'Nombre', 'nombre']);
    const rawNoInscrito = obtenerValorFila(row, ['no_inscrito', 'NO_INSCRITO', 'No Inscrito', 'no inscrito']);

    const rutCrudo = String(rawRut).trim().toUpperCase();
    const nemCrudo = String(rawNemo).trim().toUpperCase();

    if (!rutCrudo || !nemCrudo) {
      rechazadosList.push({
        fila: numeroFila,
        rut: rutCrudo || 'SIN RUT',
        nemotecnico: nemCrudo || 'SIN NEMOTECNICO',
        motivo: 'Campos obligatorios faltantes: RUT o nemotécnico no informados.',
      });
      return;
    }

    if (!esRutValido(rutCrudo)) {
      rechazadosList.push({ fila: numeroFila, rut: rutCrudo, nemotecnico: nemCrudo, motivo: `RUT '${rutCrudo}' no válido (dígito verificador incorrecto).` });
      return;
    }
    const rut = formatearRut(rutCrudo);

    if (!NEMOTECNICO_REGEX.test(nemCrudo)) {
      rechazadosList.push({ fila: numeroFila, rut, nemotecnico: nemCrudo, motivo: `Nemotécnico '${nemCrudo}' no tiene un formato válido.` });
      return;
    }

    const periodo = parseInt(rawPeriodo, 10);
    if (!periodo || periodo < 2000 || periodo > 2100) {
      rechazadosList.push({ fila: numeroFila, rut, nemotecnico: nemCrudo, motivo: `Período fiscal '${rawPeriodo}' no válido.` });
      return;
    }

    const modalidad = String(rawModalidad).trim().toUpperCase() === 'MONTO' ? 'MONTO' : 'FACTOR';
    const valorNominal = parsearNumero(rawValor);
    const razonSocial = rawRazon ? String(rawRazon).trim() : 'Cliente Inversionista';
    const noInscrito = Boolean(rawNoInscrito === 'true' || rawNoInscrito === true || rawNoInscrito === 1 || rawNoInscrito === '1' || rawNoInscrito === 'SI');

    const factores = extraerFactoresFila(row);
    const validacion = validarReglaFiscal(factores);
    if (!validacion.valida) {
      rechazadosList.push({ fila: numeroFila, rut, nemotecnico: nemCrudo, motivo: validacion.error });
      return;
    }

    validos.push({ numeroFila, rut, nemotecnico: nemCrudo, periodo, modalidad, valorNominal, razonSocial, noInscrito, factores, suma: validacion.sumaTotal });
  });

  const db = getDb();
  let insertados = 0;
  let actualizados = 0;

  const upsert = db.transaction(() => {
    const selectExistente = db.prepare(
      'SELECT id FROM calificaciones_tributarias WHERE tenant_id = ? AND rut_cliente = ? AND nemotecnico = ? AND periodo_fiscal = ?'
    );
    const insertCal = db.prepare(
      `INSERT INTO calificaciones_tributarias
         (id, tenant_id, rut_cliente, razon_social, nemotecnico, periodo_fiscal, modalidad, valor_nominal, no_inscrito, suma_factores)
       VALUES (@id, @tenant_id, @rut_cliente, @razon_social, @nemotecnico, @periodo_fiscal, @modalidad, @valor_nominal, @no_inscrito, @suma_factores)`
    );
    const updateCal = db.prepare(
      `UPDATE calificaciones_tributarias
       SET razon_social = @razon_social, modalidad = @modalidad, valor_nominal = @valor_nominal,
           no_inscrito = @no_inscrito, suma_factores = @suma_factores, updated_at = CURRENT_TIMESTAMP
       WHERE id = @id`
    );
    const insertFac = db.prepare(
      `INSERT INTO factores_detalle (id, calificacion_id, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, suma_total)
       VALUES (@id, @calificacion_id, @f08, @f09, @f10, @f11, @f12, @f13, @f14, @f15, @f16, @f17, @f18, @f19, @suma_total)`
    );
    const updateFac = db.prepare(
      `UPDATE factores_detalle SET f08 = @f08, f09 = @f09, f10 = @f10, f11 = @f11, f12 = @f12,
         f13 = @f13, f14 = @f14, f15 = @f15, f16 = @f16, f17 = @f17, f18 = @f18, f19 = @f19, suma_total = @suma_total
       WHERE calificacion_id = @calificacion_id`
    );

    for (const v of validos) {
      const existente = selectExistente.get(tenantId, v.rut, v.nemotecnico, v.periodo);
      if (existente) {
        updateCal.run({
          id: existente.id, razon_social: v.razonSocial, modalidad: v.modalidad,
          valor_nominal: v.valorNominal, no_inscrito: v.noInscrito ? 1 : 0, suma_factores: v.suma,
        });
        updateFac.run({ ...v.factores, suma_total: v.suma, calificacion_id: existente.id });
        actualizados++;
        registrarAuditoria(usuario, ip, 'CARGA_MASIVA_ACTUALIZAR', tenantId, existente.id, {
          rut_cliente: v.rut, nemotecnico: v.nemotecnico, fila: v.numeroFila, suma: v.suma,
        });
      } else {
        const id = uuidv4();
        insertCal.run({
          id, tenant_id: tenantId, rut_cliente: v.rut, razon_social: v.razonSocial, nemotecnico: v.nemotecnico,
          periodo_fiscal: v.periodo, modalidad: v.modalidad, valor_nominal: v.valorNominal,
          no_inscrito: v.noInscrito ? 1 : 0, suma_factores: v.suma,
        });
        insertFac.run({ id: `fac-${id}`, calificacion_id: id, ...v.factores, suma_total: v.suma });
        insertados++;
        registrarAuditoria(usuario, ip, 'CARGA_MASIVA_INSERTAR', tenantId, id, {
          rut_cliente: v.rut, nemotecnico: v.nemotecnico, fila: v.numeroFila, suma: v.suma,
        });
      }
    }
  });
  upsert();

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
    rechazadosList,
  };
}

/**
 * Genera el CSV de filas rechazadas para descarga del operador (compatible Excel).
 */
function generarCsvRechazos(batchId) {
  const rechazados = lotesRechazosCache.get(batchId) || [];
  let csv = 'sep=,\r\nfila,rut_cliente,nemotecnico,motivo_rechazo\r\n';
  for (const r of rechazados) {
    const motivoLimpio = `"${String(r.motivo).replace(/"/g, '""')}"`;
    csv += `${r.fila},${r.rut},${r.nemotecnico},${motivoLimpio}\r\n`;
  }
  return csv;
}

function exportarDeclaracionOficial(tenantId) {
  const data = obtenerCalificaciones(tenantId);
  let csv = '\uFEFFsep=,\r\nRUT_CLIENTE,RAZON_SOCIAL,NEMOTECNICO,PERIODO_FISCAL,MODALIDAD,VALOR_NOMINAL,SUMA_FACTORES,F08,F09,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,NO_INSCRITO,FECHA_REGISTRO\r\n';
  for (const c of data) {
    const f = c.factores || {};
    csv += `${c.rut_cliente},"${c.razon_social}",${c.nemotecnico},${c.periodo_fiscal},${c.modalidad},${c.valor_nominal},${c.suma_factores},${f.f08 || 0},${f.f09 || 0},${f.f10 || 0},${f.f11 || 0},${f.f12 || 0},${f.f13 || 0},${f.f14 || 0},${f.f15 || 0},${f.f16 || 0},${f.f17 || 0},${f.f18 || 0},${f.f19 || 0},${c.no_inscrito ? 'SI' : 'NO'},${c.created_at}\r\n`;
  }
  return csv;
}

function exportarDeclaracionExcel(tenantId) {
  const data = obtenerCalificaciones(tenantId);
  const rows = [
    ['RUT_CLIENTE', 'RAZON_SOCIAL', 'NEMOTECNICO', 'PERIODO_FISCAL', 'MODALIDAD', 'VALOR_NOMINAL', 'SUMA_FACTORES', 'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'NO_INSCRITO', 'FECHA_REGISTRO'],
  ];
  for (const c of data) {
    const f = c.factores || {};
    rows.push([
      c.rut_cliente, c.razon_social || '', c.nemotecnico, c.periodo_fiscal, c.modalidad,
      c.valor_nominal || 0, c.suma_factores || 0,
      f.f08 || 0, f.f09 || 0, f.f10 || 0, f.f11 || 0, f.f12 || 0,
      f.f13 || 0, f.f14 || 0, f.f15 || 0, f.f16 || 0, f.f17 || 0, f.f18 || 0, f.f19 || 0,
      c.no_inscrito ? 'SI' : 'NO', c.created_at || '',
    ]);
  }
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 14 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 22 },
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Declaracion_Consolidada');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Genera la plantilla Excel oficial (.xlsx) para la carga masiva de declaraciones.
 * Los RUT de ejemplo poseen dígito verificador válido (módulo 11).
 */
function generarPlantillaExcel() {
  const rows = [
    ['rut_cliente', 'razon_social', 'nemotecnico', 'periodo_fiscal', 'modalidad', 'valor_nominal', 'no_inscrito', 'f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'],
    ['76.123.456-0', 'Inversiones Los Andes SpA', 'CHILE', 2026, 'FACTOR', 15400000, false, 0.35, 0.15, 0.10, 0.05, 0.00, 0.12, 0.00, 0.00, 0.00, 0.00, 0.00, 0.03],
    ['88.999.000-7', 'Renta Global Fondos Mutuos', 'SQM-B', 2026, 'FACTOR', 35000000, false, 0.30, 0.20, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.05],
    ['99.111.222-7', 'Inmobiliaria El Roble Ltda', 'FALABELLA', 2026, 'MONTO', 12000000, false, 0.35, 0.15, 0.10, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00],
    ['11.222.333-9', 'Empresas Delta S.A.', 'CENCOSUD', 2026, 'FACTOR', 18000000, false, 0.30, 0.25, 0.15, 0.10, 0.00, 0.10, 0.00, 0.00, 0.00, 0.00, 0.00, 0.10],
  ];
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 15 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 15 }, { wch: 12 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
  ];
  xlsx.utils.book_append_sheet(wb, ws, 'Plantilla_Declaraciones');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  validarReglaFiscal,
  parsearNumero,
  obtenerValorFila,
  extraerFactoresFila,
  obtenerCalificaciones,
  obtenerPorId,
  crearCalificacion,
  actualizarCalificacion,
  eliminarCalificacion,
  procesarCargaMasiva,
  generarCsvRechazos,
  exportarDeclaracionOficial,
  exportarDeclaracionExcel,
  generarPlantillaExcel,
};
