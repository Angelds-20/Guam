/**
 * Asigna un identificador único (requestId) a cada petición para trazabilidad.
 * Se expone en la cabecera X-Request-Id y en el meta de las respuestas.
 */
const { v4: uuidv4 } = require('uuid');

function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = incoming || uuidv4();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

module.exports = requestContext;
