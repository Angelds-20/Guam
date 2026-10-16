/**
 * Rutas de declaraciones tributarias - nuam exchange.
 * Protegidas por RBAC (claves de permiso `declaraciones:*`) y carga masiva con multer.
 */
const express = require('express');
const multer = require('multer');
const tributarioController = require('../controllers/tributarioController');
const { requireAuth } = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const asyncHandler = require('../utils/asyncHandler');
const { PERMISOS } = require('../config/roles');

const router = express.Router();

// Carga de archivos en memoria (máx. 15 MB), compatible con CSV y XLSX.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(requireAuth);

// Consulta y exportación oficial.
router.get('/', requirePermission(PERMISOS.DECLARACIONES_CONSULTAR), asyncHandler(tributarioController.listar));
router.get('/exportar', requirePermission(PERMISOS.DECLARACIONES_EXPORTAR), asyncHandler(tributarioController.exportar));
router.get('/plantilla', requirePermission(PERMISOS.DECLARACIONES_CARGA_MASIVA), asyncHandler(tributarioController.plantilla));
router.get(
  '/carga-masiva/rechazos/:batchId',
  requirePermission(PERMISOS.DECLARACIONES_CARGA_MASIVA),
  asyncHandler(tributarioController.rechazos)
);
router.get('/:id', requirePermission(PERMISOS.DECLARACIONES_CONSULTAR), asyncHandler(tributarioController.obtenerPorId));

// Escritura.
router.post('/', requirePermission(PERMISOS.DECLARACIONES_CREAR), asyncHandler(tributarioController.crear));
router.post(
  '/carga-masiva',
  requirePermission(PERMISOS.DECLARACIONES_CARGA_MASIVA),
  upload.single('archivo'),
  asyncHandler(tributarioController.cargaMasiva)
);
router.put('/:id', requirePermission(PERMISOS.DECLARACIONES_ACTUALIZAR), asyncHandler(tributarioController.actualizar));
router.delete('/:id', requirePermission(PERMISOS.DECLARACIONES_ELIMINAR), asyncHandler(tributarioController.eliminar));

module.exports = router;
