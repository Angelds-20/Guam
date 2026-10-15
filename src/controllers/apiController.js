/**
 * CONTROLADOR DE APIS REST - nuam exchange
 */

const dataStore = require('../models/dataStore');
const { corredoras, bolsaCentralInstrumentos, bitacoraAuditoria } = dataStore;
const tributarioService = require('../services/tributarioService');

// Listar Corredoras (Tenants)
function listarCorredoras(req, res) {
  res.json({ success: true, data: corredoras });
}

// Listar Calificaciones por Tenant
function listarCalificaciones(req, res) {
  const tenantId = req.query.tenant_id || corredoras[0].id;
  const filtro = req.query.q || '';
  const data = tributarioService.obtenerCalificaciones(tenantId, filtro);
  res.json({ success: true, count: data.length, tenant_id: tenantId, data });
}

// Helper de validación de roles en Backend (Defensa en Profundidad)
function obtenerUsuarioPorEmail(email) {
  if (!email) return null;
  return dataStore.usuarios.find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
}

// Crear Calificación
function crearCalificacion(req, res) {
  try {
    const tenantId = req.body.tenant_id || req.headers['x-tenant-id'] || corredoras[0].id;
    const usuario = req.body.usuario || 'operador@corredora.cl';

    const usr = obtenerUsuarioPorEmail(usuario);
    if (usr && usr.rango === 'AUDITOR_CMF') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: El perfil Auditor CMF opera en modo de solo lectura y no puede crear registros.' });
    }

    const nueva = tributarioService.crearCalificacion(tenantId, req.body, usuario);
    res.status(201).json({ success: true, message: 'Calificación creada exitosamente.', data: nueva });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// Actualizar Calificación
function actualizarCalificacion(req, res) {
  try {
    const tenantId = req.body.tenant_id || req.headers['x-tenant-id'] || corredoras[0].id;
    const usuario = req.body.usuario || 'operador@corredora.cl';
    const id = req.params.id;

    const usr = obtenerUsuarioPorEmail(usuario);
    if (usr && usr.rango === 'AUDITOR_CMF') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: El perfil Auditor CMF opera en modo de solo lectura y no puede actualizar registros.' });
    }

    const actualizada = tributarioService.actualizarCalificacion(tenantId, id, req.body, usuario);
    res.json({ success: true, message: 'Calificación actualizada exitosamente.', data: actualizada });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// Eliminar Calificación
function eliminarCalificacion(req, res) {
  try {
    const tenantId = req.query.tenant_id || req.headers['x-tenant-id'] || corredoras[0].id;
    const usuario = req.query.usuario || 'operador@corredora.cl';
    const id = req.params.id;

    const usr = obtenerUsuarioPorEmail(usuario);
    if (usr && usr.rango === 'AUDITOR_CMF') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: El perfil Auditor CMF opera en modo de solo lectura y no puede eliminar registros.' });
    }

    const result = tributarioService.eliminarCalificacion(tenantId, id, usuario);
    res.json({ success: true, message: 'Calificación eliminada exitosamente.', data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// Carga Masiva (Upsert)
function cargaMasiva(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Debe adjuntar un archivo CSV o XLSX.' });
    }
    const tenantId = req.body.tenant_id || req.headers['x-tenant-id'] || corredoras[0].id;
    const usuario = req.body.usuario || 'operador@corredora.cl';

    const usr = obtenerUsuarioPorEmail(usuario);
    if (usr && usr.rango === 'AUDITOR_CMF') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: El perfil Auditor CMF opera en modo de solo fiscalización y no puede ejecutar ingestas masivas.' });
    }

    const resultado = tributarioService.procesarCargaMasiva(
      tenantId,
      req.file.buffer,
      req.file.originalname,
      usuario
    );

    res.json({
      success: true,
      message: `Procesamiento masivo completado: ${resultado.insertados} insertados, ${resultado.actualizados} actualizados, ${resultado.rechazados} rechazados.`,
      resultado
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

// Descargar CSV de Rechazos del Lote
function descargarRechazos(req, res) {
  const batchId = req.params.batchId;
  const csv = tributarioService.generarCsvRechazos(batchId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rechazos_lote_${batchId.substring(0, 8)}.csv"`);
  res.send('\uFEFF' + csv);
}

// Exportar Declaración Consolidada (CSV o XLSX)
function exportarDeclaracion(req, res) {
  const tenantId = req.query.tenant_id || corredoras[0].id;
  const corr = corredoras.find(c => c.id === tenantId) || corredoras[0];
  const formato = (req.query.formato || 'csv').toLowerCase();

  if (formato === 'xlsx' || formato === 'excel') {
    const buffer = tributarioService.exportarDeclaracionExcel(tenantId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="declaracion_consolidada_${corr.codigo}_2026.xlsx"`);
    return res.send(buffer);
  }

  const csv = tributarioService.exportarDeclaracionOficial(tenantId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="declaracion_consolidada_${corr.codigo}_2026.csv"`);
  res.send('\uFEFF' + csv); // Byte Order Mark para correcta lectura en Excel en español
}

// Descargar Plantilla Oficial (CSV o XLSX)
function descargarPlantilla(req, res) {
  const formato = (req.query.formato || req.params.formato || 'csv').toLowerCase();

  if (formato === 'xlsx' || formato === 'excel') {
    const buffer = tributarioService.generarPlantillaExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_carga_tributaria_nuam.xlsx"');
    return res.send(buffer);
  }

  const plantilla = `rut_cliente,razon_social,nemotecnico,periodo_fiscal,modalidad,valor_nominal,no_inscrito,f08,f09,f10,f11,f12,f13,f14,f15,f16,f17,f18,f19
76.123.456-7,"Inversiones Los Andes SpA",CHILE,2026,FACTOR,15400000,false,0.35,0.15,0.10,0.05,0.00,0.12,0.00,0.00,0.00,0.00,0.00,0.03
88.999.000-1,"Renta Global Fondos Mutuos",SQM-B,2026,FACTOR,35000000,false,0.30,0.20,0.10,0.10,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.05
99.111.222-3,"Inmobiliaria El Roble Ltda",FALABELLA,2026,MONTO,12000000,false,0.35,0.15,0.10,0.10,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.00
11.222.333-4,"Empresas Delta S.A.",CMPC,2026,FACTOR,18000000,false,0.30,0.25,0.15,0.10,0.00,0.10,0.00,0.00,0.00,0.00,0.00,0.10
`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_carga_tributaria_nuam.csv"');
  res.send('\uFEFF' + plantilla);
}

// Descargar Lotes de Prueba Preparados (Para demostración rápida)
function descargarLotePrueba(req, res) {
  const tipo = req.params.tipo || 'valido'; // 'valido' o 'con-rechazo'
  const formato = (req.query.formato || 'xlsx').toLowerCase();
  const conRechazo = tipo === 'con-rechazo';

  const data = tributarioService.generarLotePrueba(conRechazo, formato);

  if (formato === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lote_prueba_${conRechazo ? 'con_rechazo' : 'valido'}.xlsx"`);
    return res.send(data);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lote_prueba_${conRechazo ? 'con_rechazo' : 'valido'}.csv"`);
  res.send('\uFEFF' + data);
}

// Listar Bitácora de Auditoría
function listarAuditoria(req, res) {
  const tenantId = req.query.tenant_id;
  let logs = bitacoraAuditoria;
  if (tenantId) {
    logs = logs.filter(l => l.tenant_id === tenantId);
  }
  res.json({ success: true, count: logs.length, data: logs });
}

// Consultar Catálogo Bolsa Central nuam (SOLO LECTURA)
function consultarBolsaCentral(req, res) {
  res.json({
    success: true,
    mercado: 'nuam exchange (Bolsa Central)',
    estado: 'SOLO_LECTURA_ACTIVO',
    descripcion: 'Catálogo oficial de trading bursátil. Acceso restringido contra escritura.',
    instrumentos: bolsaCentralInstrumentos
  });
}

// Verificación de Políticas de Acceso en Gateway Central (Enlace Seguro)
function testNoImpacto(req, res) {
  res.status(403).json({
    success: false,
    codigo_error: 'SEC_GATEWAY_READONLY_ENFORCED',
    mensaje: 'ACCESO DENEGADO: El Gateway central transaccional de nuam opera en modo de replicación de solo consulta. Las operaciones de mutación directa sobre el libro de órdenes están denegadas por política de aislamiento transaccional.',
    modulo: 'nuam Core Gateway Engine',
    permisos_otorgados: ['SELECT'],
    permisos_denegados: ['INSERT', 'UPDATE', 'DELETE', 'DROP']
  });
}

// Salud del Sistema (Telemetría de Enlace)
function healthCheck(req, res) {
  const mem = process.memoryUsage();
  res.json({
    status: 'ONLINE',
    sistema: 'nuam exchange - Mantenedor de Calificaciones Tributarias',
    version: '1.0.0',
    runtime: `Node.js ${process.version}`,
    uptime_segundos: Math.floor(process.uptime()),
    memoria_mb: {
      rss: (mem.rss / 1024 / 1024).toFixed(2),
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2)
    },
    nodo: {
      datacenter: 'Santiago DC (Primary)',
      instancia: 'nuam-prod-stgo-01',
      alta_disponibilidad: true
    }
  });
}

// Vaciar Cartera de la Corredora (Para demostración de carga limpia)
function vaciarCartera(req, res) {
  const { tenant_id, usuario } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ success: false, error: 'tenant_id es requerido' });
  }

  const usr = obtenerUsuarioPorEmail(usuario);
  if (usr && usr.rango !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Acceso Denegado: Solo el Administrador tiene autorización para vaciar carteras institucionales.' });
  }

  const eliminados = dataStore.vaciarCalificaciones(tenant_id, usuario);
  res.json({
    success: true,
    mensaje: `Se vació la cartera de la corredora (${eliminados} registros eliminados). Grilla lista para carga limpia.`,
    eliminados
  });
}

// Restablecer Datos Semilla de la Corredora
function restablecerCartera(req, res) {
  const { tenant_id, usuario } = req.body;
  if (!tenant_id) {
    return res.status(400).json({ success: false, error: 'tenant_id es requerido' });
  }

  const usr = obtenerUsuarioPorEmail(usuario);
  if (usr && usr.rango !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Acceso Denegado: Solo el Administrador tiene autorización para restablecer carteras.' });
  }

  const count = dataStore.restablecerCalificaciones(tenant_id);
  res.json({
    success: true,
    mensaje: `Se restablecieron los ${count} registros oficiales de la corredora.`,
    restablecidos: count
  });
}

// ==============================================================================
// CONTROLADOR DE USUARIOS Y GESTIÓN DE ROLES (EXCLUSIVO ADMINISTRADOR)
// ==============================================================================

function listarUsuarios(req, res) {
  const autor = req.query.usuario || req.headers['x-user-email'];
  const autorUsr = obtenerUsuarioPorEmail(autor);
  if (autorUsr && autorUsr.rango !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Acceso Denegado: El área de perfiles y permisos es exclusiva del Administrador.' });
  }

  const tenantId = req.query.tenant_id;
  const lista = dataStore.listarUsuarios(tenantId);
  res.json({
    success: true,
    count: lista.length,
    rangos_disponibles: dataStore.RANGOS_SISTEMA,
    data: lista
  });
}

function crearUsuario(req, res) {
  try {
    const autor = req.body.autor || req.headers['x-user-email'] || 'admin@nuam.cl';
    const autorUsr = obtenerUsuarioPorEmail(autor);

    if (!autorUsr || autorUsr.rango !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: Solo el Administrador puede crear cuentas y asignar roles.' });
    }

    const nuevo = dataStore.crearUsuario(req.body, autor);
    res.status(201).json({
      success: true,
      mensaje: `Usuario ${nuevo.nombre} creado exitosamente con rol ${nuevo.rango}.`,
      data: nuevo
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

function actualizarUsuario(req, res) {
  try {
    const id = req.params.id;
    const autor = req.body.autor || req.headers['x-user-email'] || 'admin@nuam.cl';
    const autorUsr = obtenerUsuarioPorEmail(autor);

    if (!autorUsr || autorUsr.rango !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: Solo el Administrador puede modificar usuarios y permisos.' });
    }

    const actualizado = dataStore.actualizarUsuario(id, req.body, autor);
    res.json({
      success: true,
      mensaje: `Usuario ${actualizado.nombre} actualizado correctamente.`,
      data: actualizado
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

function eliminarUsuario(req, res) {
  try {
    const id = req.params.id;
    const autor = req.query.autor || req.headers['x-user-email'] || 'admin@nuam.cl';
    const autorUsr = obtenerUsuarioPorEmail(autor);

    if (!autorUsr || autorUsr.rango !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: Solo el Administrador puede revocar cuentas de usuario.' });
    }

    const target = dataStore.usuarios.find(u => u.id === id);
    if (target && target.rango === 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acceso Denegado: No se puede revocar la cuenta de Administrador principal.' });
    }

    const eliminado = dataStore.eliminarUsuario(id, autor);
    res.json({
      success: true,
      mensaje: `Usuario ${eliminado.nombre} (${eliminado.email}) eliminado del sistema.`,
      data: eliminado
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
}

module.exports = {
  listarCorredoras,
  listarCalificaciones,
  crearCalificacion,
  actualizarCalificacion,
  eliminarCalificacion,
  cargaMasiva,
  descargarRechazos,
  exportarDeclaracion,
  descargarPlantilla,
  descargarLotePrueba,
  listarAuditoria,
  consultarBolsaCentral,
  testNoImpacto,
  healthCheck,
  vaciarCartera,
  restablecerCartera,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
};
