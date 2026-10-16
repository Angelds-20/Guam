/**
 * Rutas de autenticación - nuam exchange.
 * POST /login, POST /logout, GET /me.
 */
const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/requireAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(authController.login));
router.post('/logout', requireAuth, asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));

module.exports = router;
