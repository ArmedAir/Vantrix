CREATE OR REPLACE FUNCTION sync_character_tier_premium_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_premium = true AND NEW.min_tier = 'free' THEN
    NEW.min_tier := 'spark';
  END IF;

  IF NEW.min_tier <> 'free' AND NEW.is_premium = false THEN
    NEW.is_premium := true;
  END IF;

  RETURN NEW;
END;
$$;
