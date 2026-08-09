-- Operadores de caja y trazabilidad por turno.
CREATE TABLE IF NOT EXISTS operadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE CASCADE,
    nombre VARCHAR(150) NOT NULL,
    codigo_hash VARCHAR(200) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operadores_tenant_activo_idx
    ON operadores(parqueadero_id, activo, nombre);

ALTER TABLE operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE operadores FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON operadores;
CREATE POLICY tenant_isolation ON operadores FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());

ALTER TABLE turnos
    ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS operador_nombre VARCHAR(150);

CREATE INDEX IF NOT EXISTS turnos_tenant_operador_idx
    ON turnos(parqueadero_id, operador_id, ingreso_en DESC);

INSERT INTO migrations_log (filename) VALUES ('009_operadores_activos.sql')
ON CONFLICT (filename) DO NOTHING;
