alter table public.digital_twin_profiles
  add column if not exists last_training_depth text
    check (last_training_depth in ('standard', 'deep', 'master'));

