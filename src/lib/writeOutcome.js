// Did a failed write definitely NOT happen, or do we simply not know?
//
// The distinction matters because the two demand opposite things from the UI.
// A write the server actively rejected did not land: the stored value is
// unchanged, so restoring what was on screen before is exactly right and we can
// say so plainly. A write that died on the network may have reached the server
// and committed before the connection dropped — restoring the old value is
// still the safer thing to DISPLAY, because showing an unsaved figure as though
// it were real is worse, but telling someone "not saved" would be a guess we
// cannot support.
//
// So the default is 'unknown'. Only a message that clearly comes from the
// database rejecting the statement counts as 'rejected'. Getting that backwards
// — treating every error as proof nothing was written — is how a UI ends up
// confidently telling someone their change was discarded when it was applied.

const NETWORK_FAILURE = [
  /failed to fetch/i,      // Chrome
  /networkerror/i,         // Firefox
  /load failed/i,          // Safari
  /network request failed/i,
  /fetch failed/i,         // undici / Node
  /timed? ?out/i,
  /aborted/i,
  /ERR_(NETWORK|CONNECTION|INTERNET)/i,
  /ECONN(RESET|REFUSED|ABORTED)/i,
  /socket hang up/i,
];

// PostgREST and Postgres surface these through supabase-js as error.message,
// which src/api/base44Client.js rethrows. Each one means the statement was
// received, understood, and refused.
const SERVER_REJECTION = [
  /violates .*constraint/i,
  /check constraint/i,
  /duplicate key/i,
  /not[- ]null/i,
  /invalid input/i,
  /permission denied/i,
  /row[- ]level security/i,
  /policy/i,
  /JSON object requested/i,
  /PGRST\d+/i,
  /^\s*2[2-3]\d{3}\b/,     // SQLSTATE data/integrity classes
];

/**
 * @returns {'rejected'|'unknown'} 'rejected' only when the message shows the
 * server refused the statement. Anything else — including an empty or
 * unrecognised error — is 'unknown', because we cannot prove a write did not
 * occur just because we failed to hear back about it.
 */
export function classifyWriteError(err) {
  const message = String(err?.message ?? err ?? '');
  if (!message) return 'unknown';
  if (NETWORK_FAILURE.some((re) => re.test(message))) return 'unknown';
  if (SERVER_REJECTION.some((re) => re.test(message))) return 'rejected';
  return 'unknown';
}
