-- First-run completion belongs to the account, not the browser.
--
-- It lived in localStorage under 'onboarding_done'. Consequences:
--
--   * A user who set up on their phone was walked through the entire tour
--     again on their laptop, as a returning user with data already loaded.
--   * Clearing site data, or a private window, restarted it a third time.
--   * There was no way to answer "how many people actually finish setup?",
--     which is the first question worth asking about a signup funnel.
--
-- Nullable timestamptz rather than a boolean: the completion TIME is the
-- useful fact. It supports "how long between signing up and finishing" and
-- "did people who joined after the redesign finish more often", neither of
-- which a boolean can answer. NULL means not finished.
--
-- localStorage is kept as the fast local gate - it works offline and stops
-- the redirect loop on the current device without a round trip - but the
-- profile is what the account is judged by.

alter table profiles
  add column if not exists onboarding_completed_at timestamptz;

comment on column profiles.onboarding_completed_at is
  'When the user finished or dismissed first run. NULL = not finished. '
  'Authoritative across devices; localStorage onboarding_done is a local '
  'cache of the same fact.';

-- Funnel question this exists to answer, kept here so the next person does
-- not have to reconstruct it:
--
--   select count(*) filter (where onboarding_completed_at is not null)
--          as finished,
--          count(*) as total
--   from profiles;
