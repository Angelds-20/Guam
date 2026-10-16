/**
 * Datos canónicos (seed) de nuam exchange.
 * - Corredoras de bolsa (multi-tenant).
 * - Usuarios institucionales con contraseñas bcrypt y roles RBAC.
 * - Declaraciones de calificaciones tributarias de referencia (RUT válidos).
 * - Instrumentos de la Bolsa Central.
 * Idempotente: usa INSERT OR IGNORE sobre claves naturales.
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./connection');
const { ROLES } = require('../config/roles');

const SEED_DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Nuam2026!';

const CORREDORAS = [
  { id: 'corr-lv-01', codigo: 'LARRAIN_VIAL', nombre: 'LarraínVial Corredora de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-bc-02', codigo: 'BANCHILE', nombre: 'Banchile Inversiones Corredores de Bolsa', pais: 'Chile', mercado: 'BCS' },
  { id: 'corr-cc-03', codigo: 'CREDICORP', nombre: 'Credicorp Capital Bolsa', pais: 'Perú / Chile / Colombia', mercado: 'nuam' },
  { id: 'GLOBAL', codigo: 'CMF_REGULADOR', nombre: 'Comisión para el Mercado Financiero (CMF)', pais: 'Chile', mercado: 'Regulador' },
];

const USUARIOS = [
  { email: 'admin@nuam.exchange', nombre: 'Administración nuam', rol: ROLES.ADMIN_NUAM, tenant_id: 'GLOBAL', cargo: 'Administrador de Plataforma' },
  { email: 'operador.larrainvial@nuam.exchange', nombre: 'Operador LarraínVial', rol: ROLES.OPERADOR_CORREDORA, tenant_id: 'corr-lv-01', cargo: 'Operador Mesa Tributaria' },
  { email: 'operador.banchile@nuam.exchange', nombre: 'Operador Banchile', rol: ROLES.OPERADOR_CORREDORA, tenant_id: 'corr-bc-02', cargo: 'Operador Mesa Tributaria' },
  { email: 'operador.credicorp@nuam.exchange', nombre: 'Operador Credicorp Capital', rol: ROLES.OPERADOR_CORREDORA, tenant_id: 'corr-cc-03', cargo: 'Operador Renta Variable' },
  { email: 'cumplimiento@nuam.exchange', nombre: 'Oficial de Cumplimiento', rol: ROLES.OFICIAL_CUMPLIMIENTO, tenant_id: 'GLOBAL', cargo: 'Oficial de Cumplimiento Normativo' },
  { email: 'regulador@cmfchile.cl', nombre: 'Regulador CMF Chile', rol: ROLES.REGULADOR_CMF, tenant_id: 'GLOBAL', cargo: 'Auditor Regulador Bursátil' },
];

const INSTRUMENTOS = [
  { nemotecnico: 'CHILE', razon_social: 'Banco de Chile', mercado: 'Renta Variable' },
  { nemotecnico: 'FALABELLA', razon_social: 'S.A.C.I. Falabella', mercado: 'Renta Variable' },
  { nemotecnico: 'SQM-B', razon_social: 'Sociedad Química y Minera de Chile Serie B', mercado: 'Renta Variable' },
  { nemotecnico: 'CENCOSUD', razon_social: 'Cencosud S.A.', mercado: 'Renta Variable' },
  { nemotecnico: 'BCI', razon_social: 'Banco de Crédito e Inversiones', mercado: 'Renta Variable' },
  { nemotecnico: 'LTM', razon_social: 'Latam Airlines Group', mercado: 'Renta Variable' },
  { nemotecnico: 'IPSA', razon_social: 'Índice S&P/CLX IPSA', mercado: 'Índice' },
  { nemotecnico: 'COLCAP', razon_social: 'Índice Colombia (COLCAP)', mercado: 'Índice' },
  { nemotecnico: 'SPBLPGPT', razon_social: 'Índice S&P/BVL Perú General', mercado: 'Índice' },
];

// Declaraciones de referencia con RUT y dígito verificador válidos (módulo 11).
const CALIFICACIONES = [
  {
    id: 'cal-canon-lv-01', tenant_id: 'corr-lv-01', rut_cliente: '96.555.120-4',
    razon_social: 'Inversiones Santa Blanca S.A.', nemotecnico: 'CHILE', periodo_fiscal: 2026,
    modalidad: 'FACTOR', valor_nominal: 450000000, no_inscrito: 0,
    factores: { f08: 0.45, f09: 0.15, f10: 0.05, f11: 0, f12: 0, f13: 0.15, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 },
  },
  {
    id: 'cal-canon-lv-02', tenant_id: 'corr-lv-01', rut_cliente: '77.102.340-1',
    razon_social: 'Rentas y Valores El Golf SpA', nemotecnico: 'SQM-B', periodo_fiscal: 2026,
    modalidad: 'MONTO', valor_nominal: 1200000000, no_inscrito: 0,
    factores: { f08: 0.5, f09: 0.1, f10: 0.1, f11: 0.05, f12: 0, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0.05 },
  },
  {
    id: 'cal-canon-bc-01', tenant_id: 'corr-bc-02', rut_cliente: '96.888.777-7',
    razon_social: 'Banchile Administradora General de Fondos S.A.', nemotecnico: 'FALABELLA', periodo_fiscal: 2026,
    modalidad: 'FACTOR', valor_nominal: 820000000, no_inscrito: 0,
    factores: { f08: 0.5, f09: 0.2, f10: 0.1, f11: 0.05, f12: 0, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
  },
  {
    id: 'cal-canon-bc-02', tenant_id: 'corr-bc-02', rut_cliente: '76.432.198-7',
    razon_social: 'Inversiones Forestales del Sur Ltda.', nemotecnico: 'CENCOSUD', periodo_fiscal: 2026,
    modalidad: 'FACTOR', valor_nominal: 540000000, no_inscrito: 0,
    factores: { f08: 0.4, f09: 0.1, f10: 0.1, f11: 0.05, f12: 0.05, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
  },
  {
    id: 'cal-canon-cc-01', tenant_id: 'corr-cc-03', rut_cliente: '77.555.444-4',
    razon_social: 'Credicorp Capital Asset Management', nemotecnico: 'IPSA', periodo_fiscal: 2026,
    modalidad: 'FACTOR', valor_nominal: 680000000, no_inscrito: 0,
    factores: { f08: 0.45, f09: 0.15, f10: 0.1, f11: 0.05, f12: 0.03, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
  },
  {
    id: 'cal-canon-cc-02', tenant_id: 'corr-cc-03', rut_cliente: '78.910.222-8',
    razon_social: 'Fondo Andino de Inversiones', nemotecnico: 'BCI', periodo_fiscal: 2026,
    modalidad: 'MONTO', valor_nominal: 310000000, no_inscrito: 0,
    factores: { f08: 0.35, f09: 0.12, f10: 0.1, f11: 0.05, f12: 0, f13: 0.1, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0 },
  },
];

function sumaFactores(factores) {
  const campos = ['f08', 'f09', 'f10', 'f11', 'f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19'];
  const suma = campos.reduce((acc, c) => acc + (parseFloat(factores[c]) || 0), 0);
  return Math.round(suma * 1000000) / 1000000;
}

function ejecutarSeed() {
  const db = getDb();
  const passwordHash = bcrypt.hashSync(SEED_DEFAULT_PASSWORD, 10);

  const insertCorredora = db.prepare(
    `INSERT OR IGNORE INTO corredoras (id, codigo, nombre, pais, mercado) VALUES (@id, @codigo, @nombre, @pais, @mercado)`
  );
  const insertUsuario = db.prepare(
    `INSERT OR IGNORE INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, permissions, cargo, avatar)
     VALUES (@id, @tenant_id, @nombre, @email, @password_hash, @rol, @permissions, @cargo, @avatar)`
  );
  const insertInstrumento = db.prepare(
    `INSERT OR IGNORE INTO bolsa_central_instrumentos (nemotecnico, razon_social, mercado)
     VALUES (@nemotecnico, @razon_social, @mercado)`
  );
  const insertCalificacion = db.prepare(
    `INSERT OR IGNORE INTO calificaciones_tributarias
       (id, tenant_id, rut_cliente, razon_social, nemotecnico, periodo_fiscal, modalidad, valor_nominal, no_inscrito, suma_factores)
     VALUES (@id, @tenant_id, @rut_cliente, @razon_social, @nemotecnico, @periodo_fiscal, @modalidad, @valor_nominal, @no_inscrito, @suma_factores)`
  );
  const insertFactores = db.prepare(
    `INSERT OR IGNORE INTO factores_detalle
       (id, calificacion_id, f08, f09, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, suma_total)
     VALUES (@id, @calificacion_id, @f08, @f09, @f10, @f11, @f12, @f13, @f14, @f15, @f16, @f17, @f18, @f19, @suma_total)`
  );

  const seed = db.transaction(() => {
    for (const c of CORREDORAS) insertCorredora.run(c);
    for (const u of USUARIOS) {
      insertUsuario.run({
        id: `usr-${u.email}`,
        tenant_id: u.tenant_id,
        nombre: u.nombre,
        email: u.email,
        password_hash: passwordHash,
        rol: u.rol,
        permissions: '[]',
        cargo: u.cargo,
        avatar: u.nombre.slice(0, 2).toUpperCase(),
      });
    }
    for (const ins of INSTRUMENTOS) insertInstrumento.run(ins);
    for (const cal of CALIFICACIONES) {
      const suma = sumaFactores(cal.factores);
      insertCalificacion.run({
        id: cal.id,
        tenant_id: cal.tenant_id,
        rut_cliente: cal.rut_cliente,
        razon_social: cal.razon_social,
        nemotecnico: cal.nemotecnico,
        periodo_fiscal: cal.periodo_fiscal,
        modalidad: cal.modalidad,
        valor_nominal: cal.valor_nominal,
        no_inscrito: cal.no_inscrito,
        suma_factores: suma,
      });
      insertFactores.run({
        id: `fac-${cal.id}`,
        calificacion_id: cal.id,
        f08: cal.factores.f08, f09: cal.factores.f09, f10: cal.factores.f10, f11: cal.factores.f11,
        f12: cal.factores.f12, f13: cal.factores.f13, f14: cal.factores.f14, f15: cal.factores.f15,
        f16: cal.factores.f16, f17: cal.factores.f17, f18: cal.factores.f18, f19: cal.factores.f19,
        suma_total: suma,
      });
    }
  });
  seed();
}

module.exports = { ejecutarSeed, CORREDORAS, USUARIOS, INSTRUMENTOS, CALIFICACIONES, SEED_DEFAULT_PASSWORD };
