-- Explicit, per-account consent before any personal financial data reaches a
-- third-party AI.
--
-- WHAT IS ACTUALLY SENT TODAY, with no consent screen anywhere
--
-- supabase/functions/ai-coach/index.ts builds its prompt from the user's real
-- records and posts it to Anthropic:
--
--   line 267   `${t.date} ${sign}$${t.amount} ${t.category} "${t.title}"`
--              - individual transactions, including the TITLE, which is the
--                merchant or payee: "Daniel Barghuthy rent", "PAYPAL
--                *COINBASEINC", a person's name on a Venmo transfer.
--   line 261   per-category spending totals and budget limits
--   line 271   bills by name, amount, due date and paid status
--   line 292   the names of custom forms
--
-- That is identifiable personal financial information leaving the service to
-- a third-party processor. Apple requires disclosure and consent for this,
-- and it is the kind of processing a user must be able to refuse and later
-- withdraw. Neither existed.
--
-- WHY THIS IS A COLUMN AND NOT A CLIENT-SIDE FLAG
--
-- A checkbox in the browser is not consent, it is a suggestion: anything that
-- can call the edge function directly can skip it. The edge functions read
-- this column and refuse without it, so the gate lives on the same side of
-- the wire as the data.
--
-- Three states, and the difference matters:
--   ai_consent_at IS NULL and ai_consent_declined_at IS NULL  -> never asked
--   ai_consent_at IS NOT NULL                                 -> granted
--   ai_consent_declined_at IS NOT NULL, ai_consent_at NULL     -> refused
--
-- "Never asked" must show the consent screen. "Refused" must NOT nag - it
-- shows the non-AI state with a way back in. Collapsing those two into one
-- boolean turns a considered refusal into a prompt on every visit.

alter table profiles
  add column if not exists ai_consent_at timestamptz,
  add column if not exists ai_consent_declined_at timestamptz,
  -- Which wording the user actually agreed to. If the disclosure changes
  -- materially, consent to the old text is not consent to the new one, and
  -- without this there is no way to know who agreed to what.
  add column if not exists ai_consent_version integer;

comment on column profiles.ai_consent_at is
  'When the user agreed to send financial data to the third-party AI '
  'processor. NULL = no consent; edge functions must refuse.';
comment on column profiles.ai_consent_declined_at is
  'When the user declined or later withdrew. Distinguishes a deliberate '
  'refusal from never having been asked, so a refusal is not re-prompted.';
comment on column profiles.ai_consent_version is
  'Version of the disclosure text consented to. Bump AI_CONSENT_VERSION in '
  'the app when the wording materially changes to re-ask.';

-- Authoritative check used by the edge functions. SECURITY DEFINER so it can
-- read profiles regardless of RLS, and it takes the user id as an argument
-- because it is called by the service role, where auth.uid() is null.
--
-- NOT exposed to anon or authenticated - see 20260906170000 for why every
-- function in this schema is revoked by default.
create or replace function has_ai_consent(p_user_id uuid, p_min_version integer default 1)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = p_user_id
      and ai_consent_at is not null
      and coalesce(ai_consent_version, 0) >= p_min_version
  );
$$;

revoke execute on function has_ai_consent(uuid, integer) from public, anon, authenticated;
grant execute on function has_ai_consent(uuid, integer) to service_role;
