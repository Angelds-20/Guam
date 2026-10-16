/**
 * Controlador de declaraciones tributarias - nuam exchange.
 * Capa HTTP delgada: resuelve el alcance multi-tenant y delega en el servicio
 * de negocio. Los roles globales (ADMIN_NUAM, OFICIAL_CUMPLIMIENTO, REGULADOR_CMF)
 * pueden indicar la corredora (tenant) mediante query/body; los operadores quedan
 * restringidos a su propia corredora.
 */
const tributarioService = require('../services/tributarioService');
const auditService = require('../services/auditService');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { getClientIp } = require('../utils/ip');
const { esRolGlobal } = require('../config/roles');

/**
 * Resuelve el tenant efectivo de la petición:
 * - Rol global: toma el tenant indicado (query o body) o null (todas las corredoras).
 * - Operador de corredora: queda fijado a su tenant_id.
 */
function resolverTenant(req) {
  if (esRolGlobal(req.user.rol)) {
    const t = req.query.tenant || (req.body && req.body.tenant_id);
    if (t && t !== 'GLOBAL' && t !== 'null' && t !== 'undefined') return t;
    if (req.params && req.params.id) {
      try {
        const db = require('../database/connection').getDb();
        const cal = db.prepare('SELECT tenant_id FROM calificaciones_tributarias WHERE id = ?').get(req.params.id);
        if (cal && cal.tenant_id) return cal.tenant_id;
      } catch (_) {}
    }
    return null;
  }
  return req.user.tenant_id;
}

function exigirTenant(tenant) {
  if (!tenant) {
    throw new AppError(400, 'CORREDORA_REQUERIDA', 'Debe indicar la corredora (tenant) sobre la que se opera.');
  }
  return tenant;
}

/**
 * GET /api/declaraciones?q=&tenant=
 */
async function listar(req, res) {
  const filtro = req.query.q || req.query.filtro || '';
  const data = tributarioService.obtenerCalificaciones(resolverTenant(req), filtro);
  return ok(res, data, { meta: { total: data.length } });
}

/**
 * GET /api/declaraciones/:id
 */
async function obtenerPorId(req, res) {
  const data = tributarioService.obtenerPorId(req.params.id, resolverTenant(req));
  if (!data) {
    throw new AppError(404, 'DECLARACION_NO_ENCONTRADA', 'Declaración tributaria no encontrada.');
  }
  return ok(res, data);
}

/**
 * POST /api/declaraciones
 */
async function crear(req, res) {
  const tenant = exigirTenant(resolverTenant(req));
  const data = tributarioService.crearCalificacion(tenant, req.body, req.user, getClientIp(req));
  return ok(res, data, { status: 201 });
}

/**
 * PUT /api/declaraciones/:id
 */
async function actualizar(req, res) {
  const tenant = exigirTenant(resolverTenant(req));
  const data = tributarioService.actualizarCalificacion(tenant, req.params.id, req.body, req.user, getClientIp(req));
  return ok(res, data);
}

/**
 * DELETE /api/declaraciones/:id
 */
async function eliminar(req, res) {
  const tenant = exigirTenant(resolverTenant(req));
  const data = tributarioService.eliminarCalificacion(tenant, req.params.id, req.user, getClientIp(req));
  return ok(res, data);
}

/**
 * POST /api/declaraciones/carga-masiva (multipart/form-data, campo "archivo")
 */
async function cargaMasiva(req, res) {
  if (!req.file) {
    throw new AppError(400, 'ARCHIVO_REQUERIDO', 'Debe adjuntar un archivo CSV o XLSX en el campo "archivo".');
  }
  const tenant = exigirTenant(resolverTenant(req));
  const resultado = tributarioService.procesarCargaMasiva(
    tenant,
    req.file.buffer,
    req.file.originalname,
    req.user,
    getClientIp(req)
  );
  return ok(res, resultado);
}

/**
 * GET /api/declaraciones/carga-masiva/rechazos/:batchId
 * Descarga del log CSV de filas rechazadas de una carga masiva.
 */
async function rechazos(req, res) {
  const csv = tributarioService.generarCsvRechazos(req.params.batchId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rechazos_${req.params.batchId}.csv"`);
  return res.send(csv);
}

/**
 * GET /api/declaraciones/exportar?formato=csv|xlsx&tenant=
 * Exportación oficial de la Declaración Consolidada.
 */
async function exportar(req, res) {
  const formato = String(req.query.formato || 'xlsx').toLowerCase();
  const tenant = resolverTenant(req);

  auditService.registrar({
    usuario: req.user,
    accion: 'EXPORTAR',
    entidad: 'DECLARACION_TRIBUTARIA',
    tenant,
    detalle: `Exportación consolidada de cartera en formato ${formato.toUpperCase()}`,
    ip: getClientIp(req),
  });

  if (formato === 'xlsx') {
    const buffer = tributarioService.exportarDeclaracionExcel(tenant);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="declaracion_consolidada.xlsx"');
    return res.send(buffer);
  }

  const csv = tributarioService.exportarDeclaracionOficial(tenant);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="declaracion_consolidada.csv"');
  return res.send(csv);
}

/**
 * GET /api/declaraciones/plantilla
 * Descarga la plantilla oficial (.xlsx) para la carga masiva.
 */
async function plantilla(req, res) {
  const buffer = tributarioService.generarPlantillaExcel();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla_declaraciones_nuam.xlsx"');
  return res.send(buffer);
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, cargaMasiva, rechazos, exportar, plantilla };
