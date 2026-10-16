/**
 * Manejador global de errores. Traduce los distintos tipos de error a la envoltura
 * REST estándar `{ success:false, error:{ code, message } }`.
 */
const multer = require('multer');
const AppError = require('../utils/AppError');
const { fail } = require('../utils/response');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Error operacional de negocio (AppError).
  if (err instanceof AppError) {
    return fail(res, { status: err.status, code: err.code, message: err.message });
  }

  // Errores de carga de archivos (multer).
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, { status: 413, code: 'ARCHIVO_EXCEDE_LIMITE', message: 'El archivo excede el tamaño máximo permitido (15 MB).' });
    }
    return fail(res, { status: 400, code: 'ERROR_CARGA', message: `Error al procesar el archivo: ${err.message}` });
  }

  // JSON malformado en el cuerpo de la petición.
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400 && 'body' in err)) {
    return fail(res, { status: 400, code: 'JSON_INVALIDO', message: 'El cuerpo de la petición contiene JSON malformado.' });
  }

  // Error no controlado: registrar y responder de forma genérica sin filtrar detalles.
  // eslint-disable-next-line no-console
  console.error('[ERROR]', err);
  return fail(res, { status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' });
}

module.exports = errorHandler;
