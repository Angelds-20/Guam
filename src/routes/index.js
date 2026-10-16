/**
 * Enrutador principal de la API REST - nuam exchange.
 * Agrupa los submódulos bajo el prefijo /api.
 */
const express = require('express');
const authRoutes = require('./authRoutes');
const tributarioRoutes = require('./tributarioRoutes');
const instrumentoRoutes = require('./instrumentoRoutes');
const auditRoutes = require('./auditRoutes');
const userRoutes = require('./userRoutes');
const catalogoRoutes = require('./catalogoRoutes');
const healthController = require('../controllers/healthController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/health', asyncHandler(healthController.health));

router.use('/auth', authRoutes);
router.use('/declaraciones', tributarioRoutes);
router.use('/instrumentos', instrumentoRoutes);
router.use('/auditoria', auditRoutes);
router.use('/usuarios', userRoutes);
router.use('/corredoras', catalogoRoutes);

module.exports = router;
