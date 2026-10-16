/**
 * Punto de entrada de la capa de persistencia.
 * Orden de inicialización: conexión -> esquema -> migración -> seed.
 */
const fs = require('fs');
const path = require('path');
const { getDb } = require('./connection');
const { migrar } = require('./migrate');
const { ejecutarSeed } = require('./seed');

let inicializada = false;

function inicializarBaseDeDatos() {
  if (inicializada) return getDb();

  const db = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  migrar();
  ejecutarSeed();
  inicializada = true;
  return db;
}

module.exports = { inicializarBaseDeDatos, getDb };
