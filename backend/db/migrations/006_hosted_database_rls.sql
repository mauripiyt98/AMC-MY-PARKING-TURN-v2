-- MIGRACION 006 - Permite usar el usuario administrado de DATABASE_URL.
-- Conserva el aislamiento tenant y los contextos internos de autenticacion.

DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    AS PERMISSIVE FOR ALL TO PUBLIC
    USING (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) IN ('auth', 'system')
    )
    WITH CHECK (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) IN ('auth', 'system')
    );

DROP POLICY IF EXISTS tenant_isolation ON sesiones_jwt;
CREATE POLICY tenant_isolation ON sesiones_jwt
    AS PERMISSIVE FOR ALL TO PUBLIC
    USING (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) = 'auth'
    )
    WITH CHECK (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) = 'auth'
    );

INSERT INTO migrations_log (filename) VALUES ('006_hosted_database_rls.sql')
ON CONFLICT (filename) DO NOTHING;
