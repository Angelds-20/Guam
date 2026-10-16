/**
 * Controlador de gestión de usuarios (CRUD) - nuam exchange.
 * Protegido por el permiso users:manage (rol ADMIN_NUAM).
 */
const userService = require('../services/userService');
const auditService = require('../services/auditService');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { getClientIp } = require('../utils/ip');

/**
 * GET /api/usuarios
 */
async function listar(req, res) {
  const data = userService.listar();
  return ok(res, data, { meta: { total: data.length } });
}

/**
 * GET /api/usuarios/:id
 */
async function obtenerPorId(req, res) {
  const data = userService.obtenerPorId(req.params.id);
  if (!data) {
    throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'Usuario institucional no encontrado.');
  }
  return ok(res, data);
}

/**
 * POST /api/usuarios
 */
async function crear(req, res) {
  const data = userService.crear(req.body);
  auditService.registrar({
    usuario: req.user,
    accion: 'USUARIO_CREAR',
    entidad: 'USUARIO',
    entidadId: data.id,
    tenant: data.tenant_id,
    ip: getClientIp(req),
    detalle: JSON.stringify({ email: data.email, rol: data.rol }),
  });
  return ok(res, data, { status: 201 });
}

/**
 * PUT /api/usuarios/:id
 */
async function actualizar(req, res) {
  const data = userService.actualizar(req.params.id, req.body);
  auditService.registrar({
    usuario: req.user,
    accion: 'USUARIO_ACTUALIZAR',
    entidad: 'USUARIO',
    entidadId: data.id,
    tenant: data.tenant_id,
    ip: getClientIp(req),
    detalle: JSON.stringify({ email: data.email, rol: data.rol }),
  });
  return ok(res, data);
}

/**
 * DELETE /api/usuarios/:id
 */
async function eliminar(req, res) {
  const data = userService.eliminar(req.params.id, req.user.id);
  auditService.registrar({
    usuario: req.user,
    accion: 'USUARIO_ELIMINAR',
    entidad: 'USUARIO',
    entidadId: data.id,
    tenant: req.user.tenant_id,
    ip: getClientIp(req),
    detalle: JSON.stringify({ email: data.email, nombre: data.nombre }),
  });
  return ok(res, data);
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
