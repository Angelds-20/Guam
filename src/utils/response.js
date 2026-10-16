/**
 * Envoltorio de respuestas REST estandarizado para nuam exchange.
 *
 * Éxito:   { success:true, data, meta:{ timestamp, requestId, ... } }
 * Error:   { success:false, error:{ code, message } }  (+ cabecera X-Request-Id)
 */

function ok(res, data, { status = 200, meta = {} } = {}) {
  const requestId = (res.locals && res.locals.requestId) || null;
  res.status(status).json({
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
      ...meta,
    },
  });
}

function fail(res, { status = 500, code = 'INTERNAL_ERROR', message = 'Error interno del servidor.' } = {}) {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

module.exports = { ok, fail };
