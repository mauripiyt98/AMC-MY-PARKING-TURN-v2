-- Separa los datos de los conductores de los cobros de mensualidades.
-- La información existente se conserva: la tabla anterior de cobros se renombra
-- y se enlaza con el conductor asociado a cada mensualidad.

CREATE TABLE IF NOT EXISTS conductores_mensualidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    nombre VARCHAR(150) NOT NULL,
    documento VARCHAR(20),
    contacto VARCHAR(20),
    direccion VARCHAR(150),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS conductores_mensualidades_documento_unique
    ON conductores_mensualidades(parqueadero_id, documento)
    WHERE documento IS NOT NULL AND documento <> '';

CREATE INDEX IF NOT EXISTS conductores_mensualidades_tenant_nombre_idx
    ON conductores_mensualidades(parqueadero_id, nombre);

ALTER TABLE conductores_mensualidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE conductores_mensualidades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON conductores_mensualidades;
CREATE POLICY tenant_isolation ON conductores_mensualidades FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());

DROP TRIGGER IF EXISTS set_updated_at ON conductores_mensualidades;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON conductores_mensualidades
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE mensualidades
    ADD COLUMN IF NOT EXISTS conductor_id UUID REFERENCES conductores_mensualidades(id) ON DELETE SET NULL;

-- Migra los conductores ya guardados dentro de mensualidades.
INSERT INTO conductores_mensualidades (parqueadero_id, nombre, documento, contacto, direccion)
SELECT DISTINCT ON (parqueadero_id, documento)
    parqueadero_id, COALESCE(NULLIF(responsable, ''), placa), NULLIF(documento, ''), contacto, direccion
FROM mensualidades
WHERE NULLIF(documento, '') IS NOT NULL
ORDER BY parqueadero_id, documento, creado_en DESC
ON CONFLICT (parqueadero_id, documento) WHERE documento IS NOT NULL AND documento <> '' DO NOTHING;

UPDATE mensualidades m
SET conductor_id = c.id
FROM conductores_mensualidades c
WHERE m.conductor_id IS NULL
  AND m.parqueadero_id = c.parqueadero_id
  AND NULLIF(m.documento, '') = c.documento;

CREATE INDEX IF NOT EXISTS mensualidades_tenant_conductor_idx
    ON mensualidades(parqueadero_id, conductor_id, creado_en DESC);

-- La tabla 011 ya era exclusiva de cobros. Se renombra para dejarlo explícito
-- y mantener intactos sus registros, índices, RLS y trigger.
DO $$
BEGIN
    IF to_regclass('public.gestion_cobros_mensualidades') IS NULL
       AND to_regclass('public.mensualidad_cobros') IS NOT NULL THEN
        ALTER TABLE mensualidad_cobros RENAME TO gestion_cobros_mensualidades;
    END IF;
END $$;

ALTER TABLE gestion_cobros_mensualidades
    ADD COLUMN IF NOT EXISTS conductor_id UUID REFERENCES conductores_mensualidades(id) ON DELETE SET NULL;

UPDATE gestion_cobros_mensualidades g
SET conductor_id = m.conductor_id
FROM mensualidades m
WHERE g.mensualidad_id = m.id
  AND g.conductor_id IS NULL;

CREATE INDEX IF NOT EXISTS gestion_cobros_mensualidades_tenant_conductor_idx
    ON gestion_cobros_mensualidades(parqueadero_id, conductor_id, estado, creado_en DESC);

-- En instalaciones que ya usan el rol restringido de la aplicación, habilita
-- las dos tablas nuevas sin exigir que dicho rol exista en entornos locales.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mpt_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON conductores_mensualidades TO mpt_app;
        GRANT SELECT, INSERT, UPDATE, DELETE ON gestion_cobros_mensualidades TO mpt_app;
    END IF;
END $$;

INSERT INTO migrations_log (filename) VALUES ('012_conductores_y_gestion_cobros_mensualidades.sql')
ON CONFLICT (filename) DO NOTHING;
