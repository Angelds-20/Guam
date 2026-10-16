/**
 * Controlador del catálogo institucional - nuam exchange.
 * Listado de corredoras de bolsa participantes (multi-tenant).
 */
const catalogoService = require('../services/catalogoService');
const { ok } = require('../utils/response');

/**
 * GET /api/corredoras
 */
async function listarCorredoras(req, res) {
  const data = catalogoService.listarCorredoras();
  return ok(res, data, { meta: { total: data.length } });
}

module.exports = { listarCorredoras };
