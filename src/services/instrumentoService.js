/**
 * Servicio de instrumentos de la Bolsa Central (CRUD).
 * La clave natural es el nemotécnico bursátil.
 */
const { getDb } = require('../database/connection');
const AppError = require('../utils/AppError');

const NEMOTECNICO_REGEX = /^[A-Z0-9][A-Z0-9.\-]{1,19}$/;

function listar() {
  const db = getDb();
  return db
    .prepare(`SELECT nemotecnico, razon_social, mercado, activo FROM bolsa_central_instrumentos ORDER BY nemotecnico`)
    .all();
}

function crear({ nemotecnico, razon_social, mercado }) {
  const db = getDb();
  const nem = String(nemotecnico || '').trim().toUpperCase();

  if (!NEMOTECNICO_REGEX.test(nem)) {
    throw new AppError(400, 'NEMOTECNICO_INVALIDO', 'El nemotécnico no tiene un formato válido.');
  }
  if (!razon_social) {
    throw new AppError(400, 'DATOS_INCOMPLETOS', 'La razón social del instrumento es obligatoria.');
  }

  const existente = db.prepare('SELECT nemotecnico FROM bolsa_central_instrumentos WHERE nemotecnico = ?').get(nem);
  if (existente) {
    throw new AppError(409, 'NEMOTECNICO_DUPLICADO', 'Ya existe un instrumento con ese nemotécnico.');
  }

  db.prepare(
    `INSERT INTO bolsa_central_instrumentos (nemotecnico, razon_social, mercado)
     VALUES (@nemotecnico, @razon_social, @mercado)`
  ).run({ nemotecnico: nem, razon_social, mercado: mercado || 'Renta Variable' });

  return db.prepare('SELECT nemotecnico, razon_social, mercado, activo FROM bolsa_central_instrumentos WHERE nemotecnico = ?').get(nem);
}

function actualizar(nemotecnico, cambios) {
  const db = getDb();
  const existente = db
    .prepare('SELECT * FROM bolsa_central_instrumentos WHERE nemotecnico = ?')
    .get(String(nemotecnico || '').toUpperCase());
  if (!existente) {
    throw new AppError(404, 'INSTRUMENTO_NO_ENCONTRADO', 'El instrumento no existe.');
  }

  const razon_social = cambios.razon_social !== undefined ? cambios.razon_social : existente.razon_social;
  const mercado = cambios.mercado !== undefined ? cambios.mercado : existente.mercado;
  const activo = cambios.activo !== undefined ? (cambios.activo ? 1 : 0) : existente.activo;

  db.prepare(
    `UPDATE bolsa_central_instrumentos
     SET razon_social = @razon_social, mercado = @mercado, activo = @activo
     WHERE nemotecnico = @nemotecnico`
  ).run({ razon_social, mercado, activo, nemotecnico: existente.nemotecnico });

  return db.prepare('SELECT nemotecnico, razon_social, mercado, activo FROM bolsa_central_instrumentos WHERE nemotecnico = ?').get(existente.nemotecnico);
}

function eliminar(nemotecnico) {
  const db = getDb();
  const existente = db
    .prepare('SELECT nemotecnico FROM bolsa_central_instrumentos WHERE nemotecnico = ?')
    .get(String(nemotecnico || '').toUpperCase());
  if (!existente) {
    throw new AppError(404, 'INSTRUMENTO_NO_ENCONTRADO', 'El instrumento no existe.');
  }
  db.prepare('DELETE FROM bolsa_central_instrumentos WHERE nemotecnico = ?').run(existente.nemotecnico);
  return { nemotecnico: existente.nemotecnico };
}

module.exports = { listar, crear, actualizar, eliminar };
