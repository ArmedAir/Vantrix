DO $$
DECLARE
  pol record;
  new_qual text;
  new_check text;
  stmt text;
  touched int := 0;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual ~ 'auth\.(uid|role|jwt)\(\)' AND qual !~ 'select auth\.')
        OR
        (with_check IS NOT NULL AND with_check ~ 'auth\.(uid|role|jwt)\(\)' AND with_check !~ 'select auth\.')
      )
  LOOP
    new_qual  := pol.qual;
    new_check := pol.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)',  '(select auth.uid())',  'g');
      new_qual := regexp_replace(new_qual, 'auth\.role\(\)', '(select auth.role())', 'g');
      new_qual := regexp_replace(new_qual, 'auth\.jwt\(\)',  '(select auth.jwt())',  'g');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\(\)',  '(select auth.uid())',  'g');
      new_check := regexp_replace(new_check, 'auth\.role\(\)', '(select auth.role())', 'g');
      new_check := regexp_replace(new_check, 'auth\.jwt\(\)',  '(select auth.jwt())',  'g');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    touched := touched + 1;
  END LOOP;

  RAISE NOTICE 'auth_rls_initplan fix: % policies rewritten', touched;
END $$;

