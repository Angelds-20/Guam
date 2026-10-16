/**
 * Controlador de estado del servicio - nuam exchange.
 * Sondeo de disponibilidad para balanceadores y monitoreo.
 */
const { getDb } = require('../database/connection');
const { ok } = require('../utils/response');

const inicio = Date.now();

/**
 * GET /api/health
 */
async function health(req, res) {
  let db = 'ok';
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    db = 'error';
  }

  return ok(res, {
    estado: 'activo',
    servicio: 'nuam-exchange-intranet',
    baseDeDatos: db,
    uptimeSegundos: Math.floor((Date.now() - inicio) / 1000),
  });
}

module.exports = { health };
