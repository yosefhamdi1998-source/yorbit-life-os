-- Fixes a real bug in "Delete My Data" (Settings.jsx handleDeleteData):
-- it was firing one DELETE request PER ROW, all at once, inside a single
-- Promise.all. For an account with real volume — e.g. the 17,000+ Coinbase
-- transactions imported earlier this project — that's tens of thousands of
-- simultaneous HTTP requests. Promise.all fails fast on the first
-- rejection (a timeout, a rate limit — the very rate limiting this project
-- added on 2026-09-04), but by then many of the OTHER deletes have already
-- gone through concurrently. Result: a silently partial delete, with no way
-- for the user or the app to know which rows survived.
--
-- Fix: one function, one transaction, all-or-nothing. Postgres functions
-- are transactional by default — if any statement inside fails, everything
-- in it rolls back together. The client now makes ONE request instead of
-- thousands, and either all eight tables are cleared or none of them are.
--
-- Safety: no parameters. Scoped entirely to auth.uid(), so this can only
-- ever delete the CALLING user's own data — there is no argument to pass
-- that could target anyone else's rows, even by mistake.
create or replace function delete_all_my_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from transactions where user_id = auth.uid();
  delete from budgets where user_id = auth.uid();
  delete from savings_goals where user_id = auth.uid();
  delete from goals where user_id = auth.uid();
  delete from bills where user_id = auth.uid();
  delete from net_worth_entries where user_id = auth.uid();
  delete from ai_insight_caches where user_id = auth.uid();
  delete from investment_holdings where user_id = auth.uid();
end;
$$;

-- Callable by any signed-in user (for their own data only, per auth.uid()
-- above) — not by anon.
revoke all on function delete_all_my_data() from public;
grant execute on function delete_all_my_data() to authenticated;
