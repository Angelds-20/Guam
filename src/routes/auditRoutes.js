/**
 * Rutas del Registro Oficial de Auditoría - nuam exchange.
 * Consulta de trazabilidad protegida por el permiso audit:view.
 */
const express = require('express');
const auditController = require('../controllers/auditController');
const { requireAuth } = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const asyncHandler = require('../utils/asyncHandler');
const { PERMISOS } = require('../config/roles');

const router = express.Router();

router.use(requireAuth);
router.get('/', requirePermission(PERMISOS.AUDITORIA_VER), asyncHandler(auditController.listar));

module.exports = router;
