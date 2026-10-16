/**
 * Controlador de autenticación - nuam exchange.
 * Endpoints de sesión: inicio de sesión, perfil actual y cierre de sesión.
 */
const authService = require('../services/authService');
const auditService = require('../services/auditService');
const configAuth = require('../config/auth');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/response');
const { getClientIp } = require('../utils/ip');
const { registrarFallo, estaBloqueado, reiniciar } = require('../middlewares/rateLimit');

/**
 * POST /api/auth/login
 * Valida credenciales y emite un token JWT (también como cookie httpOnly).
 */
async function login(req, res) {
  const { email, password } = req.body || {};

  if (estaBloqueado(req, email)) {
    throw new AppError(429, 'RATE_LIMITED', 'Demasiados intentos fallidos. Intente nuevamente en 15 minutos.');
  }

  let resultado;
  try {
    resultado = authService.login({ email, password });
  } catch (err) {
    if (err instanceof AppError && err.code === 'CREDENCIALES_INVALIDAS') {
      registrarFallo(req, email);
    }
    throw err;
  }

  const { token, usuario } = resultado;
  reiniciar(req, email);

  res.cookie(configAuth.COOKIE_NAME, token, {
    httpOnly: true,
    secure: configAuth.COOKIE_SECURE,
    sameSite: configAuth.COOKIE_SAME_SITE,
    maxAge: configAuth.JWT_EXPIRES_SECONDS * 1000,
  });

  auditService.registrar({
    usuario,
    accion: 'LOGIN',
    entidad: 'SESION',
    tenant: usuario.tenant_id,
    detalle: 'Inicio de sesión exitoso en terminal B2B',
    ip: getClientIp(req),
  });

  return ok(res, { token, usuario });
}

/**
 * POST /api/auth/logout
 * Cierra la sesión actual invalidando la cookie en el navegador.
 */
async function logout(req, res) {
  if (req.user) {
    auditService.registrar({
      usuario: req.user,
      accion: 'LOGOUT',
      entidad: 'SESION',
      tenant: req.user.tenant_id,
      detalle: 'Cierre de sesión voluntario',
      ip: getClientIp(req),
    });
  }
  res.clearCookie(configAuth.COOKIE_NAME, {
    httpOnly: true,
    secure: configAuth.COOKIE_SECURE,
    sameSite: configAuth.COOKIE_SAME_SITE,
  });
  return ok(res, { mensaje: 'Sesión cerrada correctamente.' });
}

/**
 * GET /api/auth/me
 * Devuelve el perfil del usuario autenticado (req.user se resuelve en requireAuth).
 */
async function me(req, res) {
  return ok(res, { usuario: req.user });
}

module.exports = { login, logout, me };
