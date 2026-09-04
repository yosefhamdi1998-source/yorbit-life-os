// Allowed browser origins.
//
// This was 'Access-Control-Allow-Origin: *' on every function. Auth here is
// header-based (an Authorization bearer token, not a cookie), so a wildcard
// was not a session-hijack path — a random site still cannot make a
// browser attach someone's token. But it did mean any page anywhere could
// call these endpoints, which makes abuse and token-replay from a hostile
// page cheaper than it needs to be, and it is the kind of thing a security
// review flags on sight.
//
// Localhost entries are for `npm run dev`. They are harmless in production:
// an attacker who can serve from the victim's own localhost has already won.
const ALLOWED_ORIGINS = [
  'https://yorbit-life-os.vercel.app',
  'https://yosefhamdi1998-source.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin);

  return {
    // Echo the origin only when it is on the list. When it is not, send a
    // single known origin rather than '*' — the browser then blocks the
    // response, which is the intended outcome.
    //
    // Note this header is not sent at all for non-browser callers (no
    // Origin header), which is why curl, the cron job and the Supabase
    // CLI are unaffected by any of this. CORS is a browser policy, never
    // a server-side authorisation control.
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Origin-dependent responses must not be cached under one key for all
    // origins, or a proxy can serve one origin's header to another.
    'Vary': 'Origin',
  };
}

// Kept as a named export because existing call sites import it directly.
// Prefer corsFor(req) in new code — this static object cannot echo an
// origin and so always falls back to the primary one.
export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
};

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsFor(req) });
  }
  return null;
}

// --- error identifiers --------------------------------------------------
// Every user-facing failure gets a short code the user can read out. Before
// this, every error was "Please try again" with nothing tying the message
// on someone's screen to a line in the logs — so a stranger reporting a
// problem gave you nothing to search for.
//
// Deliberately short and unambiguous: no vowels (so it cannot spell
// anything), no 0/O or 1/I/L, and uppercase, because people transcribe
// these by hand from a phone screen.
const ID_ALPHABET = '23456789BCDFGHJKMNPQRSTVWXYZ';

export function newErrorId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
  req?: Request,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(req ? corsFor(req) : corsHeaders),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

// Error responses carry an id that is ALSO written to the function log, so
// a user quoting "YORB-7K2MQX9P" can be traced to the exact failure.
//
// `internal` never reaches the caller. Leaking a database error or a Plaid
// response to the browser tells an attacker about the schema and tells a
// normal user nothing useful — the id is what makes the detail findable
// without exposing it.
export function errorResponse(
  message: string,
  status: number,
  opts: { internal?: unknown; fn?: string; req?: Request; extraHeaders?: Record<string, string> } = {},
): Response {
  const errorId = newErrorId();
  const detail = opts.internal instanceof Error
    ? (opts.internal.stack || opts.internal.message)
    : typeof opts.internal === 'string'
      ? opts.internal
      : opts.internal !== undefined
        ? JSON.stringify(opts.internal)
        : '(no detail)';

  console.error(`[${opts.fn || 'fn'}] error_id=YORB-${errorId} status=${status} :: ${detail}`);

  return jsonResponse(
    { error: message, error_id: `YORB-${errorId}` },
    status,
    opts.extraHeaders || {},
    opts.req,
  );
}
