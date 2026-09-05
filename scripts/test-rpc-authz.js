// Every RPC in the public schema must refuse an anonymous caller.
//
// This is a black-box test run against the LIVE deployment using only the
// publishable key from .env - the same key that ships inside the JavaScript
// bundle at yorbit-life-os.vercel.app. Anything this script can do, any
// visitor to the site can do.
//
// Why it exists: `crypto_asset_summary(p_user_id)` and friends took the
// account holder's identity as a parameter and guarded it with
//
//     if auth.uid() is not null and auth.uid() <> p_user_id then raise ...
//
// auth.uid() is NULL for an anon-key caller, so the `is not null` term
// disabled the guard for precisely the caller it was meant to stop. Signed-in
// users were blocked from each other's data; anonymous strangers were not.
// Before the fix, mark_receipts_as_income returned 0 (an executed UPDATE),
// not an authorization error.
//
// SAFETY: every probe passes the all-zero UUID. `where user_id = p_user_id`
// matches no row, so a probe cannot alter real data even if it is accepted.
// What is being measured is ACCEPTED vs REFUSED, not rows touched.
//
// Usage: node scripts/test-rpc-authz.js

import fs from 'node:fs';

const ZERO = '00000000-0000-0000-0000-000000000000';

function loadEnv() {
  const raw = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

// Every function reachable over PostgREST. Read functions and write functions
// are listed together because the requirement is identical: an anonymous
// caller gets nothing.
const PROBES = [
  { fn: 'crypto_asset_summary', body: {} },
  { fn: 'crypto_yearly_summary', body: {} },
  // The pre-fix signatures. These must now fail to resolve at all - if one
  // still answers, the forgeable entry point is back.
  { fn: 'crypto_asset_summary', body: { p_user_id: ZERO }, legacy: true },
  { fn: 'crypto_yearly_summary', body: { p_user_id: ZERO }, legacy: true },
  { fn: 'mark_receipts_as_income', body: { p_user_id: ZERO, p_title_pattern: '__probe__' } },
  { fn: 'unmark_receipts_as_income', body: { p_user_id: ZERO, p_transaction_ids: [] } },
  { fn: 'apply_income_sender', body: { p_user_id: ZERO, p_pattern: '__probe__' } },
  { fn: 'title_matches_income_sender', body: { p_user_id: ZERO, p_title: '__probe__' } },
  { fn: 'check_rate_limit', body: { p_user_id: ZERO, p_bucket: '__probe__', p_limit: 1, p_window_seconds: 60 } },
  { fn: 'record_ai_usage', body: { p_user_id: ZERO, p_model: '__probe__', p_input_tokens: 0, p_output_tokens: 0 } },
  { fn: 'unregistered_pfc_values', body: {} },
  { fn: 'classify_exclusion_reason', body: { p_title: 'x', p_type: 'income' } },
];

// A refusal. PGRST202 means PostgREST cannot find the function for this role -
// which is what a revoked EXECUTE looks like from outside, and is the expected
// outcome for most of these. 42501 is an explicit in-function rejection.
function isRefusal(status, payload) {
  if (status === 401 || status === 403 || status === 404) return true;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.code === 'PGRST202') return true;   // not exposed to this role
    if (payload.code === '42501') return true;      // insufficient privilege
    if (payload.code === 'PGRST203') return true;   // ambiguous overload, unreachable
  }
  return false;
}

// A foreign-key error means the call was ACCEPTED and reached the write. That
// is a failure, not a pass - with a real user id it would have succeeded.
function reachedTheWrite(payload) {
  return payload && typeof payload === 'object' && payload.code === '23503';
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('FAIL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from .env');
    process.exit(1);
  }

  let failures = 0;
  for (const probe of PROBES) {
    const label = probe.legacy
      ? `${probe.fn}(p_user_id)  [legacy signature]`
      : `${probe.fn}(${Object.keys(probe.body).join(', ')})`;

    let status, payload;
    try {
      const res = await fetch(`${url}/rest/v1/rpc/${probe.fn}`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(probe.body),
      });
      status = res.status;
      const text = await res.text();
      try { payload = JSON.parse(text); } catch { payload = text; }
    } catch (err) {
      console.log(`  SKIP  ${label} - network: ${err.message}`);
      continue;
    }

    if (isRefusal(status, payload)) {
      const why = payload?.code || status;
      console.log(`  ok    ${label} -> refused (${why})`);
    } else if (reachedTheWrite(payload)) {
      failures++;
      console.log(`  FAIL  ${label} -> REACHED THE WRITE (23503 foreign key).`);
      console.log('        Accepted from an anonymous caller. A real user id would have been written.');
    } else {
      failures++;
      const shown = JSON.stringify(payload)?.slice(0, 160);
      console.log(`  FAIL  ${label} -> HTTP ${status}, executed and returned: ${shown}`);
      console.log('        An anonymous caller must never get a result from this function.');
    }
  }

  console.log('');
  if (failures) {
    console.log(`${failures} function(s) answer the anon key. The anon key is public.`);
    process.exit(1);
  }
  console.log(`All ${PROBES.length} probes refused. The RPC surface is closed to anonymous callers.`);
}

main();
