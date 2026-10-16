/**
 * Configuración de autenticación y seguridad - nuam exchange.
 * Los secretos y valores sensibles provienen de variables de entorno (.env).
 */

function duracionSegundos(valor) {
  if (typeof valor === 'number') return valor;
  const m = /^(\d+)([smhd])$/i.exec(String(valor || '').trim());
  if (!m) return 28800; // 8 horas por defecto
  const n = parseInt(m[1], 10);
  const unidades = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (unidades[m[2].toLowerCase()] || 1);
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'cambiar-este-secreto-en-produccion-nuam',
  JWT_EXPIRES_IN,
  JWT_EXPIRES_SECONDS: duracionSegundos(JWT_EXPIRES_IN),
  COOKIE_NAME: process.env.COOKIE_NAME || 'nuam_session',
  COOKIE_SECURE: String(process.env.COOKIE_SECURE || 'false') === 'true',
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || 'lax',
  // Límite de intentos de inicio de sesión fallidos por IP/correo.
  RATE_LIMIT_MAX_ATTEMPTS: parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS || '5', 10),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
};
