/**
 * Migración del esquema SQLite vía PRAGMA user_version.
 *
 * Estrategia:
 *  - Migración idempotente de columnas (añade password_hash/rol/permissions/activo
 *    a bases de datos legadas que carecen de ellas).
 *  - v0 -> v1: depuración controlada del modelo heredado (usuarios, declaraciones
 *    y auditoría de versiones previas) y re-seed del catálogo canónico.
 */
const { getDb } = require('./connection');

function tieneColumna(db, tabla, columna) {
  const cols = db.prepare(`PRAGMA table_info(${tabla})`).all();
  return cols.some((c) => c.name === columna);
}

function migrarColumnas(db) {
  const adiciones = {
    usuarios: ['password_hash', 'rol', 'permissions', 'activo'],
  };
  for (const [tabla, columnas] of Object.entries(adiciones)) {
    for (const columna of columnas) {
      if (!tieneColumna(db, tabla, columna)) {
        if (columna === 'permissions') {
          db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} TEXT NOT NULL DEFAULT '[]'`);
        } else if (columna === 'activo') {
          db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} INTEGER NOT NULL DEFAULT 1`);
        } else {
          db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} TEXT`);
        }
      }
    }
  }
}

/**
 * Borra los datos heredados de versiones previas del modelo para evitar contaminación.
 * Se ejecuta una sola vez (cuando user_version < 1).
 */
function limpiarLegado(db) {
  const migrar = db.transaction(() => {
    db.prepare('DELETE FROM factores_detalle').run();
    db.prepare('DELETE FROM calificaciones_tributarias').run();
    db.prepare('DELETE FROM usuarios').run();
    db.prepare('DELETE FROM auditoria_eventos').run();
    db.prepare('PRAGMA user_version = 1').run();
  });
  migrar();
}

function migrar() {
  const db = getDb();
  const { user_version: version } = db.prepare('PRAGMA user_version').get();

  migrarColumnas(db);
  if (version < 1) {
    limpiarLegado(db);
  }
  return version;
}

module.exports = { migrar, tieneColumna };
