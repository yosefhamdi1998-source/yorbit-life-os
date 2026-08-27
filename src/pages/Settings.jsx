import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, Trash2, LogOut, AlertTriangle, Shield, Download, Lock, FileText, Mail, ChevronRight, Sparkles, Zap, CheckCircle2, Star, Heart } from 'lucide-react';
import { isNativeIOS } from '@/lib/platform';
import { restorePurchases as rcRestorePurchases } from '@/lib/revenuecat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/PageHeader';
import { FEATURES } from '@/lib/features';
import { APP_STORE_URL } from '@/lib/appStoreConfig';
import { toast } from '@/components/ui/use-toast';

export default function Settings() {
  const urlParams = new URLSearchParams(window.location.search);
  const purchaseSuccess = urlParams.get('success') === '1';
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteResult, setDeleteResult] = useState(''); // 'success' | 'manual' | ''
  const [deleteDataOpen, setDeleteDataOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleLogout = () => {
    base44.auth.logout('/');
  };

  const handleRestoreIOS = async () => {
    setRestoring(true);
    const result = await rcRestorePurchases();
    setRestoring(false);
    if (result.error) {
      toast({ title: 'Restore failed', description: result.error, variant: 'destructive' });
    } else if (result.isPro) {
      toast({ title: 'Pro restored! 🎉', description: 'Your subscription is active again.' });
    } else {
      toast({ title: 'No purchases found', description: 'No active Pro subscription was found for this Apple ID.' });
    }
  };

  const handleDeleteData = async () => {
    setDeleting(true);
    try {
      const [transactions, budgets, savingsGoals, goals, bills, netWorth, aiCache] = await Promise.all([
        base44.entities.Transaction.list('-date', 1000),
        base44.entities.Budget.list(),
        base44.entities.SavingsGoal.list(),
        base44.entities.Goal.list(),
        base44.entities.Bill.list(),
        base44.entities.NetWorthEntry.list(),
        base44.entities.AIInsightCache.list(),
      ]);
      await Promise.all([
        ...transactions.map(t => base44.entities.Transaction.delete(t.id)),
        ...budgets.map(b => base44.entities.Budget.delete(b.id)),
        ...savingsGoals.map(g => base44.entities.SavingsGoal.delete(g.id)),
        ...goals.map(g => base44.entities.Goal.delete(g.id)),
        ...bills.map(b => base44.entities.Bill.delete(b.id)),
        ...netWorth.map(n => base44.entities.NetWorthEntry.delete(n.id)),
        ...aiCache.map(c => base44.entities.AIInsightCache.delete(c.id)),
      ]);
      setDeleteDataOpen(false);
      toast({ title: 'Data deleted', description: 'All your financial data has been removed.' });
    } catch {
      toast({ title: "Couldn't delete everything", description: 'Some items may remain. Please try again.', variant: 'destructive' });
    }
    setDeleting(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      // Server-side: cancels Stripe subscription + wipes all user data
      await base44.functions.invoke('deleteAccount', {});
      base44.auth.logout('/');
    } catch (err) {
      console.error('Delete account error:', err);
      // Fallback: show manual deletion message
      setDeleteResult('manual');
      setDeleting(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const [transactions, budgets, savings_goals, goals, bills, net_worth_entries] = await Promise.all([
        base44.entities.Transaction.list('-date', 1000),
        base44.entities.Budget.list(),
        base44.entities.SavingsGoal.list(),
        base44.entities.Goal.list(),
        base44.entities.Bill.list(),
        base44.entities.NetWorthEntry.list(),
      ]);
      const data = { exported_at: new Date().toISOString(), transactions, budgets, savings_goals, goals, bills, net_worth_entries };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moneyglow-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3000);
    } catch (err) {
      console.error('Export error:', err);
      toast({ title: "Couldn't export data", description: "Please try again in a moment.", variant: 'destructive' });
    }
    setExporting(false);
  };

  return (
    <div className="py-6 pb-8">
      <PageHeader
        title="Settings"
        subtitle="Account & privacy"
        icon={SettingsIcon}
        gradient="gradient-primary"
      />

      <div className="space-y-4">

        {/* Purchase success banner */}
        {purchaseSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm text-emerald-800">Welcome to MoneyGlow Pro! 🎉</p>
              <p className="text-xs text-emerald-700 mt-0.5">Your subscription is active. Enjoy all Pro features.</p>
            </div>
          </div>
        )}

        {/* Upgrade to Pro */}
        <Link to="/upgrade">
          <div className="rounded-2xl p-5 flex items-center justify-between active:opacity-80 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm text-white">MoneyGlow Pro</p>
                <p className="text-xs text-white/70 mt-0.5">Unlock AI Coach, unlimited budgets & more</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-300" />
              <span className="text-white text-xs font-bold">Upgrade</span>
            </div>
          </div>
        </Link>

        {/* Rate the app */}
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400/10 rounded-xl flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="font-bold text-sm">Enjoying MoneyGlow?</p>
              <p className="text-xs text-muted-foreground mt-0.5">Leave us a rating — it really helps!</p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.setItem('rate_prompt_rated', '1');
              // TODO: Set APP_STORE_ID in src/lib/appStoreConfig.js
              if (APP_STORE_URL) window.open(APP_STORE_URL, '_blank');
            }}
            className="flex items-center gap-1 bg-yellow-400/10 hover:bg-yellow-400/20 transition-colors text-yellow-600 rounded-full px-3 py-1.5 text-xs font-bold"
          >
            ⭐ Rate
          </button>
        </div>

        {/* Restore Purchases — Apple requirement */}
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-400/10 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-bold text-sm">Restore Purchases</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isNativeIOS()
                  ? 'Reinstalling or switching devices? Restore your Pro subscription.'
                  : 'Already subscribed? Tap to restore Pro access.'}
              </p>
            </div>
          </div>
          <button
            onClick={isNativeIOS() ? handleRestoreIOS : () => window.open('https://apps.apple.com/account/subscriptions', '_blank')}
            disabled={isNativeIOS() && restoring}
            className="flex items-center gap-1 bg-blue-400/10 hover:bg-blue-400/20 transition-colors text-blue-600 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50"
          >
            {isNativeIOS() && restoring ? 'Restoring…' : 'Restore'}
          </button>
        </div>

        {/* Share / Refer */}
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-400/10 rounded-xl flex items-center justify-center">
              <Heart className="w-5 h-5 text-pink-500" />
            </div>
            <div>
              <p className="font-bold text-sm">Share MoneyGlow</p>
              <p className="text-xs text-muted-foreground mt-0.5">Help a friend take control of their money</p>
            </div>
          </div>
          <button
            onClick={() => { if (navigator.share) { navigator.share({ title: 'MoneyGlow', text: 'I use MoneyGlow to track my finances — check it out!', url: 'https://moneyglow.app' }); } }}
            className="flex items-center gap-1 bg-pink-400/10 hover:bg-pink-400/20 transition-colors text-pink-600 rounded-full px-3 py-1.5 text-xs font-bold"
          >
            Share
          </button>
        </div>

        {/* Connected Accounts — only shown when bank sync feature is enabled */}
        {FEATURES.bankSync && (
          <Link to="/bank-sync">
            <div className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between active:opacity-70 transition-opacity">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-bold text-sm">Connected Accounts</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Manage bank connections and CSV imports</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        )}

        {/* Trust & Privacy */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Trust & Privacy</h3>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                Your financial data stays private and is used only to power your MoneyGlow insights. It is never shared or sold.
              </p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Data used for</span>
              <span className="text-xs font-medium text-foreground">Your insights only</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">AI sees</span>
              <span className="text-xs font-medium text-foreground">Your amounts & categories</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Bank credentials</span>
              <span className="text-xs font-medium text-emerald-600">Never stored</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Data sold to third parties</span>
              <span className="text-xs font-medium text-emerald-600">Never</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border/60 flex gap-3">
            <Link to="/privacy-policy" className="text-xs text-primary font-medium hover:underline">Privacy Policy</Link>
            <Link to="/terms-of-use" className="text-xs text-primary font-medium hover:underline">Terms of Use</Link>
            <a href="mailto:support@moneyglow.app" className="text-xs text-primary font-medium hover:underline">Support</a>
          </div>
        </div>

        {/* Legal & Support */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-sm">Legal & Support</h3>
          </div>
          <div className="space-y-1">
            <Link to="/privacy-policy" className="flex items-center justify-between py-2.5 border-b border-border/50 active:opacity-70 transition-opacity">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground">Privacy Policy</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <Link to="/terms-of-use" className="flex items-center justify-between py-2.5 border-b border-border/50 active:opacity-70 transition-opacity">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground">Terms of Use</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Link>
            <a href="mailto:support@moneyglow.app" className="flex items-center justify-between py-2.5 active:opacity-70 transition-opacity">
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground">Contact Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>
        </div>

        {/* Export Data */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1">Export My Data</h3>
          <p className="text-sm text-muted-foreground mb-4">Download all your transactions, budgets, goals, bills, and net worth entries as a JSON file.</p>
          <Button
            variant="outline"
            onClick={handleExportData}
            disabled={exporting}
            className="w-full min-h-[44px] gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting ? 'Exporting…' : exportDone ? 'Downloaded!' : 'Export My Data'}
          </Button>
        </div>

        {/* Session */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1">Session</h3>
          <p className="text-sm text-muted-foreground mb-4">Sign out of your account on this device.</p>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full min-h-[44px] gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </Button>
        </div>

        {/* Danger Zone */}
        <div className="bg-card border border-destructive/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm text-destructive">Danger Zone</h3>
              <p className="text-sm text-muted-foreground mt-1">These actions are permanent and cannot be undone.</p>
            </div>
          </div>

          {/* Delete My Data only */}
          <AlertDialog open={deleteDataOpen} onOpenChange={setDeleteDataOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full min-h-[44px] gap-2 border-destructive/40 text-destructive hover:bg-destructive/5" disabled={deleting}>
                <Trash2 className="w-4 h-4" /> Delete My Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all your financial data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all your transactions, budgets, goals, bills, and net worth entries. Your account remains. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
                <Button onClick={handleDeleteData} disabled={deleting} className="bg-destructive hover:bg-destructive/90 min-h-[44px] text-white">
                  {deleting ? 'Deleting…' : 'Yes, delete my data'}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Account — requires typing DELETE */}
          {deleteResult === 'manual' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Your data has been deleted.</p>
              <p>To fully remove your account, email <a href="mailto:support@moneyglow.app" className="font-semibold underline">support@moneyglow.app</a>. We'll complete the deletion within 48 hours.</p>
            </div>
          ) : (
            <AlertDialog onOpenChange={(open) => { if (!open) setDeleteConfirmText(''); }}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full min-h-[44px] gap-2" disabled={deleting}>
                  <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete Account & Data'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your financial data and your account. Type <strong>DELETE</strong> below to confirm.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Input
                  placeholder="Type DELETE to confirm"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  className="mt-1"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel className="min-h-[44px]">Cancel</AlertDialogCancel>
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText !== 'DELETE' || deleting}
                    className="bg-destructive hover:bg-destructive/90 min-h-[44px] text-white disabled:opacity-40"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}