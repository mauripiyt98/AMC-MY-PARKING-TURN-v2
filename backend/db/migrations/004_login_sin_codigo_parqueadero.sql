-- MIGRACIÓN 004 — Inicio de sesión con usuario y contraseña solamente.
-- Un documento debe identificar a una sola cuenta para deducir el tenant.

DO $$
BEGIN
    IF EXISTS (
        SELECT documento FROM usuarios GROUP BY documento HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'No se puede habilitar el inicio sin código: existen documentos duplicados entre parqueaderos.';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'usuarios'::regclass
          AND conname = 'usuarios_documento_unique'
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT usuarios_documento_unique UNIQUE (documento);
    END IF;
END
$$;

INSERT INTO migrations_log (filename) VALUES ('004_login_sin_codigo_parqueadero.sql')
ON CONFLICT (filename) DO NOTHING;
