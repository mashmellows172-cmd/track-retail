-- 1. Crear tabla principal de ventas
CREATE TABLE ventas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio           TEXT NOT NULL,
  fecha_compra    DATE NOT NULL,
  canal           TEXT NOT NULL CHECK (canal IN ('caja', 'internet')),
  precio_producto NUMERIC(12, 0) NOT NULL,
  cantidad_unidades INTEGER NOT NULL DEFAULT 1,
  valor_garantia  NUMERIC(12, 0) NOT NULL DEFAULT 0,
  anos_garantia   INTEGER CHECK (anos_garantia IN (1, 2, 3, 4)),
  tipo_garantia   TEXT CHECK (tipo_garantia IN ('telefonia', 'lineas_duras')),
  total_boleta    NUMERIC(12, 0) NOT NULL,
  numero_pedido   TEXT,
  comision_calculada NUMERIC(12, 0) DEFAULT 0,
  vendedor_id     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT folio_fecha_canal_unique UNIQUE (folio, fecha_compra, canal)
);

-- 2. Crear tabla de comisiones para Telefonía
CREATE TABLE tramos_comision_telefonia (
  id          SERIAL PRIMARY KEY,
  tramo       INTEGER NOT NULL,
  monto_min   NUMERIC(12, 0) NOT NULL,
  monto_max   NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL
);

-- Poblar Telefonía (Tabla 1)
INSERT INTO tramos_comision_telefonia VALUES
(DEFAULT, 1, 4000,   20000,  1200, 1000),
(DEFAULT, 2, 20001,  60000,  1200, 2000),
(DEFAULT, 3, 60001,  100000, 2400, 4000),
(DEFAULT, 4, 100001, 151000, 3600, 6000),
(DEFAULT, 5, 151001, 251000, 5900, 9900),
(DEFAULT, 6, 251001, NULL,   9100, 15000);

-- 3. Crear tabla de comisiones para Líneas Duras
CREATE TABLE tramos_comision_lineas_duras (
  id          SERIAL PRIMARY KEY,
  tramo       INTEGER NOT NULL,
  monto_min   NUMERIC(12, 0) NOT NULL,
  monto_max   NUMERIC(12, 0),
  comision_1ano  NUMERIC(12, 0) NOT NULL,
  comision_2anos NUMERIC(12, 0) NOT NULL,
  comision_3anos NUMERIC(12, 0) NOT NULL,
  comision_4anos NUMERIC(12, 0) NOT NULL
);

-- Poblar Líneas Duras (Tabla 2)
INSERT INTO tramos_comision_lineas_duras VALUES
(DEFAULT, 1, 4000,   20000,  600,  1000, 1200, 1400),
(DEFAULT, 2, 20001,  60000,  1200, 2000, 2400, 2800),
(DEFAULT, 3, 60001,  100000, 2400, 4000, 4800, 5600),
(DEFAULT, 4, 100001, 151000, 3600, 6000, 7200, 8400),
(DEFAULT, 5, 151001, 251000, 5900, 9900, 12000, 14000),
(DEFAULT, 6, 251001, NULL,   9100, 15000, 18000, 21000);

-- 4. Función SQL para calcular comisión automáticamente
CREATE OR REPLACE FUNCTION calcular_comision()
RETURNS TRIGGER AS $$
DECLARE
  resultado NUMERIC := 0;
BEGIN
  IF NEW.tipo_garantia = 'telefonia' THEN
    SELECT CASE NEW.anos_garantia
      WHEN 1 THEN comision_1ano
      WHEN 2 THEN comision_2anos
    END INTO resultado
    FROM tramos_comision_telefonia
    WHERE NEW.valor_garantia >= monto_min
      AND (monto_max IS NULL OR NEW.valor_garantia <= monto_max);
      
  ELSIF NEW.tipo_garantia = 'lineas_duras' THEN
    SELECT CASE NEW.anos_garantia
      WHEN 1 THEN comision_1ano
      WHEN 2 THEN comision_2anos
      WHEN 3 THEN comision_3anos
      WHEN 4 THEN comision_4anos
    END INTO resultado
    FROM tramos_comision_lineas_duras
    WHERE NEW.valor_garantia >= monto_min
      AND (monto_max IS NULL OR NEW.valor_garantia <= monto_max);
  END IF;
  
  -- Si resultado es null, dejamos en 0
  NEW.comision_calculada := COALESCE(resultado, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para ejecutar la función antes de insertar o actualizar
CREATE TRIGGER trigger_calcular_comision
BEFORE INSERT OR UPDATE ON ventas
FOR EACH ROW
EXECUTE FUNCTION calcular_comision();

-- 6. Políticas de Row Level Security (RLS) para permitir registro y consulta de ventas
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir inserts a anon y authenticated" ON ventas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Permitir selects a anon y authenticated" ON ventas
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Permitir updates a anon y authenticated" ON ventas
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir deletes a anon y authenticated" ON ventas
  FOR DELETE
  TO anon, authenticated
  USING (true);
