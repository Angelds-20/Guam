/**
 * Envuelve controladores asíncronos para que los errores (rechazos de promesa)
 * se propaguen al manejador global de errores sin bloquear el hilo.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
