/**
 * Error operacional de negocio con código estructurado para la API REST.
 * El manejador global de errores lo traduce a `{ success:false, error:{ code, message } }`.
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
