-- Operacion persistente por parqueadero. PostgreSQL es la fuente de verdad;
-- ninguna tabla operativa depende del navegador ni de carpetas por cliente.

CREATE TABLE IF NOT EXISTS turnos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    ticket_numero BIGINT NOT NULL CHECK (ticket_numero > 0),
    placa VARCHAR(8) NOT NULL CHECK (placa = upper(placa)),
    tipo_vehiculo VARCHAR(20) NOT NULL,
    tarifa_hora INTEGER NOT NULL CHECK (tarifa_hora >= 0),
    ingreso_en TIMESTAMPTZ NOT NULL,
    salida_en TIMESTAMPTZ,
    horas_cobradas INTEGER CHECK (horas_cobradas > 0),
    total_cobrado INTEGER CHECK (total_cobrado >= 0),
    total_calculado INTEGER CHECK (total_calculado >= 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO', 'FINALIZADO', 'ANULADO')),
    creado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_por_nombre VARCHAR(150) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT turnos_tenant_ticket_unique UNIQUE (parqueadero_id, ticket_numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS turnos_placa_activa_unique
    ON turnos(parqueadero_id, placa) WHERE estado = 'ACTIVO';
CREATE INDEX IF NOT EXISTS turnos_tenant_estado_ingreso_idx
    ON turnos(parqueadero_id, estado, ingreso_en DESC);

CREATE TABLE IF NOT EXISTS mensualidades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    ticket_numero BIGINT NOT NULL CHECK (ticket_numero > 0),
    placa VARCHAR(8) NOT NULL CHECK (placa = upper(placa)),
    tipo_vehiculo VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL CHECK (fecha_vencimiento >= fecha_inicio),
    tarifa_mensual INTEGER NOT NULL CHECK (tarifa_mensual > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA', 'CERRADA', 'VENCIDA', 'ANULADA')),
    cerrada_en DATE,
    motivo_cierre VARCHAR(80),
    creado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_por_nombre VARCHAR(150) NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mensualidades_tenant_ticket_unique UNIQUE (parqueadero_id, ticket_numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS mensualidades_placa_activa_unique
    ON mensualidades(parqueadero_id, placa) WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS mensualidades_tenant_estado_vencimiento_idx
    ON mensualidades(parqueadero_id, estado, fecha_vencimiento);

-- Metadatos de comprobantes PDF. El archivo se guarda en almacenamiento privado
-- (S3/MinIO/VPS), nunca como binario público en la carpeta del navegador.
CREATE TABLE IF NOT EXISTS documentos_generados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    turno_id UUID REFERENCES turnos(id) ON DELETE SET NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('RECIBO_TURNO', 'REPORTE', 'FACTURA')),
    storage_key TEXT NOT NULL,
    checksum_sha256 CHAR(64),
    generado_por_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT documentos_storage_key_unique UNIQUE (storage_key)
);
CREATE INDEX IF NOT EXISTS documentos_tenant_creado_idx ON documentos_generados(parqueadero_id, creado_en DESC);

-- Auditoria inmutable para cierres, anulaciones, cambios de tarifas y exportaciones.
CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id BIGSERIAL PRIMARY KEY,
    parqueadero_id UUID NOT NULL REFERENCES parqueaderos(id) ON DELETE RESTRICT,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    tipo VARCHAR(60) NOT NULL,
    entidad VARCHAR(60) NOT NULL,
    entidad_id UUID,
    detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_origen INET,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auditoria_tenant_creado_idx ON auditoria_eventos(parqueadero_id, creado_en DESC);

-- Todas las tablas operativas son aisladas en el motor. El contexto solo lo fija
-- el backend a partir del JWT; el navegador no puede enviar un tenant arbitrario.
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos FORCE ROW LEVEL SECURITY;
ALTER TABLE mensualidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensualidades FORCE ROW LEVEL SECURITY;
ALTER TABLE documentos_generados ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_generados FORCE ROW LEVEL SECURITY;
ALTER TABLE auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria_eventos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON turnos;
CREATE POLICY tenant_isolation ON turnos FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());
DROP POLICY IF EXISTS tenant_isolation ON mensualidades;
CREATE POLICY tenant_isolation ON mensualidades FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());
DROP POLICY IF EXISTS tenant_isolation ON documentos_generados;
CREATE POLICY tenant_isolation ON documentos_generados FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());
DROP POLICY IF EXISTS tenant_isolation ON auditoria_eventos;
CREATE POLICY tenant_isolation ON auditoria_eventos FOR ALL TO PUBLIC
    USING (parqueadero_id = current_parqueadero_id())
    WITH CHECK (parqueadero_id = current_parqueadero_id());

DROP TRIGGER IF EXISTS set_updated_at ON turnos;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON turnos
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at ON mensualidades;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mensualidades
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

INSERT INTO migrations_log (filename) VALUES ('007_operacion_multi_tenant.sql')
ON CONFLICT (filename) DO NOTHING;
