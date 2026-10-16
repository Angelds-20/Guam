/**
 * Autenticación: exige un token JWT válido (Authorization: Bearer o cookie httpOnly).
 * Resuelve al usuario vigente desde la base de datos en cada petición, de modo que
 * una desactivación o cambio de rol surte efecto inmediato.
 */
const authService = require('../services/authService');
const { getDb } = require('../database/connection');
const AppError = require('../utils/AppError');

function extraerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const par of cabecera.split(';')) {
    const [clave, ...resto] = par.trim().split('=');
    if (clave === nombre) return decodeURIComponent(resto.join('='));
  }
  return null;
}

function extraerToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const configAuth = require('../config/auth');
  const cookieToken = extraerCookie(req, configAuth.COOKIE_NAME);
  if (cookieToken) return cookieToken;
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function requireAuth(req, res, next) {
  const token = extraerToken(req);
  if (!token) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Autenticación requerida. Inicie sesión para continuar.'));
  }

  let payload;
  try {
    payload = authService.verificarToken(token);
  } catch {
    return next(new AppError(401, 'TOKEN_INVALIDO', 'Sesión inválida o expirada. Inicie sesión nuevamente.'));
  }

  const db = getDb();
  const usuario = db
    .prepare(`SELECT id, tenant_id, nombre, email, cargo, rol, permissions, activo FROM usuarios WHERE id = ?`)
    .get(payload.sub);

  if (!usuario || usuario.activo !== 1) {
    return next(new AppError(401, 'USUARIO_INACTIVO', 'La cuenta no se encuentra activa.'));
  }

  try {
    usuario.permissions = JSON.parse(usuario.permissions || '[]');
  } catch {
    usuario.permissions = [];
  }

  req.user = usuario;
  next();
}

module.exports = { requireAuth, extraerToken };
