/**
 * Servicio de autenticación: inicio de sesión, emisión y verificación de JWT.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/connection');
const configAuth = require('../config/auth');
const AppError = require('../utils/AppError');

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanearUsuario(usuario) {
  const permisos = (() => {
    try {
      return JSON.parse(usuario.permissions || '[]');
    } catch {
      return [];
    }
  })();
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    cargo: usuario.cargo || '',
    permissions: permisos,
    tenant_id: usuario.tenant_id,
    activo: usuario.activo === 1,
  };
}

/**
 * Valida credenciales y devuelve un token JWT junto al perfil del usuario.
 * Lanza AppError 401 si el correo no existe, la contraseña es incorrecta o la cuenta está inactiva.
 */
function login({ email, password }) {
  const correo = normalizarEmail(email);
  const db = getDb();
  const usuario = db
    .prepare(
      `SELECT id, tenant_id, nombre, email, cargo, password_hash, rol, permissions, activo
         FROM usuarios WHERE lower(email) = ?`
    )
    .get(correo);

  if (!usuario || !bcrypt.compareSync(password || '', usuario.password_hash)) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');
  }
  if (usuario.activo !== 1) {
    throw new AppError(403, 'USUARIO_INACTIVO', 'La cuenta no se encuentra activa. Contacte al administrador.');
  }

  const token = crearToken(usuario);
  return { token, usuario: sanearUsuario(usuario) };
}

function crearToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, email: usuario.email, rol: usuario.rol },
    configAuth.JWT_SECRET,
    { expiresIn: configAuth.JWT_EXPIRES_IN }
  );
}

function verificarToken(token) {
  return jwt.verify(token, configAuth.JWT_SECRET);
}

module.exports = { login, crearToken, verificarToken, sanearUsuario, normalizarEmail };
