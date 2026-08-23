import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { isNativeIOS } from '@/lib/platform';
import { checkProEntitlement } from '@/lib/revenuecat';

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [plan, setPlan] = useState('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (isNativeIOS()) {
        const result = await checkProEntitlement();
        if (!cancelled) {
          setIsPro(result.isPro);
          setPlan(result.plan);
          setLoading(false);
        }
        return;
      }

      // Web: check Subscription entity (populated by Stripe webhook)
      try {
        const subs = await base44.entities.Subscription.list();
        const active = subs.find(s => ['active', 'trialing'].includes(s.status) && s.plan && s.plan !== 'free');
        if (!cancelled) {
          setIsPro(!!active);
          setPlan(active?.plan || 'free');
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setLoading(false); }
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, []);

  return { isPro, plan, loading };
}