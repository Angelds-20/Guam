/**
 * Resolución de la dirección IP real del cliente, considerando la cadena de
 * proxies/balanceadores de carga típica en despliegues (Cloudflare / nginx / ELB).
 */
function getClientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();

  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();

  const real = req.headers['x-real-ip'];
  if (real) return String(real).trim();

  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { getClientIp };
