/**
 * DATA STORE IN-MEMORY + PERSISTENCIA LOCAL (Simulador de Base de Datos)
 * Implementa el modelo de dominio para nuam exchange (Bolsas Integradas de Santiago, Lima y Colombia)
 * Incluye segregación Multitenant, Auditoría JSON y Repositorio de No Impacto de la Bolsa Central.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const AUDIT_FILE = path.join(DATA_DIR, 'auditoria_eventos.json');

// Catálogo de Corredoras (Tenants)
const corredoras = [
  { id: 'corr-lv-01', codigo: 'LARRAIN_VIAL', nombre: 'LarraínVial Corredora de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-bc-02', codigo: 'BANCHILE', nombre: 'Banchile Inversiones Corredores de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-cc-03', codigo: 'CREDICORP', nombre: 'Credicorp Capital Bolsa', pais: 'Perú / Chile / Colombia', mercado: 'nuam' },
];

// Catálogo de Instrumentos Oficiales de la Bolsa Central nuam (SOLO LECTURA - INTOCABLE)
const bolsaCentralInstrumentos = [
  { nemotecnico: 'CHILE', razon_social: 'Banco de Chile', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'FALABELLA', razon_social: 'S.A.C.I. Falabella', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'SQM-B', razon_social: 'Sociedad Química y Minera de Chile Serie B', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'CMPC', razon_social: 'Empresas CMPC S.A.', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'ENELAM', razon_social: 'Enel Américas S.A.', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'CENCOSUD', razon_social: 'Cencosud S.A.', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'BCI', razon_social: 'Banco de Crédito e Inversiones', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'ECOPETROL', razon_social: 'Ecopetrol S.A. (Colombia)', mercado: 'Renta Variable', activo: true },
  { nemotecnico: 'BAP', razon_social: 'Credicorp Ltd. (Perú)', mercado: 'Renta Variable', activo: true },
];

// Calificaciones Tributarias Semilla (Cartera Institucional Real)
let calificaciones = [
  {
    id: uuidv4(),
    tenant_id: 'corr-lv-01',
    rut_cliente: '96.555.120-4',
    razon_social: 'Inversiones Santa Blanca S.A.',
    nemotecnico: 'CHILE',
    periodo_fiscal: 2026,
    modalidad: 'FACTOR',
    valor_nominal: 450000000,
    no_inscrito: false,
    factores: {
      f08: 0.450000,
      f09: 0.150000,
      f10: 0.050000,
      f11: 0.000000,
      f12: 0.000000,
      f13: 0.150000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.050000,
    },
    suma_factores: 0.850000,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: uuidv4(),
    tenant_id: 'corr-lv-01',
    rut_cliente: '77.102.340-9',
    razon_social: 'Rentas y Valores El Golf SpA',
    nemotecnico: 'SQM-B',
    periodo_fiscal: 2026,
    modalidad: 'MONTO',
    valor_nominal: 1200000000,
    no_inscrito: false,
    factores: {
      f08: 0.500000,
      f09: 0.100000,
      f10: 0.100000,
      f11: 0.050000,
      f12: 0.000000,
      f13: 0.100000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.050000,
    },
    suma_factores: 0.900000,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: uuidv4(),
    tenant_id: 'corr-bc-02',
    rut_cliente: '96.888.777-K',
    razon_social: 'Banchile Administradora General de Fondos S.A.',
    nemotecnico: 'FALABELLA',
    periodo_fiscal: 2026,
    modalidad: 'FACTOR',
    valor_nominal: 820000000,
    no_inscrito: false,
    factores: {
      f08: 0.500000,
      f09: 0.200000,
      f10: 0.100000,
      f11: 0.050000,
      f12: 0.000000,
      f13: 0.100000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.000000,
    },
    suma_factores: 0.950000,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString(),
  },
  {
    id: uuidv4(),
    tenant_id: 'corr-bc-02',
    rut_cliente: '76.432.198-5',
    razon_social: 'Inversiones Forestales del Sur SpA',
    nemotecnico: 'CMPC',
    periodo_fiscal: 2026,
    modalidad: 'MONTO',
    valor_nominal: 650000000,
    no_inscrito: false,
    factores: {
      f08: 0.450000,
      f09: 0.200000,
      f10: 0.100000,
      f11: 0.000000,
      f12: 0.000000,
      f13: 0.100000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.000000,
    },
    suma_factores: 0.850000,
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: uuidv4(),
    tenant_id: 'corr-cc-03',
    rut_cliente: '77.555.444-3',
    razon_social: 'Credicorp Capital Asset Management Perú',
    nemotecnico: 'BAP',
    periodo_fiscal: 2026,
    modalidad: 'FACTOR',
    valor_nominal: 2400000000,
    no_inscrito: false,
    factores: {
      f08: 0.700000,
      f09: 0.100000,
      f10: 0.050000,
      f11: 0.000000,
      f12: 0.000000,
      f13: 0.100000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.000000,
    },
    suma_factores: 0.950000,
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: uuidv4(),
    tenant_id: 'corr-cc-03',
    rut_cliente: '78.910.222-1',
    razon_social: 'Fondo Andino Renta Fija & Energía',
    nemotecnico: 'ECOPETROL',
    periodo_fiscal: 2026,
    modalidad: 'MONTO',
    valor_nominal: 1800000000,
    no_inscrito: false,
    factores: {
      f08: 0.500000,
      f09: 0.200000,
      f10: 0.100000,
      f11: 0.000000,
      f12: 0.000000,
      f13: 0.100000,
      f14: 0.000000,
      f15: 0.000000,
      f16: 0.000000,
      f17: 0.000000,
      f18: 0.000000,
      f19: 0.000000,
    },
    suma_factores: 0.900000,
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 1).toISOString(),
  }
];

// Carga de Bitácora de Auditoría
let bitacoraAuditoria = [];
try {
  if (fs.existsSync(AUDIT_FILE)) {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
    bitacoraAuditoria = JSON.parse(raw);
  } else {
    bitacoraAuditoria = [
      {
        id: uuidv4(),
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        tenant_id: 'corr-lv-01',
        usuario: 'operador@larrainvial.com',
        accion: 'INSERCION_INICIAL',
        entidad: 'CALIFICACION_TRIBUTARIA',
        detalle: { rut_cliente: '76.123.456-7', nemotecnico: 'CHILE', suma_factores: 0.80 }
      },
      {
        id: uuidv4(),
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        tenant_id: 'corr-lv-01',
        usuario: 'operador@larrainvial.com',
        accion: 'INSERCION_INICIAL',
        entidad: 'CALIFICACION_TRIBUTARIA',
        detalle: { rut_cliente: '12.456.789-0', nemotecnico: 'SQM-B', suma_factores: 0.90 }
      }
    ];
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(bitacoraAuditoria, null, 2), 'utf8');
  }
} catch (e) {
  bitacoraAuditoria = [];
}

function persistirAuditoria(evento) {
  const reg = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...evento
  };
  bitacoraAuditoria.unshift(reg);
  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(bitacoraAuditoria, null, 2), 'utf8');
  } catch (err) {
    console.error('Error persistiendo auditoría:', err);
  }
  return reg;
}

function vaciarCalificaciones(tenantId, usuario) {
  let count = 0;
  for (let i = calificaciones.length - 1; i >= 0; i--) {
    if (calificaciones[i].tenant_id === tenantId) {
      calificaciones.splice(i, 1);
      count++;
    }
  }
  persistirAuditoria({
    tenant_id: tenantId,
    usuario: usuario || 'operador@nuam.cl',
    accion: 'VACIADO_CARTERA',
    entidad: 'CALIFICACION_TRIBUTARIA',
    detalle: { registros_eliminados: count, motivo: 'Demostración de Carga Masiva Limpia' }
  });
  return count;
}

function restablecerCalificaciones(tenantId) {
  for (let i = calificaciones.length - 1; i >= 0; i--) {
    if (calificaciones[i].tenant_id === tenantId) {
      calificaciones.splice(i, 1);
    }
  }
  const semillas = [
    {
      id: uuidv4(),
      tenant_id: 'corr-lv-01',
      rut_cliente: '96.555.120-4',
      razon_social: 'Inversiones Santa Blanca S.A.',
      nemotecnico: 'CHILE',
      periodo_fiscal: 2026,
      modalidad: 'FACTOR',
      valor_nominal: 450000000,
      no_inscrito: false,
      factores: { f08: 0.45, f09: 0.15, f10: 0.05, f11: 0, f12: 0, f13: 0.15, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 },
      suma_factores: 0.850000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      tenant_id: 'corr-lv-01',
      rut_cliente: '77.102.340-9',
      razon_social: 'Rentas y Valores El Golf SpA',
      nemotecnico: 'SQM-B',
      periodo_fiscal: 2026,
      modalidad: 'MONTO',
      valor_nominal: 1200000000,
      no_inscrito: false,
      factores: { f08: 0.50, f09: 0.10, f10: 0.10, f11: 0.05, f12: 0, f13: 0.10, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 },
      suma_factores: 0.900000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      tenant_id: 'corr-bc-02',
      rut_cliente: '96.888.777-K',
      razon_social: 'Banchile Administradora General de Fondos S.A.',
      nemotecnico: 'FALABELLA',
      periodo_fiscal: 2026,
      modalidad: 'FACTOR',
      valor_nominal: 820000000,
      no_inscrito: false,
      factores: { f08: 0.50, f09: 0.20, f10: 0.10, f11: 0.05, f12: 0, f13: 0.10, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
      suma_factores: 0.950000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      tenant_id: 'corr-bc-02',
      rut_cliente: '76.432.198-5',
      razon_social: 'Inversiones Forestales del Sur SpA',
      nemotecnico: 'CMPC',
      periodo_fiscal: 2026,
      modalidad: 'MONTO',
      valor_nominal: 650000000,
      no_inscrito: false,
      factores: { f08: 0.45, f09: 0.20, f10: 0.10, f11: 0, f12: 0, f13: 0.10, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
      suma_factores: 0.850000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      tenant_id: 'corr-cc-03',
      rut_cliente: '77.555.444-3',
      razon_social: 'Credicorp Capital Asset Management Perú',
      nemotecnico: 'BAP',
      periodo_fiscal: 2026,
      modalidad: 'FACTOR',
      valor_nominal: 2400000000,
      no_inscrito: false,
      factores: { f08: 0.70, f09: 0.10, f10: 0.05, f11: 0, f12: 0, f13: 0.10, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
      suma_factores: 0.950000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      tenant_id: 'corr-cc-03',
      rut_cliente: '78.910.222-1',
      razon_social: 'Fondo Andino Renta Fija & Energía',
      nemotecnico: 'ECOPETROL',
      periodo_fiscal: 2026,
      modalidad: 'MONTO',
      valor_nominal: 1800000000,
      no_inscrito: false,
      factores: { f08: 0.50, f09: 0.20, f10: 0.10, f11: 0, f12: 0, f13: 0.10, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
      suma_factores: 0.900000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];
  const agregados = semillas.filter(s => s.tenant_id === tenantId);
  calificaciones.push(...agregados);
  persistirAuditoria({
    tenant_id: tenantId,
    usuario: 'sistema@nuam.cl',
    accion: 'RESTABLECER_SEMILLA',
    entidad: 'CALIFICACION_TRIBUTARIA',
    detalle: { registros_restablecidos: agregados.length }
  });
  return agregados.length;
}

// ==============================================================================
// GESTIÓN DE CUENTAS, PERFILES Y RANGOS (RBAC - Role Based Access Control)
// ==============================================================================

const RANGOS_SISTEMA = {
  SUPER_ADMIN: {
    nivel: 1,
    codigo: 'SUPER_ADMIN',
    nombre: 'Super Administrador nuam',
    descripcion: 'Control total de la plataforma, gestión de corredoras y configuración Core Gateway',
    color: 'amber'
  },
  ADMIN_CORREDORA: {
    nivel: 2,
    codigo: 'ADMIN_CORREDORA',
    nombre: 'Jefe de Mesa Tributaria',
    descripcion: 'Gestión completa de su corredora, aprobación de cargas y restablecimiento de cartera',
    color: 'blue'
  },
  OPERADOR_SENIOR: {
    nivel: 3,
    codigo: 'OPERADOR_SENIOR',
    nombre: 'Operador Transaccional Senior',
    descripcion: 'Ingreso manual, edición y procesamiento de lotes masivos Upsert',
    color: 'emerald'
  },
  AUDITOR_CMF: {
    nivel: 4,
    codigo: 'AUDITOR_CMF',
    nombre: 'Auditor CMF / Regulador Externo',
    descripcion: 'Acceso de solo lectura para fiscalización de bitácoras inmutables y catálogos',
    color: 'purple'
  }
};

let usuarios = [
  {
    id: 'usr-001',
    email: 'cesar.contreras@larrainvial.com',
    nombre: 'César Contreras',
    tenant_id: 'corr-lv-01',
    corredora_nombre: 'LarraínVial Corredora de Bolsa',
    rango: 'SUPER_ADMIN',
    cargo: 'Líder de Arquitectura nuam & Administrador',
    avatar: 'CC',
    estado: 'ACTIVO',
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    ultimo_acceso: 'Hace un momento'
  },
  {
    id: 'usr-002',
    email: 'javiera.sepulveda@banchile.cl',
    nombre: 'Javiera Sepúlveda',
    tenant_id: 'corr-bc-02',
    corredora_nombre: 'Banchile Inversiones Corredores de Bolsa',
    rango: 'ADMIN_CORREDORA',
    cargo: 'Jefa de Mesa Tributaria',
    avatar: 'JS',
    estado: 'ACTIVO',
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    ultimo_acceso: 'Hace 12 min'
  },
  {
    id: 'usr-003',
    email: 'operador@credicorp.com',
    nombre: 'Andrés Mendoza',
    tenant_id: 'corr-cc-03',
    corredora_nombre: 'Credicorp Capital Bolsa',
    rango: 'OPERADOR_SENIOR',
    cargo: 'Operador Renta Variable nuam',
    avatar: 'AM',
    estado: 'ACTIVO',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    ultimo_acceso: 'Hace 45 min'
  },
  {
    id: 'usr-004',
    email: 'auditor.cmf@cmfchile.cl',
    nombre: 'Fiscalizador CMF Chile',
    tenant_id: 'GLOBAL',
    corredora_nombre: 'Comisión para el Mercado Financiero (CMF)',
    rango: 'AUDITOR_CMF',
    cargo: 'Auditor Regulador Bursátil',
    avatar: 'CM',
    estado: 'ACTIVO',
    created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    ultimo_acceso: 'Ayer'
  }
];

function listarUsuarios(filtroTenant = null) {
  if (filtroTenant && filtroTenant !== 'GLOBAL') {
    return usuarios.filter(u => u.tenant_id === filtroTenant || u.tenant_id === 'GLOBAL');
  }
  return usuarios;
}

function crearUsuario(data, autor = 'admin@nuam.cl') {
  if (!data.email || !data.nombre || !data.rango) {
    throw new Error('Email, nombre y rango son obligatorios.');
  }
  const existe = usuarios.find(u => u.email.toLowerCase() === data.email.toLowerCase().trim());
  if (existe) {
    throw new Error(`El correo ${data.email} ya está registrado.`);
  }

  const corr = corredoras.find(c => c.id === data.tenant_id);
  const corredoraNombre = corr ? corr.nombre : (data.tenant_id === 'GLOBAL' ? 'Holding nuam (Todas las Bolsas)' : 'Corredora General');

  const nuevo = {
    id: 'usr-' + uuidv4().substring(0, 8),
    email: data.email.trim().toLowerCase(),
    nombre: data.nombre.trim(),
    tenant_id: data.tenant_id || 'corr-lv-01',
    corredora_nombre: corredoraNombre,
    rango: data.rango || 'OPERADOR_SENIOR',
    cargo: data.cargo || 'Operador de Mesa Bursátil',
    avatar: data.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'OP',
    estado: data.estado || 'ACTIVO',
    created_at: new Date().toISOString(),
    ultimo_acceso: 'Pendiente de inicio'
  };

  usuarios.unshift(nuevo);

  persistirAuditoria({
    tenant_id: nuevo.tenant_id,
    usuario: autor,
    accion: 'CREACION_USUARIO',
    entidad: 'ADMIN_RBAC',
    registro_id: nuevo.id,
    detalle: { email: nuevo.email, nombre: nuevo.nombre, rango: nuevo.rango, corredora: nuevo.corredora_nombre }
  });

  return nuevo;
}

function actualizarUsuario(id, data, autor = 'admin@nuam.cl') {
  const user = usuarios.find(u => u.id === id);
  if (!user) throw new Error('Usuario no encontrado.');

  const cambios = {};
  if (data.rango && data.rango !== user.rango) {
    cambios.rango_anterior = user.rango;
    cambios.rango_nuevo = data.rango;
    user.rango = data.rango;
  }
  if (data.estado && data.estado !== user.estado) {
    cambios.estado_anterior = user.estado;
    cambios.estado_nuevo = data.estado;
    user.estado = data.estado;
  }
  if (data.tenant_id && data.tenant_id !== user.tenant_id) {
    user.tenant_id = data.tenant_id;
    const corr = corredoras.find(c => c.id === data.tenant_id);
    user.corredora_nombre = corr ? corr.nombre : (data.tenant_id === 'GLOBAL' ? 'Holding nuam (Todas las Bolsas)' : 'Corredora General');
    cambios.tenant_nuevo = user.tenant_id;
  }
  if (data.nombre) user.nombre = data.nombre.trim();
  if (data.cargo) user.cargo = data.cargo.trim();

  persistirAuditoria({
    tenant_id: user.tenant_id,
    usuario: autor,
    accion: 'MODIFICACION_USUARIO',
    entidad: 'ADMIN_RBAC',
    registro_id: id,
    detalle: { email: user.email, ...cambios }
  });

  return user;
}

function eliminarUsuario(id, autor = 'admin@nuam.cl') {
  const index = usuarios.findIndex(u => u.id === id);
  if (index === -1) throw new Error('Usuario no encontrado.');

  const eliminado = usuarios.splice(index, 1)[0];

  persistirAuditoria({
    tenant_id: eliminado.tenant_id,
    usuario: autor,
    accion: 'ELIMINACION_USUARIO',
    entidad: 'ADMIN_RBAC',
    registro_id: id,
    detalle: { email: eliminado.email, nombre: eliminado.nombre, rango: eliminado.rango }
  });

  return eliminado;
}

module.exports = {
  corredoras,
  bolsaCentralInstrumentos,
  calificaciones,
  bitacoraAuditoria,
  persistirAuditoria,
  vaciarCalificaciones,
  restablecerCalificaciones,
  RANGOS_SISTEMA,
  usuarios,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  eliminarUsuario
};
