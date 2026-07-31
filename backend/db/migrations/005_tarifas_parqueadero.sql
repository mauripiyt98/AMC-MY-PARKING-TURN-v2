-- Tarifas por hora configurables y aisladas por cada parqueadero.
ALTER TABLE parqueaderos
    ADD COLUMN IF NOT EXISTS tarifa_moto_hora INTEGER NOT NULL DEFAULT 1500
        CHECK (tarifa_moto_hora > 0),
    ADD COLUMN IF NOT EXISTS tarifa_carro_hora INTEGER NOT NULL DEFAULT 2500
        CHECK (tarifa_carro_hora > 0);

INSERT INTO migrations_log (filename) VALUES ('005_tarifas_parqueadero.sql')
ON CONFLICT (filename) DO NOTHING;
