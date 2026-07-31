-- MIGRACIÓN 003 — Contextos internos de autenticación para RLS.
-- El backend los establece dentro de transacciones; nunca vienen del navegador.

DROP POLICY IF EXISTS tenant_isolation ON usuarios;
CREATE POLICY tenant_isolation ON usuarios
    AS PERMISSIVE FOR ALL TO mpt_app
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
    AS PERMISSIVE FOR ALL TO mpt_app
    USING (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) = 'auth'
    )
    WITH CHECK (
        parqueadero_id = current_parqueadero_id()
        OR current_setting('app.request_context', TRUE) = 'auth'
    );

INSERT INTO migrations_log (filename) VALUES ('003_auth_context_rls.sql')
ON CONFLICT (filename) DO NOTHING;
