/**
 * Rutas del catálogo institucional - nuam exchange.
 * Listado de corredoras de bolsa (requiere autenticación).
 */
const express = require('express');
const catalogoController = require('../controllers/catalogoController');
const { requireAuth } = require('../middlewares/requireAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(requireAuth);
router.get('/', asyncHandler(catalogoController.listarCorredoras));

module.exports = router;
