const express = require('express');
const multer = require('multer');
const router = express.Router();
const apiController = require('../controllers/apiController');

// Configuración de Multer para procesamiento en memoria (hasta 15MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// Rutas de Catálogos y Entorno
router.get('/corredoras', apiController.listarCorredoras);
router.get('/health', apiController.healthCheck);

// Rutas CRUD de Calificaciones Tributarias (Aislamiento Multitenant)
router.get('/calificaciones', apiController.listarCalificaciones);
router.post('/calificaciones', apiController.crearCalificacion);
router.post('/calificaciones/vaciar', apiController.vaciarCartera);
router.post('/calificaciones/restablecer', apiController.restablecerCartera);
router.put('/calificaciones/:id', apiController.actualizarCalificacion);
router.delete('/calificaciones/:id', apiController.eliminarCalificacion);

// Rutas de Carga Masiva Inteligente (Upsert)
router.post('/carga-masiva', upload.single('archivo'), apiController.cargaMasiva);
router.get('/descargar-rechazos/:batchId', apiController.descargarRechazos);
router.get('/plantilla-ejemplo', apiController.descargarPlantilla);
router.get('/plantilla-excel', (req, res, next) => { req.query.formato = 'xlsx'; apiController.descargarPlantilla(req, res, next); });
router.get('/lote-prueba/:tipo', apiController.descargarLotePrueba);
router.get('/exportar-declaracion', apiController.exportarDeclaracion);

// Rutas de Auditoría (Trazabilidad JSON)
router.get('/auditoria', apiController.listarAuditoria);

// Rutas de la Bolsa Central nuam (Principio de No Impacto)
router.get('/bolsa-central', apiController.consultarBolsaCentral);
router.post('/bolsa-central/test-write', apiController.testNoImpacto);

// Rutas de Administración de Cuentas y Rangos (RBAC)
router.get('/usuarios', apiController.listarUsuarios);
router.post('/usuarios', apiController.crearUsuario);
router.put('/usuarios/:id', apiController.actualizarUsuario);
router.delete('/usuarios/:id', apiController.eliminarUsuario);

module.exports = router;
