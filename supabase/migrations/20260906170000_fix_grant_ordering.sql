-- Finish closing the RPC surface. 20260906140000 got most of the way there
-- but left one gap, and the gap is worth understanding because it is the
-- same shape as the original bug: a defence that looks applied but is not.
--
-- WHAT WAS STILL OPEN
--
-- After 20260906140000, scripts/test-rpc-authz.js went from 8 failures to 1:
--
--   crypto_yearly_summary() -> HTTP 200, returned []
--
-- No data leaked - `user_id = auth.uid()` with a NULL uid matches no row -
-- but the function EXECUTED for an anonymous caller, which the grants were
-- supposed to prevent outright.
--
-- Two causes, both ordering mistakes:
--
--   1. Supabase ships its own default privileges granting EXECUTE on new
--      functions to anon and authenticated. 20260906140000 revoked the
--      default only FROM PUBLIC, which does not cover those two named roles.
--
--   2. That migration revoked existing grants (line 70) and THEN created the
--      functions (line 86). So every function it created was born after the
--      revoke and immediately picked the default grant back up. The revoke
--      applied to the old functions and missed every new one.
--
-- The second is the instructive one: `revoke ... on all functions` is a
-- snapshot, not a policy. It affects the functions that exist at that moment
-- and says nothing about the next one. Only ALTER DEFAULT PRIVILEGES is a
-- policy, which is why the fix leads with it here and why the revoke is
-- repeated after every create.
--
-- crypto_asset_summary appeared to pass the same test, but only because its
-- internal `if uid is null then raise` fired. It was equally executable. A
-- guard inside the function was doing work the grants were credited with.

-- ---------------------------------------------------------------------------
-- 1. The actual class fix: no future function is granted to anyone by default.
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Re-close the surface, now that every function exists.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;

grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------------
-- 3. Make crypto_yearly_summary refuse rather than return an empty set.
--
-- Silently returning nothing to an unauthenticated caller is indistinguishable
-- from "this account has no crypto", which is the wrong answer to a question
-- that should not have been answerable. plpgsql so it can raise, matching the
-- other three.
-- ---------------------------------------------------------------------------
create or replace function crypto_yearly_summary()
returns table (
  yr text,
  txns bigint,
  usd_bought numeric,
  usd_sold numeric,
  net_flow numeric,
  cash_withdrawn numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;

  return query
  select
    left(t.date::text, 4) as yr,
    count(*) filter (where t.crypto_asset <> 'USD'),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity > 0 and t.crypto_asset <> 'USD'), 0), 2),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity < 0 and t.crypto_asset <> 'USD'), 0), 2),
    round(coalesce(sum(t.amount) filter (where t.crypto_quantity < 0 and t.crypto_asset <> 'USD'), 0)
        - coalesce(sum(t.amount) filter (where t.crypto_quantity > 0 and t.crypto_asset <> 'USD'), 0), 2),
    -- Cash actually leaving Coinbase for a bank: the money that funded life.
    round(coalesce(sum(t.amount) filter (where t.crypto_asset = 'USD' and t.title ilike 'Coinbase Withdrawal%'), 0), 2)
  from transactions t
  where t.user_id = uid
    and t.crypto_quantity is not null
    and not t.superseded_by_import
  group by 1
  order by 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grant back exactly the four the signed-in app calls, and nothing else.
--    This must be the LAST statement touching grants - see the header.
-- ---------------------------------------------------------------------------
revoke execute on function crypto_yearly_summary() from public, anon;

grant execute on function crypto_asset_summary() to authenticated;
grant execute on function crypto_yearly_summary() to authenticated;
grant execute on function crypto_pnl_by_year() to authenticated;
grant execute on function crypto_time_coverage() to authenticated;
