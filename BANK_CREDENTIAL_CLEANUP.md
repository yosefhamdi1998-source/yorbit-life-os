# Legacy bank-credential cleanup (operator runbook)

Prepared October 4, 2026 by Claude and corrected during Codex review. **Nothing here has been run against production.** Running it revokes real bank access at Plaid for the accounts it finishes, which cannot be undone (an owner would have to link the bank again). It needs separate review and explicit authorization.

## Why
Before `plaid-disconnect-account` existed, the app marked accounts `disconnected` in the browser and left their Plaid credential and bank Item live. The app hides disconnected accounts, so those owners cannot finish the disconnect themselves. Accounts left in `disconnecting` by an abandoned retry are in the same position. `scripts/launch-readonly-checks.sql` query 2 counts the first group.

## What it is
`supabase/functions/retire-legacy-bank-credentials`: operator-only, never scheduled.
- Runs exactly the user Disconnect sequence, now shared in `supabase/functions/_shared/bankDisconnect.ts` (the user endpoint uses the same module; its existing 27 behavior checks still pass, with a new safe-logging assertion): `claim_legacy_bank_disconnect` (checks owner, Plaid provider, still-disconnected/disconnecting state and unchanged Item under the same lock, then calls `claim_bank_disconnect` for the fresh sibling decision), Plaid `/item/remove` in the token's own environment only when no connected or syncing sibling uses the Item (`ITEM_NOT_FOUND` = already removed), then `finalize_bank_disconnect` (deletes this account's credential and marks it disconnected in one transaction).
- Candidates: Plaid accounts that are `disconnected` and still hold a credential (vault table or the legacy `access_token_ref` column), plus every `disconnecting` account. Connected, syncing and already-clean accounts are never touched. Account rows and transaction history are kept; only credentials go.
- Dry run by default. Executing requires `"confirm"` equal to the current candidate count AND the dry run's `"review_token"` fingerprint. A different account set, state, Item or shared-use flag invalidates the review even if the count is unchanged. Processes at most `"limit"` accounts (default 25, valid integers 1-100) sequentially. A successful or failed provider removal is attempted at most once per environment/Item per run, including differing token copies. This fingerprint is an accidental-stale-review safeguard, not an authentication credential or proof of owner approval.
- Enumeration pages accounts, credential identifiers and active siblings; IN filters are chunked. Each scan is bounded at 10,000 rows / 200 pages and fails with HTTP 500 instead of reporting a partial successful list. A lower configured response cap is handled by continuing until an empty page.
- A candidate that becomes active or changes Item before its database claim is skipped intact (`no_longer_eligible`). The scan is not a transaction-wide snapshot; fresh claim checks provide the execution safeguard.
- Failures (credential read, Plaid error, missing Plaid configuration, database error) stop before finalize, keep the credential and come back next run. An account deleted mid-run is reported `already_gone`.
- Output and logs contain account ids, states and reason codes only: no tokens, institution or account names, balances or provider payloads.
- Gateway JWT on (`config.toml`); `requireSystemCaller` then allows only the legacy service-role key or a signed-in admin.

## Evidence (local, synthetic only)
Codex independently ran `npm run test:bank-disconnect` (scripts/test-disconnect-sql.mjs) against disposable local PostgreSQL 17.10, real migrations/handlers and fake Plaid: **44 checks passed**. The 27 existing disconnect behavior cases pass; 17 cleanup cases cover original protections plus capped account/credential/sibling pages, exact review fingerprint, a newly connected account, owner/Item/role checks on the new RPC, invalid limits, scan failures/bounds and one failed removal per Item even across differing credential copies. A failing provider payload is kept out of the user Disconnect logger. Cleanup racing a user's completed disconnect may correctly return 409 for a stale review, rather than both requests necessarily returning 200.

The capped-page regression failed on Claude's submitted version (0 candidates instead of 1), then passed after correction. Codex also reran edge-auth-guards, function-jwt-config, plaid-token, plaid-environment and cleanup-disabled successfully. Claude's earlier 36-case/three-run/six-mutant evidence remains in YORBIT_PROGRESS.md as historical contributor evidence; Codex did not repeat that mutant campaign. No hosted migration, function deploy, actual Plaid call, real credential, browser test or native-device result is claimed for this backend-only work.

## Operator procedure (after review and written authorization)
1. Apply only the reviewed `20261004165854_legacy_cleanup_claim.sql` migration (not yet applied). Verify its service-role-only EXECUTE grants; do not broadly replay pending migrations. Then deploy `retire-legacy-bank-credentials` from the reviewed commit (verify_jwt true). `plaid-disconnect-account` source also changed (moved into the shared module, same HTTP behavior with sanitized error logging); redeploy it in the same release so deployed code matches source.
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
   Read `review_token`, `candidates`, `disconnected_with_credential`, `unfinished_disconnecting`, `sharing_an_item_still_in_use` and the account list. Shared-Item accounts lose only their own credential copy; their sibling stays connected.
4. Execute with the count AND fingerprint you just reviewed, in small batches:
   body `{"dry_run": false, "confirm": <candidates>, "review_token": "<review_token>", "limit": 10}`.
   HTTP 200 = the batch completed; inspect `skipped` as well as clean/gone results. HTTP 502 = some need a retry (`results[].reason`); 409 = missing/stale review (run the dry run again); 400 = invalid limit; 500 = scan/operation could not complete (never assume zero remaining). A skipped active/replaced account is not authority to disconnect it; review its new state separately.
5. Repeat dry run + execute until `candidates` is 0. Persistent `provider` retries: check Plaid status and that the matching Plaid secret is configured; `plaid_not_configured`: a sandbox Item without PLAID_SANDBOX_SECRET.
6. Confirm afterwards: query 2 of `launch-readonly-checks.sql` returns 0. Record the counts (not ids) in YORBIT_PROGRESS.md.
