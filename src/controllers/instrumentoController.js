/**
 * Controlador del catálogo de instrumentos de la Bolsa Central - nuam exchange.
 * CRUD protegido: consulta (instrumentos:view) y gestión (instrumentos:manage).
 */
const instrumentoService = require('../services/instrumentoService');
const auditService = require('../services/auditService');
const { ok } = require('../utils/response');
const { getClientIp } = require('../utils/ip');

/**
 * GET /api/instrumentos
 */
async function listar(req, res) {
  const data = instrumentoService.listar();
  return ok(res, data, { meta: { total: data.length } });
}

/**
 * POST /api/instrumentos
 */
async function crear(req, res) {
  const data = instrumentoService.crear(req.body);
  auditService.registrar({
    usuario: req.user,
    accion: 'INSTRUMENTO_CREAR',
    entidad: 'INSTRUMENTO',
    entidadId: data.nemotecnico,
    tenant: req.user.tenant_id,
    ip: getClientIp(req),
    detalle: `Registro instrumento ${data.nemotecnico} (${data.razon_social})`,
  });
  return ok(res, data, { status: 201 });
}

/**
 * PUT /api/instrumentos/:nemotecnico
 */
async function actualizar(req, res) {
  const data = instrumentoService.actualizar(req.params.nemotecnico, req.body);
  auditService.registrar({
    usuario: req.user,
    accion: 'INSTRUMENTO_ACTUALIZAR',
    entidad: 'INSTRUMENTO',
    entidadId: data.nemotecnico,
    tenant: req.user.tenant_id,
    ip: getClientIp(req),
    detalle: `Actualización instrumento ${data.nemotecnico}`,
  });
  return ok(res, data);
}

/**
 * DELETE /api/instrumentos/:nemotecnico
 */
async function eliminar(req, res) {
  const data = instrumentoService.eliminar(req.params.nemotecnico);
  auditService.registrar({
    usuario: req.user,
    accion: 'INSTRUMENTO_ELIMINAR',
    entidad: 'INSTRUMENTO',
    entidadId: data.nemotecnico,
    tenant: req.user.tenant_id,
    ip: getClientIp(req),
    detalle: `Baja de instrumento bursátil ${data.nemotecnico}`,
  });
  return ok(res, data);
}

module.exports = { listar, crear, actualizar, eliminar };
