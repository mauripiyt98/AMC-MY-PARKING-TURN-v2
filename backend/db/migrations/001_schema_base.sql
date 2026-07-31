'use strict';

/**
 * ══════════════════════════════════════════════════════════════
 * MIGRACIÓN 001 — Esquema base multi-tenant
 * AMC My Parking Turn v2
 * Target  : PostgreSQL 15+
 * ══════════════════════════════════════════════════════════════
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Extensiones requeridas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- Búsqueda trigram full-text

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TABLA: parqueaderos  (el "tenant root" — cada fila es un parqueadero cliente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parqueaderos (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Identificador corto de acceso (ej: PARK001)
    codigo          VARCHAR(30)  NOT NULL,
    nombre          VARCHAR(200) NOT NULL,
    nit             VARCHAR(20),
    direccion       VARCHAR(300),
    ciudad          VARCHAR(100),
    departamento    VARCHAR(100),
    telefono        VARCHAR(30),
    email           VARCHAR(150),
    logo_url        TEXT,
    -- Control del tenant
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    plan            VARCHAR(30)  NOT NULL DEFAULT 'BASICO',  -- BASICO | PRO | ENTERPRISE
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- Código único globalmente
    CONSTRAINT parqueaderos_codigo_unique UNIQUE (codigo)
);

COMMENT ON TABLE  parqueaderos IS 'Tenant root: cada parqueadero es un tenant independiente';
COMMENT ON COLUMN parqueaderos.codigo IS 'Código corto de acceso para login (ej: PARK001). Único globalmente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TABLA: usuarios  (vinculados 1:N a parqueaderos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id  UUID         NOT NULL REFERENCES parqueaderos(id) ON DELETE CASCADE,
    nombre          VARCHAR(150) NOT NULL,
    documento       VARCHAR(20)  NOT NULL,      -- Cédula / NIT / Pasaporte (código de acceso)
    email           VARCHAR(150),
    password_hash   VARCHAR(200) NOT NULL,
    rol             VARCHAR(30)  NOT NULL DEFAULT 'OPERADOR',
    --   SUPERADMIN : acceso a panel de administración de parqueaderos (solo desarrollador)
    --   ADMIN      : gestiona su parqueadero y sus usuarios
    --   OPERADOR   : opera turnos y mensualidades de su parqueadero
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    ultimo_acceso   TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    -- El mismo documento puede existir en parqueaderos distintos, pero no dentro del mismo
    CONSTRAINT usuarios_parqueadero_documento_unique UNIQUE (parqueadero_id, documento)
);

COMMENT ON TABLE  usuarios IS 'Usuarios del sistema, siempre vinculados a un parqueadero (tenant)';
COMMENT ON COLUMN usuarios.rol IS 'SUPERADMIN | ADMIN | OPERADOR';
COMMENT ON COLUMN usuarios.documento IS 'Número de documento de identidad — usado como código de acceso al login';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLA: sesiones_jwt  (para revocación de tokens y auditoría)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones_jwt (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    parqueadero_id  UUID         NOT NULL REFERENCES parqueaderos(id) ON DELETE CASCADE,
    jti             VARCHAR(100) NOT NULL,       -- JWT ID único (uuid dentro del token)
    expira_en       TIMESTAMPTZ  NOT NULL,
    revocado        BOOLEAN      NOT NULL DEFAULT FALSE,
    ip_origen       INET,
    user_agent      TEXT,
    creado_en       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT sesiones_jwt_jti_unique UNIQUE (jti)
);

COMMENT ON TABLE sesiones_jwt IS 'Registro de tokens JWT emitidos para revocación y auditoría';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABLA: migrations_log  (control de migraciones ejecutadas)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrations_log (
    id           SERIAL       PRIMARY KEY,
    filename     VARCHAR(100) NOT NULL UNIQUE,
    ejecutado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE migrations_log IS 'Registro de migraciones SQL ejecutadas';

-- Marcar esta migración como ejecutada
INSERT INTO migrations_log (filename) VALUES ('001_schema_base.sql')
ON CONFLICT (filename) DO NOTHING;
