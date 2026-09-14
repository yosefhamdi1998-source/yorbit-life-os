import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isNativeIOS } from '@/lib/platform';
import { checkProEntitlement } from '@/lib/revenuecat';
import { useAuth } from '@/lib/AuthContext';
import { SUBSCRIPTION_CHANGED } from '@/lib/subscriptionEvents';

export function useProStatus() {
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated ? user?.id : null;
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let requestVersion = 0;

    async function checkStatus() {
      const version = ++requestVersion;
      setStatus({ userId, isPro: false, plan: 'free', loading: true });
      let result = { isPro: false, plan: 'free' };
      try {
        if (isNativeIOS()) {
          result = await checkProEntitlement();
        } else {
          // Web access is populated by the Stripe webhook and scoped by RLS.
          const subs = await base44.entities.Subscription.list();
          const active = subs.find(s => ['active', 'trialing'].includes(s.status) && s.plan && s.plan !== 'free');
          result = { isPro: !!active, plan: active?.plan || 'free' };
        }
      } catch {
        // A failed check must not retain another account's access.
      }
      if (!cancelled && version === requestVersion) setStatus({ ...result, userId, loading: false });
    }

    checkStatus();
    window.addEventListener('focus', checkStatus);
    window.addEventListener(SUBSCRIPTION_CHANGED, checkStatus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', checkStatus);
      window.removeEventListener(SUBSCRIPTION_CHANGED, checkStatus);
    };
  }, [userId]);

  // Mask previous-account results immediately, before the effect runs.
  if (!userId || status?.userId !== userId) {
    return { isPro: false, plan: 'free', loading: !!userId };
  }
  return { isPro: status.isPro, plan: status.plan, loading: status.loading };
}
