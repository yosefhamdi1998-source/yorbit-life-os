import { useCallback, useRef, useState } from 'react';
import { createReentryLock } from '@/lib/reentryLock';

// Re-entry guard for delete handlers, keyed by row id.
//
// Same class of bug as the transaction double-submit and the goal
// contribution overwrite: a fast double-tap fires the handler twice before
// React has re-rendered with `disabled` set. For deletes the second call is
// usually a harmless no-op against an already-gone row, but "usually
// harmless" is not a property worth shipping to strangers — and a few of
// these handlers do optimistic removal with rollback, where a second
// failing call can restore a row the first one legitimately deleted.
//
// Usage:
//   const { runGuarded, isDeleting } = useDeleteLock();
//   const remove = (id) => runGuarded(id, async () => { ...delete... });
//   <Button disabled={isDeleting(id)} onClick={() => remove(id)} />
export default function useDeleteLock() {
  const lockRef = useRef(null);
  if (lockRef.current === null) lockRef.current = createReentryLock();

  // The lock itself lives in a ref (synchronous, which is the whole point).
  // This counter exists only so the component re-renders when the in-flight
  // set changes, letting `isDeleting` drive a disabled state.
  const [, bump] = useState(0);

  const runGuarded = useCallback(async (id, fn) => {
    const lock = lockRef.current;
    if (lock.isBusy(id)) return undefined;
    const p = lock.run(id, fn);
    bump(n => n + 1);
    try {
      return await p;
    } finally {
      bump(n => n + 1);
    }
  }, []);

  const isDeleting = useCallback((id) => lockRef.current.isBusy(id), []);

  return { runGuarded, isDeleting };
}
