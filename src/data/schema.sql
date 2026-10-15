-- ==============================================================================
-- MODELO DE BASE DE DATOS RELACIONAL ESTRUCTURADA EN TERCERA FORMA NORMAL (3FN)
-- Caso de Estudio: nuam exchange - Mantenedor de Calificaciones Tributarias
-- Criterio de Rúbrica: 2.1.4.8 (Base de Datos Relacional Normalizada)
-- Motor: SQLite 3 / PostgreSQL Compatible
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. Tabla de Corredoras Participantes (Aislamiento Multitenant)
CREATE TABLE IF NOT EXISTS corredoras (
    id VARCHAR(36) PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    pais VARCHAR(50) NOT NULL,
    mercado VARCHAR(30) NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Usuarios Institucionales (Control de Acceso RBAC)
CREATE TABLE IF NOT EXISTS usuarios (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    rango VARCHAR(30) NOT NULL DEFAULT 'OPERADOR_SENIOR', -- SUPER_ADMIN, ADMIN_CORREDORA, OPERADOR_SENIOR, AUDITOR_CMF
    cargo VARCHAR(100) NOT NULL,
    avatar VARCHAR(10) DEFAULT 'OP',
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso VARCHAR(50) DEFAULT 'Reciente',
    FOREIGN KEY (tenant_id) REFERENCES corredoras(id) ON DELETE RESTRICT
);

-- 3. Tabla Principal de Calificaciones Tributarias (3FN: Posición Global)
CREATE TABLE IF NOT EXISTS calificaciones_tributarias (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    rut_cliente VARCHAR(20) NOT NULL,
    razon_social VARCHAR(150) NOT NULL,
    nemotecnico VARCHAR(30) NOT NULL,
    periodo_fiscal INTEGER NOT NULL,
    modalidad VARCHAR(20) NOT NULL CHECK (modalidad IN ('MONTO', 'FACTOR')),
    valor_nominal NUMERIC(18, 4) DEFAULT 0.0000,
    no_inscrito INTEGER DEFAULT 0,
    suma_factores NUMERIC(10, 6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES corredoras(id) ON DELETE RESTRICT,
    -- Restricción de unicidad para soporte de UPSERT por Corredora
    CONSTRAINT uq_calificacion_tenant UNIQUE (tenant_id, rut_cliente, nemotecnico, periodo_fiscal)
);

-- 4. Tabla Detalle de Factores Tributarios F08 a F19 (3FN: Desagregación de Factores)
CREATE TABLE IF NOT EXISTS factores_detalle (
    id VARCHAR(36) PRIMARY KEY,
    calificacion_id VARCHAR(36) NOT NULL UNIQUE,
    f08 NUMERIC(10, 6) DEFAULT 0.000000,
    f09 NUMERIC(10, 6) DEFAULT 0.000000,
    f10 NUMERIC(10, 6) DEFAULT 0.000000,
    f11 NUMERIC(10, 6) DEFAULT 0.000000,
    f12 NUMERIC(10, 6) DEFAULT 0.000000,
    f13 NUMERIC(10, 6) DEFAULT 0.000000,
    f14 NUMERIC(10, 6) DEFAULT 0.000000,
    f15 NUMERIC(10, 6) DEFAULT 0.000000,
    f16 NUMERIC(10, 6) DEFAULT 0.000000,
    f17 NUMERIC(10, 6) DEFAULT 0.000000,
    f18 NUMERIC(10, 6) DEFAULT 0.000000,
    f19 NUMERIC(10, 6) DEFAULT 0.000000,
    suma_total NUMERIC(10, 6) NOT NULL,
    FOREIGN KEY (calificacion_id) REFERENCES calificaciones_tributarias(id) ON DELETE CASCADE,
    -- Restricción de Integridad CHECK: Garantiza la Regla Fiscal en el Motor SQL (Sumatoria <= 1.0)
    CONSTRAINT chk_regla_suma_factores CHECK (suma_total >= 0.000000 AND suma_total <= 1.000001)
);

-- 5. Catálogo Oficial de Instrumentos de Bolsa Central (SOLO LECTURA)
CREATE TABLE IF NOT EXISTS bolsa_central_instrumentos (
    nemotecnico VARCHAR(30) PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    mercado VARCHAR(50) NOT NULL,
    activo INTEGER DEFAULT 1
);
