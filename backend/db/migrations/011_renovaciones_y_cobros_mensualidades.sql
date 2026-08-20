-- Renovaciones y estado de cobro por cada ticket mensual.
ALTER TABLE mensualidades
    ADD COLUMN IF NOT EXISTS renovacion_de_id UUID REFERENCES mensualidades(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS mensualidad_cobros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    mensualidad_id UUID NOT NULL REFERENCES mensualidades(id) ON DELETE CASCADE,
    valor INTEGER NOT NULL CHECK (valor > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'POR_COBRAR'
        CHECK (estado IN ('POR_COBRAR', 'PAGADO')),
    pagado_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mensualidad_cobros_ticket_unique UNIQUE (mensualidad_id)
);

INSERT INTO mensualidad_cobros (parqueadero_id, mensualidad_id, valor)
SELECT parqueadero_id, id, tarifa_mensual
FROM mensualidades
ON CONFLICT (mensualidad_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS mensualidad_cobros_tenant_estado_idx
    ON mensualidad_cobros(parqueadero_id, estado, creado_en DESC);

ALTER TABLE mensualidad_cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensualidad_cobros FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON mensualidad_cobros;
CREATE POLICY tenant_isolation ON mensualidad_cobros FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());

DROP TRIGGER IF EXISTS set_updated_at ON mensualidad_cobros;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mensualidad_cobros
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO migrations_log (filename) VALUES ('011_renovaciones_y_cobros_mensualidades.sql')
ON CONFLICT (filename) DO NOTHING;
