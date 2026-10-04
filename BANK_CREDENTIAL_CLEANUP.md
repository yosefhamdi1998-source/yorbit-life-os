# Legacy bank-credential cleanup (operator runbook)

Prepared October 4, 2026 on branch `claude/plaid-legacy-cleanup`. **Nothing here has been run against production.** Running it revokes real bank access at Plaid for the accounts it finishes, which cannot be undone (an owner would have to link the bank again). It needs separate review and explicit authorization.

## Why
Before `plaid-disconnect-account` existed, the app marked accounts `disconnected` in the browser and left their Plaid credential and bank Item live. The app hides disconnected accounts, so those owners cannot finish the disconnect themselves. Accounts left in `disconnecting` by an abandoned retry are in the same position. `scripts/launch-readonly-checks.sql` query 2 counts the first group.

## What it is
`supabase/functions/retire-legacy-bank-credentials`: operator-only, never scheduled.
- Runs exactly the user Disconnect sequence, now shared in `supabase/functions/_shared/bankDisconnect.ts` (the user endpoint uses the same module; its 27 existing checks pass unchanged): `claim_bank_disconnect` (owner check, per-Item advisory lock, fresh "is a sibling still connected?"), Plaid `/item/remove` in the token's own environment only when no connected or syncing sibling uses the Item (`ITEM_NOT_FOUND` = already removed), then `finalize_bank_disconnect` (deletes this account's credential and marks it disconnected in one transaction).
- Candidates: Plaid accounts that are `disconnected` and still hold a credential (vault table or the legacy `access_token_ref` column), plus every `disconnecting` account. Connected, syncing and already-clean accounts are never touched. Account rows and transaction history are kept; only credentials go.
- Dry run by default. Executing requires `"confirm"` equal to the current candidate count, processes at most `"limit"` accounts (default 25, max 100) sequentially, and removes each Item at most once per run.
- Failures (credential read, Plaid error, missing Plaid configuration, database error) stop before finalize, keep the credential and come back next run. An account deleted mid-run is reported `already_gone`.
- Output and logs contain account ids, states and reason codes only: no tokens, institution or account names, balances or provider payloads.
- Gateway JWT on (`config.toml`); `requireSystemCaller` then allows only the legacy service-role key or a signed-in admin.

## Evidence (local, synthetic only)
`npm run test:bank-disconnect` (scripts/test-disconnect-sql.mjs), real PostgreSQL 17 with the real migrations, real handlers, fake Plaid: 36 checks, 9 of them for this utility - auth/method refusals; exact dry-run candidate set with shared-Item flags and no change; confirm required; connected and syncing siblings keep the Item and their credential; two disconnected siblings sharing an Item cause one removal; unfinished `disconnecting` finished; `ITEM_NOT_FOUND`; sandbox Items routed to the sandbox; provider failure and a database failure before finalize keep the credential and succeed on the next run; repeated runs end with zero candidates and no Plaid calls; 5/5 concurrent runs against the user's own Disconnect; an account deletion racing the run; batch limit. Six deliberate defects (revoke despite a connected sibling, no confirm check, all disconnected accounts as candidates, execute by default, no per-run dedupe, logging the provider payload) each fail the suite. No production database, Plaid account or real credential was used.

## Operator procedure (after review and written authorization)
1. Deploy `retire-legacy-bank-credentials` from the reviewed commit (verify_jwt true). `plaid-disconnect-account` source also changed (moved into the shared module, behaviour identical); redeploy it in the same release so deployed code matches source.
2. Read-only count first: query 2 of `scripts/launch-readonly-checks.sql`. If it is 0 and no account is `disconnecting`, stop: there is nothing to clean.
3. Dry run. With the scheduler's Vault secret (`cron_service_role_jwt`, OWNER_ACTIONS item 2 option A) in place, from the SQL editor:
   ```sql
   select net.http_post(
     url := 'https://pvjiialxboslqyiiybpe.supabase.co/functions/v1/retire-legacy-bank-credentials',
     headers := jsonb_build_object('Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets where name = 'cron_service_role_jwt'), 'Content-Type', 'application/json'),
     body := '{}'::jsonb) as request_id;
   -- a few seconds later:
   -- select status_code, content from net._http_response where id = <request_id>;
   ```
   Alternatively the owner runs the same POST from their own terminal with the service-role key in an environment variable (never pasted into chat or saved in a file).
   Read `candidates`, `disconnected_with_credential`, `unfinished_disconnecting`, `sharing_an_item_still_in_use` and the account list. Shared-Item accounts lose only their own credential copy; their sibling stays connected.
4. Execute with the count you just saw, in small batches:
   body `{"dry_run": false, "confirm": <candidates>, "limit": 10}`.
   HTTP 200 = every processed account finished; 502 = some need a retry (`results[].reason`); 409 = the count changed since the dry run (run it again).
5. Repeat dry run + execute until `candidates` is 0. Persistent `provider` retries: check Plaid status and that the matching Plaid secret is configured; `plaid_not_configured`: a sandbox Item without PLAID_SANDBOX_SECRET.
6. Confirm afterwards: query 2 of `launch-readonly-checks.sql` returns 0. Record the counts (not ids) in YORBIT_PROGRESS.md.
