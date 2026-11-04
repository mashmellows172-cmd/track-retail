-- ==============================================================================
-- TRACK-RETAIL / BRYANAPP: CORRECCIÓN DE POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==============================================================================
-- Este script soluciona el error PostgreSQL 42501:
-- "new row violates row-level security policy for table 'ventas'"
-- Ejecuta este script en el SQL Editor de tu panel de Supabase:
-- https://supabase.com/dashboard/project/rpemltlwbjnjeskjwzgs/sql/new
-- ==============================================================================

-- 1. Asegurar que RLS está activo y configurar políticas para 'ventas'
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;

-- 2. Permitir registrar nuevas boletas (INSERT) para usuarios anon y authenticated
DROP POLICY IF EXISTS "Permitir inserts a anon y authenticated" ON ventas;
CREATE POLICY "Permitir inserts a anon y authenticated" ON ventas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3. Permitir consultar ventas (SELECT) para historial y dashboards
DROP POLICY IF EXISTS "Permitir selects a anon y authenticated" ON ventas;
CREATE POLICY "Permitir selects a anon y authenticated" ON ventas
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. Permitir actualizar ventas si se requiere (UPDATE)
DROP POLICY IF EXISTS "Permitir updates a anon y authenticated" ON ventas;
CREATE POLICY "Permitir updates a anon y authenticated" ON ventas
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Permitir eliminar ventas si se requiere (DELETE)
DROP POLICY IF EXISTS "Permitir deletes a anon y authenticated" ON ventas;
CREATE POLICY "Permitir deletes a anon y authenticated" ON ventas
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- ==============================================================================
-- ALTERNATIVA DIRECTA:
-- Si prefieres desactivar completamente RLS para esta aplicación interna de tienda,
-- puedes simplemente descomentar y ejecutar la siguiente línea:
--
-- ALTER TABLE ventas DISABLE ROW LEVEL SECURITY;
-- ==============================================================================
