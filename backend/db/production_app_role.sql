-- Ejecutar UNA VEZ como administrador PostgreSQL en el VPS, después de las
-- migraciones. Cambie la contraseña y, si usa otro nombre, reemplace mpt_app.
-- Las migraciones deben seguir ejecutándose con DB_SUPER_URL, no con mpt_app.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpt_app') THEN
        CREATE ROLE mpt_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END;
$$;

-- Asigne una contraseña larga únicamente en el VPS, por ejemplo:
-- ALTER ROLE mpt_app PASSWORD 'REEMPLAZAR_CON_SECRETO_LARGO_Y_ALEATORIO';

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO mpt_app', current_database());
END;
$$;
GRANT USAGE ON SCHEMA public TO mpt_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON parqueaderos TO mpt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON usuarios TO mpt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones_jwt TO mpt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON turnos TO mpt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mensualidades TO mpt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON documentos_generados TO mpt_app;

-- La auditoría solo es consultable y anexable por la aplicación.
REVOKE ALL ON auditoria_eventos FROM mpt_app;
GRANT SELECT, INSERT ON auditoria_eventos TO mpt_app;
GRANT USAGE, SELECT ON SEQUENCE auditoria_eventos_id_seq TO mpt_app;

-- El dueño/migrador conserva la administración del esquema; mpt_app no debe
-- ser dueño de las tablas ni recibir SUPERUSER o BYPASSRLS.
