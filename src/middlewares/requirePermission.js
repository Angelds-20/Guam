/**
 * Autorización RBAC: exige que el usuario autenticado posea una clave de permiso
 * (`modulo:accion`). Responde HTTP 403 con código INSUFFICIENT_PERMISSIONS.
 */
const AppError = require('../utils/AppError');
const { tienePermiso } = require('../config/roles');

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Autenticación requerida.'));
    }
    if (!tienePermiso(req.user, permissionKey)) {
      return next(
        new AppError(
          403,
          'INSUFFICIENT_PERMISSIONS',
          `Permiso insuficiente. Requiere la clave de permiso '${permissionKey}'.`
        )
      );
    }
    next();
  };
}

module.exports = requirePermission;
