import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { isNativeIOS } from '@/lib/platform';
import { getOfferings, purchasePackage, restorePurchases } from '@/lib/revenuecat';
import { Sparkles, Zap, Check, ArrowLeft, Shield, Brain, TrendingUp, Target, Receipt, Lock, Infinity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';

const FEATURES_LIST = [
  { icon: Brain, label: 'AI Money Coach', desc: 'Daily personalized advice based on your real spending', pro: true },
  { icon: Sparkles, label: 'AI Financial Briefings', desc: 'Smart daily summaries of your financial health', pro: true },
  { icon: TrendingUp, label: 'Unlimited Budgets', desc: 'Set limits for every spending category', pro: true },
  { icon: Target, label: 'Unlimited Goals', desc: 'Track as many savings goals as you want', pro: true },
  { icon: Receipt, label: 'Unlimited Transactions', desc: 'Log everything with no monthly caps', pro: true },
  { icon: Shield, label: 'Priority Support', desc: 'Fast-track responses from our team', pro: true },
];

const FREE_LIMITS = [
  { label: 'Transaction logging', free: '✓ Unlimited', pro: '✓ Unlimited' },
  { label: 'Budgets', free: '3 categories', pro: '✓ All categories' },
  { label: 'Savings goals', free: '2 goals', pro: '✓ Unlimited' },
  { label: 'AI Briefings', free: '✗', pro: '✓ Daily' },
  { label: 'AI Coach', free: '✗', pro: '✓ Always on' },
];

const PRICES = {
  monthly: { id: 'price_1Tp0ZJCvjMbso8E2tQSWOW8X', amount: '$4.99', period: '/month', annual: null, badge: null, note: 'Billed monthly' },
  yearly:  { id: 'price_1Tp0ZMCvjMbso8E2xyERKi7E', amount: '$29.99', period: '/year', annual: '$2.50/mo', badge: 'BEST VALUE · Save 50%', note: 'Billed annually' },
};

export default function Upgrade() {
  const [plan, setPlan] = useState('yearly');
  const [loading, setLoading] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iosOfferings, setIosOfferings] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativeIOS()) return;
    getOfferings().then(offerings => {
      if (offerings?.current) setIosOfferings(offerings);
    });
  }, []);

  const handleCheckout = async () => {
    if (window.self !== window.top) { setIframeBlocked(true); return; }
    setLoading(true);
    const successUrl = `${window.location.origin}/settings?success=1`;
    const cancelUrl = `${window.location.origin}/upgrade`;
    try {
      // The create-checkout Edge Function returns { url, sessionId } directly
      const res = await base44.functions.invoke('createCheckout', { priceId: PRICES[plan].id, successUrl, cancelUrl });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setLoading(false);
        toast({ title: "Couldn't open checkout", description: "Please try again in a moment.", variant: 'destructive' });
      }
    } catch {
      setLoading(false);
      toast({ title: "Couldn't open checkout", description: "Please try again in a moment.", variant: 'destructive' });
    }
  };

  const handleIOSPurchase = async () => {
    if (!iosOfferings?.current) {
      toast({ title: "Subscriptions unavailable", description: "Please try again later.", variant: 'destructive' });
      return;
    }
    const pkg = plan === 'yearly'
      ? iosOfferings.current.availablePackages.find(p => p.identifier === '$rc_annual')
      : iosOfferings.current.availablePackages.find(p => p.identifier === '$rc_monthly');
    if (!pkg) {
      toast({ title: "Plan not found", description: "Please try a different plan.", variant: 'destructive' });
      return;
    }
    setLoading(true);
    const result = await purchasePackage(pkg);
    setLoading(false);
    if (result.error) {
      toast({ title: "Purchase failed", description: result.error, variant: 'destructive' });
    } else if (!result.cancelled) {
      toast({ title: "Welcome to MoneyGlow Pro! 🎉", description: "Your subscription is now active." });
      navigate('/settings');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.error) {
      toast({ title: "Restore failed", description: result.error, variant: 'destructive' });
    } else if (result.isPro) {
      toast({ title: "Pro restored! 🎉", description: "Your subscription is active again." });
      navigate('/settings');
    } else {
      toast({ title: "No purchases found", description: "No active Pro subscription was found for this Apple ID." });
    }
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="min-h-[44px] min-w-[44px] shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-black leading-none">MoneyGlow Pro</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Unlock your financial superpower</p>
        </div>
      </div>

      {/* Hero Banner */}
      <div className="mx-4 mb-5">
        <div
          className="rounded-3xl p-6 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1e40af 0%, #4f46e5 50%, #7c3aed 100%)', minHeight: 200 }}
        >
          {/* Aurora blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
            <div className="aurora-blob aurora-sky1" style={{ opacity: 0.5 }} />
            <div className="aurora-blob aurora-sky2" style={{ opacity: 0.4 }} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                <Zap className="w-6 h-6 text-yellow-300" />
              </div>
              <div className="flex-1">
                <p className="text-white font-black text-lg leading-none">Go Pro Today</p>
                <p className="text-white/70 text-xs mt-0.5">Your money, on autopilot</p>
              </div>
              <span className="bg-yellow-300 text-indigo-900 text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap">
                7-DAY FREE TRIAL
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: '🤖', label: 'AI coaching', value: 'Daily' },
                { icon: '🎯', label: 'Goals', value: 'Unlimited' },
                { icon: '📊', label: 'Budgets', value: 'Every category' },
              ].map(({ icon, label, value }) => (
                <div key={label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <div className="text-xl mb-0.5">{icon}</div>
                  <p className="text-white font-black text-sm leading-none">{value}</p>
                  <p className="text-white/60 text-[10px] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Plan Toggle */}
      <div className="px-4 mb-5">
        <div className="bg-secondary/70 rounded-2xl p-1.5 flex gap-1.5">
          {(['monthly', 'yearly']).map(p => (
            <button
              key={p}
              onClick={() => setPlan(p)}
              className={`flex-1 rounded-xl py-3.5 flex flex-col items-center transition-all relative ${plan === p ? 'bg-white shadow-md' : 'hover:bg-white/40'}`}
            >
              {PRICES[p].badge && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[9px] font-black px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  {PRICES[p].badge}
                </span>
              )}
              <span className="text-lg font-black text-foreground">{PRICES[p].amount}</span>
              <span className="text-xs text-muted-foreground">{PRICES[p].period}</span>
              {PRICES[p].annual && (
                <span className="text-[10px] text-emerald-600 font-bold mt-0.5">{PRICES[p].annual} billed</span>
              )}
              <span className="text-[10px] text-muted-foreground mt-0.5">{PRICES[p].note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Features List */}
      <div className="px-4 mb-5">
        <div className="sky-card rounded-2xl p-4 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Everything in Pro</p>
          {FEATURES_LIST.map(({ icon: Icon, label, desc }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 py-2"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Free vs Pro comparison */}
      <div className="px-4 mb-5">
        <div className="sky-card rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 px-4 py-2.5 border-b border-border/60 bg-secondary/40">
            <p className="text-xs font-bold text-muted-foreground">Feature</p>
            <p className="text-xs font-bold text-muted-foreground text-center">Free</p>
            <p className="text-xs font-bold text-primary text-center">Pro</p>
          </div>
          {FREE_LIMITS.map(({ label, free, pro }) => (
            <div key={label} className="grid grid-cols-3 px-4 py-2.5 border-b border-border/40 last:border-0">
              <p className="text-xs text-foreground font-medium">{label}</p>
              <p className="text-xs text-muted-foreground text-center">{free}</p>
              <p className="text-xs text-emerald-600 font-bold text-center">{pro}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trust badges */}
      <div className="px-4 mb-6">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { icon: Lock, label: 'Secure', sub: isNativeIOS() ? 'Apple payments' : 'Stripe payments' },
            { icon: Infinity, label: 'Cancel', sub: 'Anytime' },
            { icon: Shield, label: 'Private', sub: 'Data never sold' },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 bg-secondary rounded-xl flex items-center justify-center">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs font-bold text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Iframe Warning */}
      {iframeBlocked && (
        <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          <p className="font-bold mb-1">Checkout only works in the published app.</p>
          <p>Open MoneyGlow from your published URL to complete your purchase.</p>
        </div>
      )}

      {/* Sticky CTA */}
      <div className="px-4">
        {isNativeIOS() ? (
          <>
            <Button
              onClick={handleIOSPurchase}
              disabled={loading || !iosOfferings}
              className="w-full h-14 rounded-2xl text-base font-bold text-white shadow-xl shadow-primary/30 gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}
            >
              <Zap className="w-5 h-5 text-yellow-300" />
              {loading ? 'Processing…' : !iosOfferings ? 'Loading…' : `Start 7-Day Free Trial`}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3 leading-relaxed">
              7 days free, then {PRICES[plan].amount}{PRICES[plan].period} · Cancel anytime · No hidden fees
            </p>
          </>
        ) : (
          <>
            <Button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full h-14 rounded-2xl text-base font-bold text-white shadow-xl shadow-primary/30 gap-2 active:scale-[0.98] transition-all"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}
            >
              <Zap className="w-5 h-5 text-yellow-300" />
              {loading ? 'Opening checkout…' : `Start 7-Day Free Trial`}
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3 leading-relaxed">
              7 days free, then {PRICES[plan].amount}{PRICES[plan].period} · Cancel anytime · No hidden fees
            </p>
          </>
        )}

        {/* Restore Purchases — Apple App Store requirement */}
        {isNativeIOS() ? (
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="w-full mt-2 py-3 text-xs text-muted-foreground font-medium text-center disabled:opacity-50"
          >
            {restoring ? 'Restoring…' : 'Restore Purchases'}
          </button>
        ) : (
          <button
            onClick={() => window.open('https://apps.apple.com/account/subscriptions', '_blank')}
            className="w-full mt-2 py-3 text-xs text-muted-foreground font-medium text-center"
          >
            Restore Purchases
          </button>
        )}
      </div>
    </div>
  );
}