/**
 * Controlador del Registro Oficial de Auditoría - nuam exchange.
 * Consulta de eventos de negocio con filtros (fecha, acción, entidad, usuario).
 */
const auditService = require('../services/auditService');
const { ok } = require('../utils/response');

/**
 * GET /api/auditoria?desde=&hasta=&accion=&entidad=&usuario=&limite=
 */
async function listar(req, res) {
  const { desde, hasta, accion, entidad, usuario, limite } = req.query;
  const data = auditService.listar({ desde, hasta, accion, entidad, usuario, limite });
  return ok(res, data, { meta: { total: data.length } });
}

module.exports = { listar };
