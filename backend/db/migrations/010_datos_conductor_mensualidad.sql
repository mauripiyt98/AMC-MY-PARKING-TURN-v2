-- Datos de contacto asociados a cada mensualidad.
ALTER TABLE mensualidades
    ADD COLUMN IF NOT EXISTS responsable VARCHAR(150),
    ADD COLUMN IF NOT EXISTS documento VARCHAR(20),
    ADD COLUMN IF NOT EXISTS contacto VARCHAR(20),
    ADD COLUMN IF NOT EXISTS direccion VARCHAR(150);

INSERT INTO migrations_log (filename) VALUES ('010_datos_conductor_mensualidad.sql')
ON CONFLICT (filename) DO NOTHING;
