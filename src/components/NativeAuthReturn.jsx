import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/api/supabaseClient';
import { createNativeAuthHandler } from '@/lib/nativeAuth';

export default function NativeAuthReturn() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;
    let listener;
    const onError = () => { if (active) setFailed(true); };
    (async () => {
      const [{ App }, { Browser }] = await Promise.all([import('@capacitor/app'), import('@capacitor/browser')]);
      if (!active) return;
      const handle = createNativeAuthHandler({
        exchange: code => supabase.auth.exchangeCodeForSession(code),
        navigate: path => { if (active) { setFailed(false); navigateRef.current(path, { replace: true }); } },
        closeBrowser: () => Browser.close(), onError,
      });
      listener = await App.addListener('appUrlOpen', ({ url }) => { if (active) void handle(url); });
      if (!active) { await listener.remove(); return; }
      const launch = await App.getLaunchUrl();
      if (active && launch?.url) await handle(launch.url);
    })().catch(onError);
    return () => { active = false; void listener?.remove().catch(() => {}); };
  }, []);
  if (!failed) return null;
  return <div role="alert" className="fixed inset-x-4 bottom-24 z-[100] rounded-xl border border-border bg-card text-card-foreground p-4 shadow-xl">
    <p className="font-semibold">This sign-in link could not be verified.</p>
    <p className="text-sm mt-1">Start again on this device and use the newest link. No access was confirmed by this attempt.</p>
    <div className="flex flex-wrap gap-4 mt-3">
      <Link className="min-h-[44px] inline-flex items-center underline" to="/forgot-password" onClick={() => setFailed(false)}>Request a new reset link</Link>
      <button className="min-h-[44px] underline" onClick={() => setFailed(false)}>Dismiss</button>
    </div>
  </div>;
}
