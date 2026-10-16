-- MODELO DE DATOS RELACIONAL (3FN) - nuam exchange
-- Se conserva el esquema normalizado existente; se añade el modelo de autenticación
-- (password_hash, rol, permissions, activo) y la tabla de auditoría.
-- Las tablas se crean con IF NOT EXISTS; la evolución de columnas se gestiona
-- de forma idempotente en migrate.js mediante PRAGMA user_version.


-- 1. Corredoras participantes (aislamiento multi-tenant)
CREATE TABLE IF NOT EXISTS corredoras (
    id VARCHAR(36) PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    pais VARCHAR(50) NOT NULL,
    mercado VARCHAR(30) NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Usuarios institucionales (control de acceso RBAC)
CREATE TABLE IF NOT EXISTS usuarios (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    rango VARCHAR(30) NOT NULL DEFAULT 'OPERADOR_SENIOR',
    cargo VARCHAR(100) NOT NULL DEFAULT '',
    avatar VARCHAR(10) DEFAULT 'OP',
    estado VARCHAR(20) DEFAULT 'ACTIVO',
    password_hash TEXT,
    rol VARCHAR(30),
    permissions TEXT NOT NULL DEFAULT '[]',
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso VARCHAR(50) DEFAULT 'Reciente',
    FOREIGN KEY (tenant_id) REFERENCES corredoras(id) ON DELETE RESTRICT
);

-- 3. Declaraciones de calificaciones tributarias (3FN)
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
    CONSTRAINT uq_calificacion_tenant UNIQUE (tenant_id, rut_cliente, nemotecnico, periodo_fiscal)
);

-- 4. Detalle de factores tributarios F08 a F19 (desagregación 3FN)
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
    CONSTRAINT chk_regla_suma_factores CHECK (suma_total >= 0.000000 AND suma_total <= 1.000001)
);

-- 5. Catálogo oficial de instrumentos de la Bolsa Central
CREATE TABLE IF NOT EXISTS bolsa_central_instrumentos (
    nemotecnico VARCHAR(30) PRIMARY KEY,
    razon_social VARCHAR(150) NOT NULL,
    mercado VARCHAR(50) NOT NULL,
    activo INTEGER DEFAULT 1
);

-- 6. Registro oficial de auditoría (trazabilidad inmutable de eventos de negocio)
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id VARCHAR(36) PRIMARY KEY,
    usuario_id VARCHAR(36),
    usuario_email VARCHAR(100),
    accion VARCHAR(50) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    entidad_id VARCHAR(36),
    tenant_id VARCHAR(36),
    detalle TEXT,
    ip VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calificaciones_tenant_rut ON calificaciones_tributarias(tenant_id, rut_cliente);
CREATE INDEX IF NOT EXISTS idx_factores_calificacion ON factores_detalle(calificacion_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria_eventos(created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria_eventos(usuario_email);
