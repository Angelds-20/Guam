/**
 * CATÁLOGO DE ROLES Y PERMISOS (RBAC) - nuam exchange
 * Modelo de autorización basado en claves de permiso (permissionKey) `modulo:accion`.
 *
 * Cada usuario posee un `rol` (perfil institucional) y, opcionalmente, una lista
 * adicional de permisos granulares que se suman a los otorgados por su rol.
 * El rol ADMIN_NUAM posee acceso total (comodín '*').
 */

const PERMISOS = {
  DECLARACIONES_CONSULTAR: 'declaraciones:consult',
  DECLARACIONES_CREAR: 'declaraciones:create',
  DECLARACIONES_ACTUALIZAR: 'declaraciones:update',
  DECLARACIONES_ELIMINAR: 'declaraciones:delete',
  DECLARACIONES_CARGA_MASIVA: 'declaraciones:upload_massive',
  DECLARACIONES_EXPORTAR: 'declaraciones:export',
  INSTRUMENTOS_VER: 'instrumentos:view',
  INSTRUMENTOS_GESTIONAR: 'instrumentos:manage',
  AUDITORIA_VER: 'audit:view',
  USUARIOS_GESTIONAR: 'users:manage',
};

const LISTA_PERMISOS = Object.values(PERMISOS);

const ROLES = {
  ADMIN_NUAM: 'ADMIN_NUAM',
  OPERADOR_CORREDORA: 'OPERADOR_CORREDORA',
  OFICIAL_CUMPLIMIENTO: 'OFICIAL_CUMPLIMIENTO',
  REGULADOR_CMF: 'REGULADOR_CMF',
};

// Matriz rol -> permisos. ADMIN_NUAM posee '*' (acceso total).
const PERMISOS_POR_ROL = {
  [ROLES.ADMIN_NUAM]: ['*'],
  [ROLES.OPERADOR_CORREDORA]: [
    PERMISOS.DECLARACIONES_CONSULTAR,
    PERMISOS.DECLARACIONES_CREAR,
    PERMISOS.DECLARACIONES_ACTUALIZAR,
    PERMISOS.DECLARACIONES_CARGA_MASIVA,
    PERMISOS.DECLARACIONES_EXPORTAR,
    PERMISOS.INSTRUMENTOS_VER,
  ],
  [ROLES.OFICIAL_CUMPLIMIENTO]: [
    PERMISOS.DECLARACIONES_CONSULTAR,
    PERMISOS.INSTRUMENTOS_VER,
    PERMISOS.AUDITORIA_VER,
  ],
  [ROLES.REGULADOR_CMF]: [
    PERMISOS.DECLARACIONES_CONSULTAR,
    PERMISOS.INSTRUMENTOS_VER,
    PERMISOS.AUDITORIA_VER,
  ],
};

// Perfiles con alcance transversal: pueden consultar declaraciones de todas las corredoras.
const ROLES_GLOBALES = new Set([
  ROLES.ADMIN_NUAM,
  ROLES.OFICIAL_CUMPLIMIENTO,
  ROLES.REGULADOR_CMF,
]);

function permisosDeRol(rol) {
  return PERMISOS_POR_ROL[rol] || [];
}

function tienePermiso(usuario, permiso) {
  if (!usuario || !permiso) return false;
  const permisosRol = permisosDeRol(usuario.rol);
  if (permisosRol.includes('*')) return true;
  if (permisosRol.includes(permiso)) return true;
  const extras = Array.isArray(usuario.permissions) ? usuario.permissions : [];
  return extras.includes(permiso);
}

function esRolGlobal(rol) {
  return ROLES_GLOBALES.has(rol);
}

module.exports = {
  PERMISOS,
  LISTA_PERMISOS,
  ROLES,
  PERMISOS_POR_ROL,
  ROLES_GLOBALES,
  permisosDeRol,
  tienePermiso,
  esRolGlobal,
};
