/**
 * Limitador de intentos de inicio de sesión (por IP y por correo).
 * Al superar el umbral responde HTTP 429 con código RATE_LIMITED.
 * Almacenamiento en memoria (Map) adecuado para una instancia de la API.
 */
const { getClientIp } = require('../utils/ip');
const configAuth = require('../config/auth');

const intentos = new Map();

function normalizarCorreo(email) {
  return String(email || '').trim().toLowerCase();
}

function registrarFallo(req, email) {
  const ip = getClientIp(req);
  const correo = normalizarCorreo(email);
  const ahora = Date.now();
  const ventana = configAuth.RATE_LIMIT_WINDOW_MS;

  for (const clave of [ip, correo]) {
    if (!clave) continue;
    let entrada = intentos.get(clave);
    if (!entrada || ahora - entrada.inicio > ventana) {
      entrada = { inicio: ahora, conteo: 0 };
      intentos.set(clave, entrada);
    }
    entrada.conteo += 1;
  }
}

function estaBloqueado(req, email) {
  const ip = getClientIp(req);
  const correo = normalizarCorreo(email);
  const ahora = Date.now();
  const ventana = configAuth.RATE_LIMIT_WINDOW_MS;

  for (const clave of [ip, correo]) {
    if (!clave) continue;
    const entrada = intentos.get(clave);
    if (entrada && ahora - entrada.inicio <= ventana && entrada.conteo >= configAuth.RATE_LIMIT_MAX_ATTEMPTS) {
      return true;
    }
  }
  return false;
}

function limpiar(clave) {
  if (clave) intentos.delete(clave);
}

function reiniciar(req, email) {
  limpiar(getClientIp(req));
  limpiar(normalizarCorreo(email));
}

module.exports = { registrarFallo, estaBloqueado, reiniciar };
