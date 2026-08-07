-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 002 — Row Level Security (RLS)
-- Segunda capa de defensa: PostgreSQL bloquea acceso a datos de otro tenant
-- directamente a nivel de motor, incluso si el middleware falla.
-- AMC My Parking Turn v2
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rol de aplicación  (el backend se conecta con este rol)
-- ─────────────────────────────────────────────────────────────────────────────
-- El usuario de conexion lo entrega DATABASE_URL. No se crea un rol fijo
-- porque PostgreSQL administrado normalmente no permite CREATE ROLE.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Habilitar RLS en todas las tablas operativas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_jwt   ENABLE ROW LEVEL SECURITY;

-- FORCE RLS: se aplica también al propietario de la tabla (máxima seguridad)
ALTER TABLE usuarios       FORCE ROW LEVEL SECURITY;
ALTER TABLE sesiones_jwt   FORCE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función helper para leer el parqueadero_id de la sesión actual
--    El backend lo setea con: SET LOCAL app.parqueadero_id = '<uuid>'
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_parqueadero_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
    SELECT NULLIF(current_setting('app.parqueadero_id', TRUE), '')::UUID;
$$;

COMMENT ON FUNCTION current_parqueadero_id() IS
    'Retorna el parqueadero_id del contexto de sesión actual. Usado por las políticas RLS.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Políticas RLS — cada política filtra por parqueadero_id de la sesión
-- ─────────────────────────────────────────────────────────────────────────────

-- ── usuarios (un usuario solo ve usuarios de su parqueadero) ──
DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    AS PERMISSIVE
    FOR ALL
    TO PUBLIC
    USING       (parqueadero_id = current_parqueadero_id())
    WITH CHECK  (parqueadero_id = current_parqueadero_id());

-- ── sesiones_jwt ──────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON sesiones_jwt;
CREATE POLICY tenant_isolation ON sesiones_jwt
    AS PERMISSIVE
    FOR ALL
    TO PUBLIC
    USING       (parqueadero_id = current_parqueadero_id())
    WITH CHECK  (parqueadero_id = current_parqueadero_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Permisos al rol mpt_app
-- ─────────────────────────────────────────────────────────────────────────────


-- parqueaderos: mpt_app solo puede leer y actualizar su propio parqueadero
-- (crear parqueaderos requiere superuser — lo hace el seed o el panel de admin)

-- Secuencias

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Función de auditoría: actualizar automáticamente actualizado_en
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$;

-- Aplicar trigger a todas las tablas con columna actualizado_en
DROP TRIGGER IF EXISTS set_updated_at ON parqueaderos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON parqueaderos
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON usuarios;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Marcar esta migración como ejecutada
INSERT INTO migrations_log (filename) VALUES ('002_rls_policies.sql')
ON CONFLICT (filename) DO NOTHING;
