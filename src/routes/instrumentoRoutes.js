/**
 * Rutas del catálogo de instrumentos - nuam exchange.
 * Consulta (instrumentos:view) y gestión (instrumentos:manage).
 */
const express = require('express');
const instrumentoController = require('../controllers/instrumentoController');
const { requireAuth } = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const asyncHandler = require('../utils/asyncHandler');
const { PERMISOS } = require('../config/roles');

const router = express.Router();

router.use(requireAuth);

router.get('/', requirePermission(PERMISOS.INSTRUMENTOS_VER), asyncHandler(instrumentoController.listar));
router.post('/', requirePermission(PERMISOS.INSTRUMENTOS_GESTIONAR), asyncHandler(instrumentoController.crear));
router.put('/:nemotecnico', requirePermission(PERMISOS.INSTRUMENTOS_GESTIONAR), asyncHandler(instrumentoController.actualizar));
router.delete('/:nemotecnico', requirePermission(PERMISOS.INSTRUMENTOS_GESTIONAR), asyncHandler(instrumentoController.eliminar));

module.exports = router;
