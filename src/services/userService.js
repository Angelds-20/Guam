/**
 * Servicio de gestión de usuarios (CRUD) con roles RBAC.
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/connection');
const { ROLES, LISTA_PERMISOS } = require('../config/roles');
const AppError = require('../utils/AppError');
const { normalizarEmail } = require('./authService');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarRol(rol) {
  return Object.values(ROLES).includes(rol);
}

function validarPermisos(permissions) {
  if (!Array.isArray(permissions)) return false;
  return permissions.every((p) => LISTA_PERMISOS.includes(p));
}

function serializar(usuario) {
  return { ...usuario, permissions: JSON.parse(usuario.permissions || '[]') };
}

function listar() {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, tenant_id, nombre, email, rol, permissions, cargo, activo, created_at
       FROM usuarios ORDER BY email`
    )
    .all()
    .map(serializar);
}

function obtenerPorId(id) {
  const db = getDb();
  const u = db
    .prepare(
      `SELECT id, tenant_id, nombre, email, rol, permissions, cargo, activo, created_at
       FROM usuarios WHERE id = ?`
    )
    .get(id);
  return u ? serializar(u) : null;
}

function crear({ nombre, email, password, rol, tenant_id, permissions, cargo, activo }) {
  const db = getDb();
  const correo = normalizarEmail(email);

  if (!nombre || !correo || !password) {
    throw new AppError(400, 'DATOS_INCOMPLETOS', 'Nombre, correo y contraseña son obligatorios.');
  }
  if (!EMAIL_REGEX.test(correo)) {
    throw new AppError(400, 'EMAIL_INVALIDO', 'El correo no tiene un formato válido.');
  }
  if (!validarRol(rol)) {
    throw new AppError(400, 'ROL_INVALIDO', `El rol '${rol}' no es válido.`);
  }
  const permisos = permissions || [];
  if (!validarPermisos(permisos)) {
    throw new AppError(400, 'PERMISOS_INVALIDOS', 'La lista de permisos contiene claves no reconocidas.');
  }
  if (!tenant_id) {
    throw new AppError(400, 'CORREDORA_REQUERIDA', 'Debe indicar la corredora (tenant_id) del usuario.');
  }
  const corredora = db.prepare('SELECT id FROM corredoras WHERE id = ?').get(tenant_id);
  if (!corredora) {
    throw new AppError(400, 'CORREDORA_INVALIDA', `La corredora '${tenant_id}' no existe.`);
  }

  const existente = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(correo);
  if (existente) {
    throw new AppError(409, 'EMAIL_DUPLICADO', 'Ya existe un usuario con ese correo.');
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permissions, cargo, activo)
     VALUES (@id, @tenant_id, @nombre, @email, @password_hash, @rol, @permissions, @cargo, @activo)`
  ).run({
    id,
    tenant_id,
    nombre,
    email: correo,
    password_hash: bcrypt.hashSync(password, 10),
    rol,
    permissions: JSON.stringify(permisos),
    cargo: cargo || '',
    activo: activo === false ? 0 : 1,
  });

  return serializar(
    db.prepare(`SELECT id, tenant_id, nombre, email, rol, permissions, cargo, activo, created_at FROM usuarios WHERE id = ?`).get(id)
  );
}

function actualizar(id, cambios) {
  const db = getDb();
  const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!existente) {
    throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
  }

  const nombre = cambios.nombre !== undefined ? cambios.nombre : existente.nombre;
  const rol = cambios.rol !== undefined ? cambios.rol : existente.rol;
  const permissions = cambios.permissions !== undefined ? cambios.permissions : JSON.parse(existente.permissions || '[]');
  const tenant_id = cambios.tenant_id !== undefined ? cambios.tenant_id : existente.tenant_id;
  const cargo = cambios.cargo !== undefined ? cambios.cargo : existente.cargo;
  const activo = cambios.activo !== undefined ? (cambios.activo ? 1 : 0) : existente.activo;

  if (!validarRol(rol)) {
    throw new AppError(400, 'ROL_INVALIDO', `El rol '${rol}' no es válido.`);
  }
  if (!validarPermisos(permissions)) {
    throw new AppError(400, 'PERMISOS_INVALIDOS', 'La lista de permisos contiene claves no reconocidas.');
  }
  if (!tenant_id) {
    throw new AppError(400, 'CORREDORA_REQUERIDA', 'Debe indicar la corredora (tenant_id) del usuario.');
  }
  const corredora = db.prepare('SELECT id FROM corredoras WHERE id = ?').get(tenant_id);
  if (!corredora) {
    throw new AppError(400, 'CORREDORA_INVALIDA', `La corredora '${tenant_id}' no existe.`);
  }

  db.prepare(
    `UPDATE usuarios SET nombre = @nombre, rol = @rol, permissions = @permissions,
       tenant_id = @tenant_id, cargo = @cargo, activo = @activo
     WHERE id = @id`
  ).run({ id, nombre, rol, permissions: JSON.stringify(permissions), tenant_id, cargo, activo });

  if (cambios.password) {
    db.prepare(`UPDATE usuarios SET password_hash = @hash WHERE id = @id`).run({
      id,
      hash: bcrypt.hashSync(cambios.password, 10),
    });
  }

  return serializar(
    db.prepare(`SELECT id, tenant_id, nombre, email, rol, permissions, cargo, activo, created_at FROM usuarios WHERE id = ?`).get(id)
  );
}

function eliminar(id, solicitanteId) {
  const db = getDb();
  const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!existente) {
    throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
  }
  if (id === solicitanteId) {
    throw new AppError(400, 'AUTO_ELIMINACION', 'No puede eliminar su propia cuenta.');
  }
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  return { id };
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
