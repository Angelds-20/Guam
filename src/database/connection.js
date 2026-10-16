/**
 * Conexión SQLite (better-sqlite3) con configuración de integridad y rendimiento.
 * - WAL: lecturas concurrentes con escrituras.
 * - foreign_keys: integridad referencial entre corredoras/usuarios/declaraciones.
 * - busy_timeout: reintenta ante bloqueos transitorios.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SQLITE_FILE = process.env.SQLITE_FILE || path.join(__dirname, '..', 'data', 'nuam_tributario.sqlite');

let db = null;

function getDb() {
  if (db) return db;

  const dir = path.dirname(SQLITE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(SQLITE_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

function closeDb() {
  if (db) {
    try {
      db.close();
    } finally {
      db = null;
    }
  }
}

module.exports = { getDb, closeDb, SQLITE_FILE };
