-- Invite-only signup: the app was open to anyone with the link. This adds
-- an allowlist enforced at the database level (a BEFORE INSERT trigger on
-- auth.users), not just a client-side check — so it can't be bypassed by
-- calling the Auth API directly, only by someone with real database access.
--
-- Existing accounts are completely unaffected: the trigger only runs on
-- INSERT, never touches rows that already exist, so nobody currently using
-- the app loses access.

create table if not exists allowed_emails (
  email text primary key,
  note text,
  created_at timestamptz not null default now()
);

-- Locked down: allowed_emails is intentionally NOT exposed to anon or
-- authenticated roles at all (no policies = no access under RLS). Manage it
-- from the Supabase Studio Table Editor (as the project owner, which
-- bypasses RLS) or the SQL Editor — see the instructions given alongside
-- this migration for exact add/remove commands.
alter table allowed_emails enable row level security;

-- Seed with everyone already using the app today, so nothing about their
-- access changes, and so any of them re-signing up later (e.g. after
-- deleting and recreating an account) isn't accidentally locked out.
insert into allowed_emails (email, note) values
  ('yosefhamdi@aol.com', 'existing user at time of lockdown'),
  ('yosefhamdi1998@gmail.com', 'existing user at time of lockdown'),
  ('sandra.hamdi101@gmail.com', 'existing user at time of lockdown'),
  ('alhamdi@aol.com', 'existing user at time of lockdown')
on conflict (email) do nothing;

create or replace function enforce_email_allowlist()
returns trigger as $$
begin
  if not exists (
    select 1 from allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'Signups are invite-only. Contact the app owner to be added.'
      using errcode = '42501';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_email_allowlist on auth.users;
create trigger trg_enforce_email_allowlist
  before insert on auth.users
  for each row
  execute function enforce_email_allowlist();
