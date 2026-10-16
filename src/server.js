/**
 * Punto de entrada de la API REST - nuam exchange.
 * Intranet B2B para el Mantenedor de Declaraciones Tributarias y Carga Masiva.
 *
 * Exporta `{ app, start }` para permitir pruebas sin abrir el puerto;
 * inicia el servidor únicamente cuando se ejecuta de forma directa.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { inicializarBaseDeDatos } = require('./database');
const apiRoutes = require('./routes');
const requestContext = require('./middlewares/requestContext');
const errorHandler = require('./middlewares/errorHandler');
const { fail } = require('./utils/response');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Middlewares globales
// ---------------------------------------------------------------------------
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestContext);

// Cabeceras de seguridad HTTP (OWASP).
app.use((req, res, next) => {
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production' && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Los endpoints de la API no deben almacenarse en caché.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Frontend estático (desacoplado de la API).
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: false, maxAge: 0 }));

// ---------------------------------------------------------------------------
// API REST
// ---------------------------------------------------------------------------
app.use('/api', apiRoutes);

// Recurso no encontrado.
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return fail(res, { status: 404, code: 'NO_ENCONTRADO', message: 'Recurso no encontrado.' });
  }
  return res.status(404).send('Recurso no encontrado.');
});

// Manejador global de errores (siempre al final).
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Inicio del servidor
// ---------------------------------------------------------------------------
function start(port = PORT) {
  inicializarBaseDeDatos();
  const server = app.listen(port, () => {
    const direccion = server.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : port;
    // eslint-disable-next-line no-console
    console.log(`[nuam-exchange] API activa en http://localhost:${puerto} y http://127.0.0.1:${puerto}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.warn(`[nuam-exchange] Puerto ${port} en uso. Intentando ${port + 1}...`);
      start(port + 1);
    } else {
      // eslint-disable-next-line no-console
      console.error('[nuam-exchange] Error al iniciar el servidor:', err);
      process.exit(1);
    }
  });

  return server;
}

if (require.main === module) {
  start(PORT);
}

module.exports = { app, start };
