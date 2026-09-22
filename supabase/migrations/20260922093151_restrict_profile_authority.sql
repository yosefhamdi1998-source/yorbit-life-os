-- RLS restricts which profile a user can edit, not which fields.
-- Role and AI tier are server authority, never client preferences.
revoke update on table public.profiles from public, anon, authenticated;
revoke update (id, role, ai_tier, created_date, updated_date)
  on table public.profiles from public, anon, authenticated;
grant update (email, onboarding_completed_at, ai_consent_at,
  ai_consent_declined_at, ai_consent_version)
  on table public.profiles to authenticated;
-- Owner-only RLS and existing service-role privileges remain in force.
