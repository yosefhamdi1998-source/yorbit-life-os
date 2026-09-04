// Per-key re-entry lock.
//
// Kept framework-free and separate from the React hook that wraps it so it
// can be tested against directly. The Venmo mapper had a test that passed
// while the shipped code was wrong, because the test re-implemented the
// logic instead of importing it — this module exists so useDeleteLock's
// test exercises the real thing.
//
// Why a ref-style lock and not React state: setState is asynchronous and
// batched, so two taps dispatched in the same tick both read the old value
// and both proceed. `disabled={busy}` is a visual affordance, not a
// guarantee. Only a value mutated synchronously can stop the second call.
export function createReentryLock() {
  const inFlight = new Set();

  return {
    // Runs `fn` unless a call for this key is already in flight, in which
    // case the call is dropped and `undefined` is returned. Per-key rather
    // than a single boolean so deleting two different rows in quick
    // succession still works — a global lock would swallow the second.
    async run(key, fn) {
      const k = String(key);
      if (inFlight.has(k)) return undefined;
      inFlight.add(k);
      try {
        return await fn();
      } finally {
        // Always released, including when fn throws, so a failed delete
        // doesn't wedge that row permanently.
        inFlight.delete(k);
      }
    },
    isBusy(key) {
      return inFlight.has(String(key));
    },
    get size() {
      return inFlight.size;
    },
  };
}
