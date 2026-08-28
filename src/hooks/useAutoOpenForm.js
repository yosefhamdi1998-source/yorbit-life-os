import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

// Lets a quick-action link land on a page with its create form already open
// (e.g. /bills?add=1). The flag is stripped from the URL afterwards so a
// refresh or a back-navigation doesn't reopen the form unexpectedly.
export default function useAutoOpenForm(openForm) {
  const [params, setParams] = useSearchParams();
  const shouldOpen = params.get('add');

  useEffect(() => {
    if (!shouldOpen) return;
    openForm();
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
    // Keyed on the flag alone: once it's stripped from the URL this won't
    // re-fire, which is what stops the form reopening on every re-render.
  }, [shouldOpen]);
}
