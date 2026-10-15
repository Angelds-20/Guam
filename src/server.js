const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const apiRoutes = require('./routes/apiRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Desactivar caché estático para evitar problemas de caché en Safari / Chrome
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));

// Enrutador de APIs
app.use('/api', apiRoutes);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor en nuam exchange.',
    mensaje: err.message
  });
});

// Iniciar servidor con fallback inteligente si el puerto está ocupado
function startServer(port) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🚀 NUAM EXCHANGE - INTRANET B2B TRIBUTARIA`);
    console.log(`📡 Servidor activo en: http://localhost:${port}`);
    console.log(`🌐 Despliegue en AWS EC2: http://TU_IP_ELASTICA:${port}`);
    console.log(`☁️  Compatible con Render y AWS Cloud`);
    console.log(`=======================================================`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Puerto ${port} ocupado por otra aplicación. Probando en puerto ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Error al iniciar el servidor:', err);
    }
  });
}

const initialPort = Number(process.env.PORT) || 3000;
startServer(initialPort);

module.exports = app;

