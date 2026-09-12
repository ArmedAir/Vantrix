alter table public.profiles
  add column if not exists preferred_language text not null default 'en';

comment on column public.profiles.preferred_language is
  'User-selected UI/chat language code (e.g. en, es, fr, pt, de, ar, hi, sw). Set via /api/i18n/locale and read by the AI prompt layer so companions reply in the user''s preferred language.';

