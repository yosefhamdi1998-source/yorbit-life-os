import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { base44 } from '@/api/base44Client';
import { createNativeBankLinkHandler } from '@/lib/nativeBankLink';
import {
  loadPlaidScript, loadPendingBankLink, clearPendingBankLink,
  markPendingAutoSync, exchangeNewBankLink, finishReconnectBankLink,
} from '@/lib/plaidLink';

// Resumes a Plaid Link OAuth trip that left the app entirely - the bank's
// own login page can only return control via the redirect_uri the OS was
// told to hand back to this app, which may relaunch it fresh on whatever
// route the app opens by default, not wherever Bank Sync happened to be.
// Mirrors NativeAuthReturn's appUrlOpen/getLaunchUrl handling for the same
// reason: App.addListener misses a URL that arrived before this mounted,
// so both are checked.
export default function NativeBankLinkReturn() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let listener;
    const onError = () => { if (active) setFailed(true); };
    const resume = async (url) => {
      const pending = loadPendingBankLink();
      if (!pending) { onError(); return; }
      await loadPlaidScript();
      await new Promise((resolve, reject) => {
        const handler = window.Plaid.create({
          token: pending.link_token,
          receivedRedirectUri: url,
          onSuccess: async (public_token, metadata) => {
            try {
              if (pending.mode === 'reconnect') {
                await finishReconnectBankLink({ base44, id: pending.connected_account_id });
                markPendingAutoSync([{ id: pending.connected_account_id, full: false }]);
              } else {
                const accounts = await exchangeNewBankLink({ base44, public_token, metadata });
                markPendingAutoSync(accounts.map(a => ({ id: a.id, full: true })));
              }
              clearPendingBankLink();
              if (active) { setFailed(false); navigateRef.current('/bank-sync', { replace: true }); }
              resolve();
            } catch (e) { reject(e); }
          },
          onExit: (err) => {
            clearPendingBankLink();
            if (active) navigateRef.current('/bank-sync', { replace: true });
            // A user-cancelled exit (err === null) isn't a failure worth a banner for.
            if (err) reject(new Error('Bank connection exited with an error')); else resolve();
          },
        });
        handler.open();
      });
    };
    (async () => {
      const [{ App }] = await Promise.all([import('@capacitor/app')]);
      if (!active) return;
      const handle = createNativeBankLinkHandler({ resume, onError });
      listener = await App.addListener('appUrlOpen', ({ url }) => { if (active) void handle(url); });
      if (!active) { await listener.remove(); return; }
      const launch = await App.getLaunchUrl();
      if (active && launch?.url) await handle(launch.url);
    })().catch(onError);
    return () => { active = false; void listener?.remove().catch(() => {}); };
  }, []);
  if (!failed) return null;
  return <div role="alert" className="fixed inset-x-4 bottom-24 z-[100] rounded-xl border border-border bg-card text-card-foreground p-4 shadow-xl">
    <p className="font-semibold">This bank connection couldn't be resumed.</p>
    <p className="text-sm mt-1">Go to Bank Sync and try connecting again. No partial connection was saved.</p>
    <button className="min-h-[44px] underline mt-3" onClick={() => setFailed(false)}>Dismiss</button>
  </div>;
}
