/**
 * Rutas de gestión de usuarios - nuam exchange.
 * Protegidas por el permiso users:manage (administración de plataforma).
 */
const express = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middlewares/requireAuth');
const requirePermission = require('../middlewares/requirePermission');
const asyncHandler = require('../utils/asyncHandler');
const { PERMISOS } = require('../config/roles');

const router = express.Router();

router.use(requireAuth);
router.use(requirePermission(PERMISOS.USUARIOS_GESTIONAR));

router.get('/', asyncHandler(userController.listar));
router.get('/:id', asyncHandler(userController.obtenerPorId));
router.post('/', asyncHandler(userController.crear));
router.put('/:id', asyncHandler(userController.actualizar));
router.delete('/:id', asyncHandler(userController.eliminar));

module.exports = router;
