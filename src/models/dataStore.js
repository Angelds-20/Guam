/**
 * DATA STORE RELACIONAL (SQLite3 / 3FN) + SEMIESTRUCTURADO (Auditoría NoSQL JSON)
 * Cumplimiento Criterio 2.1.4.8 (Base de Datos Relacional Normalizada en 3FN)
 * Cumplimiento Criterio 2.1.4.9 (Base de Datos Semiestructurada / NoSQL)
 * Motor Relacional Físico: SQLite 3 (nuam_tributario.sqlite)
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const AUDIT_FILE = process.env.AUDIT_FILE || path.join(DATA_DIR, 'auditoria_eventos.json');
const SQLITE_FILE = process.env.SQLITE_FILE || path.join(DATA_DIR, 'nuam_tributario.sqlite');
const SCHEMA_FILE = process.env.SCHEMA_FILE || path.join(DATA_DIR, 'schema.sql');

// 1. Inicialización de la Base de Datos Relacional SQLite 3
const db = new Database(SQLITE_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ejecución del Script DDL Relacional en 3FN
if (fs.existsSync(SCHEMA_FILE)) {
  const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schemaSql);
}

// 2. Catálogo Oficial de Corredoras (Tenants Multitenant)
const corredoras = [
  { id: 'corr-lv-01', codigo: 'LARRAIN_VIAL', nombre: 'LarraínVial Corredora de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-bc-02', codigo: 'BANCHILE', nombre: 'Banchile Inversiones Corredores de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-cc-03', codigo: 'CREDICORP', nombre: 'Credicorp Capital Bolsa', pais: 'Perú / Chile / Colombia', mercado: 'nuam' },
];

// 3. Catálogo de Instrumentos Oficiales de la Bolsa Central nuam (SOLO LECTURA - INTOCABLE)
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

// Semillas oficiales para inicialización y restauración
const SEMILLAS_OFICIALES = [
  {
    id: 'cal-seed-lv-01',
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
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'cal-seed-lv-02',
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
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'cal-seed-bc-01',
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
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  {
    id: 'cal-seed-bc-02',
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
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'cal-seed-cc-01',
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
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
  },
  {
    id: 'cal-seed-cc-02',
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
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 1).toISOString()
  }
];

const USUARIOS_OFICIALES = [
  {
    id: 'usr-001',
    email: 'cesar.contreras@larrainvial.com',
    nombre: 'César Contreras',
    tenant_id: 'corr-lv-01',
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
    rango: 'AUDITOR_CMF',
    cargo: 'Auditor Regulador Bursátil',
    avatar: 'CM',
    estado: 'ACTIVO',
    created_at: new Date(Date.now() - 3600000 * 72).toISOString(),
    ultimo_acceso: 'Ayer'
  }
];

// ==============================================================================
// SENTENCIAS SQL PREPARADAS (PREPARED STATEMENTS PARA ALTO RENDIMIENTO)
// ==============================================================================

const insertCorredoraStmt = db.prepare(`
  INSERT OR IGNORE INTO corredoras (id, codigo, nombre, pais, mercado)
  VALUES (@id, @codigo, @nombre, @pais, @mercado)
`);

const insertInstrumentoStmt = db.prepare(`
  INSERT OR IGNORE INTO bolsa_central_instrumentos (nemotecnico, razon_social, mercado, activo)
  VALUES (@nemotecnico, @razon_social, @mercado, @activo)
`);

const insertCalificacionSqliteStmt = db.prepare(`
  INSERT INTO calificaciones_tributarias 
    (id, tenant_id, rut_cliente, razon_social, nemotecnico, periodo_fiscal, modalidad, valor_nominal, no_inscrito, suma_factores, created_at, updated_at)
  VALUES 
    (@id, @tenant_id, @rut_cliente, @razon_social, @nemotecnico, @periodo_fiscal, @modalidad, @valor_nominal, @no_inscrito, @suma_factores, @created_at, @updated_at)
  ON CONFLICT(tenant_id, rut_cliente, nemotecnico, periodo_fiscal) DO UPDATE SET
    razon_social = excluded.razon_social,
    modalidad = excluded.modalidad,
    valor_nominal = excluded.valor_nominal,
    no_inscrito = excluded.no_inscrito,
    suma_factores = excluded.suma_factores,
    updated_at = excluded.updated_at
`);

const insertFactoresSqliteStmt = db.prepare(`
  INSERT OR REPLACE INTO factores_detalle 
    (id, calificacion_id, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, suma_total)
  VALUES 
    (@id, @calificacion_id, @f08, @f09, @f10, @f11, @f12, @f13, @f14, @f15, @f16, @f17, @f18, @f19, @suma_total)
`);

const deleteCalificacionSqliteStmt = db.prepare(`
  DELETE FROM calificaciones_tributarias WHERE id = ?
`);

const deleteCalificacionesTenantSqliteStmt = db.prepare(`
  DELETE FROM calificaciones_tributarias WHERE tenant_id = ?
`);

const insertUsuarioSqliteStmt = db.prepare(`
  INSERT INTO usuarios 
    (id, tenant_id, email, nombre, rango, cargo, avatar, estado, created_at, ultimo_acceso)
  VALUES 
    (@id, @tenant_id, @email, @nombre, @rango, @cargo, @avatar, @estado, @created_at, @ultimo_acceso)
  ON CONFLICT(email) DO UPDATE SET
    tenant_id = excluded.tenant_id,
    nombre = excluded.nombre,
    rango = excluded.rango,
    cargo = excluded.cargo,
    avatar = excluded.avatar,
    estado = excluded.estado,
    ultimo_acceso = excluded.ultimo_acceso
`);

const deleteUsuarioSqliteStmt = db.prepare(`
  DELETE FROM usuarios WHERE id = ?
`);

// ==============================================================================
// OPERACIONES SQLITE TRANSACCIONALES
// ==============================================================================

function sqliteGuardarCalificacion(c) {
  const f = c.factores || {};
  const tx = db.transaction(() => {
    insertCalificacionSqliteStmt.run({
      id: c.id,
      tenant_id: c.tenant_id,
      rut_cliente: c.rut_cliente,
      razon_social: c.razon_social || '',
      nemotecnico: c.nemotecnico,
      periodo_fiscal: c.periodo_fiscal,
      modalidad: c.modalidad || 'FACTOR',
      valor_nominal: c.valor_nominal || 0,
      no_inscrito: c.no_inscrito ? 1 : 0,
      suma_factores: c.suma_factores || 0,
      created_at: c.created_at || new Date().toISOString(),
      updated_at: c.updated_at || new Date().toISOString()
    });

    insertFactoresSqliteStmt.run({
      id: 'fac-' + c.id,
      calificacion_id: c.id,
      f08: f.f08 || 0,
      f09: f.f09 || 0,
      f10: f.f10 || 0,
      f11: f.f11 || 0,
      f12: f.f12 || 0,
      f13: f.f13 || 0,
      f14: f.f14 || 0,
      f15: f.f15 || 0,
      f16: f.f16 || 0,
      f17: f.f17 || 0,
      f18: f.f18 || 0,
      f19: f.f19 || 0,
      suma_total: c.suma_factores || 0
    });
  });
  tx();
}

function sqliteEliminarCalificacion(id) {
  deleteCalificacionSqliteStmt.run(id);
}

function sqliteVaciarCalificaciones(tenantId) {
  deleteCalificacionesTenantSqliteStmt.run(tenantId);
}

function sqliteGuardarUsuario(u) {
  insertUsuarioSqliteStmt.run({
    id: u.id,
    tenant_id: u.tenant_id,
    email: u.email,
    nombre: u.nombre,
    rango: u.rango || 'OPERADOR_SENIOR',
    cargo: u.cargo || 'Operador de Mesa',
    avatar: u.avatar || 'OP',
    estado: u.estado || 'ACTIVO',
    created_at: u.created_at || new Date().toISOString(),
    ultimo_acceso: u.ultimo_acceso || 'Reciente'
  });
}

function sqliteEliminarUsuario(id) {
  deleteUsuarioSqliteStmt.run(id);
}

// Inicialización de Semillas en SQLite si la base de datos está vacía
function inicializarSqlite() {
  // 1. Corredoras
  corredoras.forEach(c => insertCorredoraStmt.run(c));
  insertCorredoraStmt.run({ id: 'GLOBAL', codigo: 'CMF_REGULADOR', nombre: 'Comisión para el Mercado Financiero (CMF)', pais: 'Chile', mercado: 'Regulador' });

  // 2. Instrumentos Bolsa Central
  bolsaCentralInstrumentos.forEach(ins => insertInstrumentoStmt.run({
    nemotecnico: ins.nemotecnico,
    razon_social: ins.razon_social,
    mercado: ins.mercado,
    activo: ins.activo ? 1 : 0
  }));

  // 3. Usuarios
  const countUsr = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;
  if (countUsr === 0) {
    USUARIOS_OFICIALES.forEach(u => sqliteGuardarUsuario(u));
  }

  // 4. Calificaciones
  const countCal = db.prepare('SELECT COUNT(*) as total FROM calificaciones_tributarias').get().total;
  if (countCal === 0) {
    SEMILLAS_OFICIALES.forEach(s => sqliteGuardarCalificacion(s));
  }
}

inicializarSqlite();

// ==============================================================================
// ARREGLOS EN MEMORIA SINCRONIZADOS BIDIRECCIONALMENTE CON SQLITE
// ==============================================================================

let calificaciones = [];
let usuarios = [];

function sincronizarMemoriaDesdeSqlite() {
  // Sincronizar Calificaciones y Detalle de Factores (JOIN 3FN)
  const rowsCal = db.prepare(`
    SELECT 
      c.id, c.tenant_id, c.rut_cliente, c.razon_social, c.nemotecnico,
      c.periodo_fiscal, c.modalidad, c.valor_nominal, c.no_inscrito,
      c.suma_factores, c.created_at, c.updated_at,
      f.f08, f.f09, f.f10, f.f11, f.f12, f.f13, f.f14, f.f15, f.f16, f.f17, f.f18, f.f19
    FROM calificaciones_tributarias c
    LEFT JOIN factores_detalle f ON c.id = f.calificacion_id
    ORDER BY c.created_at DESC
  `).all();

  calificaciones.length = 0;
  for (const r of rowsCal) {
    calificaciones.push({
      id: r.id,
      tenant_id: r.tenant_id,
      rut_cliente: r.rut_cliente,
      razon_social: r.razon_social,
      nemotecnico: r.nemotecnico,
      periodo_fiscal: r.periodo_fiscal,
      modalidad: r.modalidad,
      valor_nominal: r.valor_nominal,
      no_inscrito: Boolean(r.no_inscrito),
      factores: {
        f08: r.f08 || 0,
        f09: r.f09 || 0,
        f10: r.f10 || 0,
        f11: r.f11 || 0,
        f12: r.f12 || 0,
        f13: r.f13 || 0,
        f14: r.f14 || 0,
        f15: r.f15 || 0,
        f16: r.f16 || 0,
        f17: r.f17 || 0,
        f18: r.f18 || 0,
        f19: r.f19 || 0
      },
      suma_factores: r.suma_factores,
      created_at: r.created_at,
      updated_at: r.updated_at
    });
  }

  // Sincronizar Usuarios RBAC
  const rowsUsr = db.prepare(`
    SELECT u.*, c.nombre as corredora_nombre 
    FROM usuarios u
    LEFT JOIN corredoras c ON u.tenant_id = c.id
    ORDER BY u.created_at ASC
  `).all();

  usuarios.length = 0;
  for (const r of rowsUsr) {
    usuarios.push({
      id: r.id,
      email: r.email,
      nombre: r.nombre,
      tenant_id: r.tenant_id,
      corredora_nombre: r.corredora_nombre || (r.tenant_id === 'GLOBAL' ? 'Comisión para el Mercado Financiero (CMF)' : 'Holding nuam'),
      rango: r.rango,
      cargo: r.cargo,
      avatar: r.avatar,
      estado: r.estado,
      created_at: r.created_at,
      ultimo_acceso: r.ultimo_acceso
    });
  }
}

sincronizarMemoriaDesdeSqlite();

// ==============================================================================
// BASE DE DATOS SEMIESTRUCTURADA (NoSQL AUDITORÍA JSON)
// Cumplimiento Criterio 2.1.4.9
// ==============================================================================

let bitacoraAuditoria = [];

if (fs.existsSync(AUDIT_FILE)) {
  try {
    bitacoraAuditoria = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  } catch (err) {
    console.warn('Bitácora vacía o corrupta. Inicializando nueva.');
    bitacoraAuditoria = [];
  }
}

function persistirAuditoria(evento) {
  const registro = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...evento
  };
  bitacoraAuditoria.unshift(registro);

  try {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify(bitacoraAuditoria, null, 2), 'utf8');
  } catch (err) {
    console.error('Error escribiendo auditoría NoSQL:', err.message);
  }
  return registro;
}

// Vaciar Calificaciones de una Corredora
function vaciarCalificaciones(tenantId, usuario = 'operador@nuam.cl') {
  let count = 0;
  for (let i = calificaciones.length - 1; i >= 0; i--) {
    if (calificaciones[i].tenant_id === tenantId) {
      calificaciones.splice(i, 1);
      count++;
    }
  }

  sqliteVaciarCalificaciones(tenantId);

  persistirAuditoria({
    tenant_id: tenantId,
    usuario,
    accion: 'VACIAR_CARTERA_SQLITE',
    entidad: 'CALIFICACION_TRIBUTARIA',
    detalle: { registros_eliminados: count, motivo: 'Demostración de Carga Masiva Limpia' }
  });
  return count;
}

// Restablecer Calificaciones Semilla de una Corredora
function restablecerCalificaciones(tenantId, usuario = 'sistema@nuam.cl') {
  for (let i = calificaciones.length - 1; i >= 0; i--) {
    if (calificaciones[i].tenant_id === tenantId) {
      calificaciones.splice(i, 1);
    }
  }

  sqliteVaciarCalificaciones(tenantId);

  const semillas = SEMILLAS_OFICIALES.filter(s => s.tenant_id === tenantId);
  for (const s of semillas) {
    const itemClonado = { ...s, id: uuidv4(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    calificaciones.push(itemClonado);
    sqliteGuardarCalificacion(itemClonado);
  }

  persistirAuditoria({
    tenant_id: tenantId,
    usuario,
    accion: 'RESTABLECER_SEMILLA_SQLITE',
    entidad: 'CALIFICACION_TRIBUTARIA',
    detalle: { registros_restablecidos: semillas.length }
  });
  return semillas.length;
}

// Restaurar todas las semillas oficiales prístinas (útil para tests y reset total)
function restaurarBaseDatosCompleta() {
  db.exec('DELETE FROM factores_detalle;');
  db.exec('DELETE FROM calificaciones_tributarias;');
  SEMILLAS_OFICIALES.forEach(s => sqliteGuardarCalificacion(s));
  sincronizarMemoriaDesdeSqlite();
}

// ==============================================================================
// GESTIÓN RBAC DE USUARIOS (PERSISTIDA EN SQLITE)
// ==============================================================================

const RANGOS_SISTEMA = {
  SUPER_ADMIN: { nivel: 1, codigo: 'SUPER_ADMIN', nombre: 'Super Administrador nuam' },
  ADMIN_CORREDORA: { nivel: 2, codigo: 'ADMIN_CORREDORA', nombre: 'Administrador de Mesa / Jefe Tributario' },
  OPERADOR_SENIOR: { nivel: 3, codigo: 'OPERADOR_SENIOR', nombre: 'Operador Transaccional Senior' },
  AUDITOR_CMF: { nivel: 4, codigo: 'AUDITOR_CMF', nombre: 'Auditor CMF / Regulador Externo' }
};

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
  sqliteGuardarUsuario(nuevo);

  persistirAuditoria({
    tenant_id: nuevo.tenant_id,
    usuario: autor,
    accion: 'CREACION_USUARIO_SQLITE',
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
  if (data.cargo && data.cargo !== user.cargo) {
    cambios.cargo = data.cargo;
    user.cargo = data.cargo;
  }
  if (data.nombre && data.nombre !== user.nombre) {
    cambios.nombre = data.nombre;
    user.nombre = data.nombre;
  }
  if (data.tenant_id && data.tenant_id !== user.tenant_id) {
    cambios.tenant_id = data.tenant_id;
    user.tenant_id = data.tenant_id;
    const corr = corredoras.find(c => c.id === data.tenant_id);
    user.corredora_nombre = corr ? corr.nombre : user.corredora_nombre;
  }

  sqliteGuardarUsuario(user);

  persistirAuditoria({
    tenant_id: user.tenant_id,
    usuario: autor,
    accion: 'MODIFICACION_USUARIO_SQLITE',
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
  sqliteEliminarUsuario(id);

  persistirAuditoria({
    tenant_id: eliminado.tenant_id,
    usuario: autor,
    accion: 'ELIMINACION_USUARIO_SQLITE',
    entidad: 'ADMIN_RBAC',
    registro_id: id,
    detalle: { email: eliminado.email, nombre: eliminado.nombre, rango: eliminado.rango }
  });

  return eliminado;
}

module.exports = {
  db,
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
  eliminarUsuario,
  sqliteGuardarCalificacion,
  sqliteEliminarCalificacion,
  sqliteVaciarCalificaciones,
  sincronizarMemoriaDesdeSqlite,
  restaurarBaseDatosCompleta
};
