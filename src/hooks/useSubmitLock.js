import { useRef, useState, useCallback } from 'react';

/**
 * Guards a submit handler against double/triple taps.
 *
 * Every form in this app used the same idiom: `setSaving(true)` at the top
 * of the handler, and `disabled={saving}` on the button. That does NOT
 * stop a fast double-tap. React state updates are asynchronous and
 * batched, so two or three clicks landing in the same tick all run the
 * handler before React has re-rendered the button as disabled — verified
 * live by triple-tapping Save on a transaction, which created three
 * identical rows in the database.
 *
 * A ref updates synchronously, so it blocks re-entry on the very next
 * call, in the same tick. The `saving` state is still returned because
 * the UI genuinely needs it to render a spinner/disabled style — it just
 * can't be the thing enforcing correctness.
 *
 * Usage:
 *   const { saving, runGuarded } = useSubmitLock();
 *   const handleSave = () => runGuarded(async () => { ...await save()... });
 *   <Button onClick={handleSave} disabled={saving}>
 */
export default function useSubmitLock() {
  const lockRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const runGuarded = useCallback(async (fn) => {
    if (lockRef.current) return undefined; // already in flight — drop this tap
    lockRef.current = true;
    setSaving(true);
    try {
      return await fn();
    } finally {
      lockRef.current = false;
      setSaving(false);
    }
  }, []);

  return { saving, runGuarded };
}
