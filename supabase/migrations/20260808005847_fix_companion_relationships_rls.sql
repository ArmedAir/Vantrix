ALTER TABLE companion_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companion_relationships_read_all" ON companion_relationships;
CREATE POLICY "companion_relationships_read_all" ON companion_relationships
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "companion_relationships_service_write" ON companion_relationships;
CREATE POLICY "companion_relationships_service_write" ON companion_relationships
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
