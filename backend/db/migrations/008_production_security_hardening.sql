-- Endurecimiento de producción: bitácora append-only y políticas RLS explícitas.
-- La cuenta de aplicación debe ser un rol sin SUPERUSER/BYPASSRLS y no dueño
-- de las tablas. La migración se ejecuta con DB_SUPER_URL o el dueño del esquema.

ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_eventos FORCE ROW LEVEL SECURITY;

-- Reemplaza la política FOR ALL: cada tenant puede leer e insertar sus propios
-- eventos, pero RLS niega UPDATE y DELETE aunque una ruta futura los exponga.
DROP POLICY IF EXISTS tenant_isolation ON auditoria_eventos;
DROP POLICY IF EXISTS auditoria_select_tenant ON auditoria_eventos;
DROP POLICY IF EXISTS auditoria_insert_tenant ON auditoria_eventos;

CREATE POLICY auditoria_select_tenant ON auditoria_eventos
    FOR SELECT TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id());

CREATE POLICY auditoria_insert_tenant ON auditoria_eventos
    FOR INSERT TO PUBLIC
    WITH CHECK (parqueadero_id = current_parqueadero_id());

-- Defensa adicional frente a código futuro: una entrada ya escrita no puede
-- editarse ni eliminarse a través de UPDATE/DELETE. Un superusuario de la base
-- siempre conserva capacidad administrativa; por eso los respaldos son aparte.
CREATE OR REPLACE FUNCTION bloquear_mutacion_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'auditoria_eventos es append-only: UPDATE y DELETE no están permitidos';
END;
$$;

DROP TRIGGER IF EXISTS auditoria_append_only ON auditoria_eventos;
CREATE TRIGGER auditoria_append_only
    BEFORE UPDATE OR DELETE ON auditoria_eventos
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion_auditoria();

-- Revoca privilegios accidentales para roles genéricos. El rol específico de
-- aplicación se valida con `npm run preflight:production` antes del despliegue.
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_eventos FROM PUBLIC;

INSERT INTO migrations_log (filename) VALUES ('008_production_security_hardening.sql')
ON CONFLICT (filename) DO NOTHING;
