/**
 * Servicio de catálogo: corredoras de bolsa (multi-tenant).
 */
const { getDb } = require('../database/connection');

function listarCorredoras() {
  const db = getDb();
  return db
    .prepare(`SELECT id, codigo, nombre, pais, mercado, activo FROM corredoras ORDER BY nombre`)
    .all();
}

module.exports = { listarCorredoras };
