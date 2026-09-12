DO $$
DECLARE
  fk record;
  idx_name text;
  stmt text;
  created int := 0;
BEGIN
  FOR fk IN
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
        WHERE c.relname = tc.table_name
          AND a.attname = kcu.column_name
          AND i.indkey[0] != 0
      )
    ORDER BY tc.table_name, kcu.column_name
  LOOP
    idx_name := 'idx_' || fk.table_name || '_' || fk.column_name;
    stmt := format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)',
      idx_name, fk.table_name, fk.column_name
    );
    EXECUTE stmt;
    created := created + 1;
  END LOOP;

  RAISE NOTICE 'unindexed_foreign_keys fix: % indexes created', created;
END $$;

