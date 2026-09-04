// Single source of truth for credential-shaped strings.
//
// These patterns were duplicated across export-session.js and
// redact-secrets.js. That is the same drift that produced the enum bugs:
// two copies of a list, nothing asserting they match, and the one that
// matters silently falls behind. Adding a pattern here fixes every
// consumer at once.
//
// Ordering matters. More specific patterns must come first, because
// redaction applies them in sequence — `sk-ant-...` has to be matched
// before the generic `sk-...` rule swallows it under a vaguer label.
export const SECRET_PATTERNS = [
  { re: /\bsbp_[a-f0-9]{40,}/g, label: 'SUPABASE_ACCESS_TOKEN' },
  { re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g, label: 'SUPABASE_SECRET_KEY' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, label: 'ANTHROPIC_API_KEY' },
  { re: /\bsk-[A-Za-z0-9]{32,}/g, label: 'API_KEY' },
  { re: /\bsk_live_[A-Za-z0-9]{20,}/g, label: 'STRIPE_LIVE_KEY' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, label: 'GITHUB_TOKEN' },
  { re: /\baccess-(sandbox|development|production)-[a-f0-9-]{20,}/g, label: 'PLAID_ACCESS_TOKEN' },
  { re: /\blink-(sandbox|development|production)-[a-f0-9-]{20,}/g, label: 'PLAID_LINK_TOKEN' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'AWS_KEY_ID' },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT' },
];

// Deliberately NOT redacted, because they are public by design and
// redacting them would make transcripts harder to debug for no gain:
//   - sb_publishable_*  (Supabase publishable key, ships in the browser)
//   - the project URL   (https://<ref>.supabase.co)
// A Sentry DSN is also client-side by design, but it is write-only
// telemetry rather than data access, so it is left readable too.

// Replaces every credential-shaped string in `text`.
// Returns { text, counts } — counts keyed by label, so a caller can report
// what it found without ever handling the secret itself.
export function redact(text) {
  const counts = new Map();
  let output = text;
  for (const { re, label } of SECRET_PATTERNS) {
    output = output.replace(re, () => {
      counts.set(label, (counts.get(label) || 0) + 1);
      return `[REDACTED_${label}]`;
    });
  }
  return { text: output, counts };
}

// Counts matches without modifying anything — for verification passes.
export function scan(text) {
  const counts = new Map();
  for (const { re, label } of SECRET_PATTERNS) {
    const m = text.match(re);
    if (m) counts.set(label, (counts.get(label) || 0) + m.length);
  }
  return counts;
}
