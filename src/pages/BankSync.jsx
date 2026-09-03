import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Landmark, Plus, RefreshCw, Trash2, AlertCircle, CheckCircle, Clock, Upload, X, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

function fmt(n) { return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const STATUS_CONFIG = {
  connected:     { icon: CheckCircle, color: 'text-emerald-500', label: 'Connected' },
  syncing:       { icon: RefreshCw,   color: 'text-blue-500',    label: 'Syncing…' },
  error:         { icon: AlertCircle, color: 'text-red-500',     label: 'Error' },
  disconnected:  { icon: AlertCircle, color: 'text-muted-foreground', label: 'Disconnected' },
  not_connected: { icon: Clock,       color: 'text-muted-foreground', label: 'Not connected' },
};

export default function BankSync() {
  const [accounts, setAccounts] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [syncResult, setSyncResult] = useState(null); // { imported, skipped }
  const [error, setError] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      const [accountData, holdingData] = await Promise.all([
        base44.entities.ConnectedAccount.list('-created_date', 20),
        base44.entities.InvestmentHolding.list('-institution_value', 100),
      ]);
      setAccounts(accountData.filter(a => a.sync_status !== 'disconnected'));
      setHoldings(holdingData);
    } catch {
      setError("We couldn't load your connected accounts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Load Plaid Link script
  const loadPlaidScript = () => new Promise((resolve, reject) => {
    if (window.Plaid) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const connectBank = async () => {
    setConnecting(true);
    setError(null);
    try {
      await loadPlaidScript();

      // Get link token from backend — the Edge Function returns { link_token } directly
      const res = await base44.functions.invoke('plaidCreateLinkToken', {});
      const { link_token } = res;
      if (!link_token) throw new Error('No link token returned');

      // Open Plaid Link
      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          setConnecting(true);
          try {
            const exchangeRes = await base44.functions.invoke('plaidExchangeToken', {
              public_token,
              institution_name: metadata.institution?.name || 'Bank',
              accounts: metadata.accounts,
            });
            await loadAccounts();
            // Auto-sync the newly added accounts ({ accounts } comes back flat).
            // account_type comes straight from the just-created row — 'investment'
            // (Coinbase and similar) routes to the holdings sync instead of the
            // transaction sync, which doesn't apply to it.
            for (const acct of exchangeRes.accounts || []) {
              await syncAccount(acct.id, acct.account_type);
            }
          } catch (e) {
            setError("We couldn't connect your bank. Please try again.");
          }
          setConnecting(false);
        },
        onExit: (err) => {
          if (err) setError('Bank connection was cancelled.');
          setConnecting(false);
        },
      });
      handler.open();
    } catch (e) {
      setError(e.message || "We couldn't start the bank connection. Please try again.");
      setConnecting(false);
    }
  };

  const syncAccount = async (id, accountType) => {
    setSyncingId(id);
    setSyncResult(null);
    setError(null);
    const isInvestment = accountType === 'investment';
    try {
      if (isInvestment) {
        const res = await base44.functions.invoke('plaidSyncHoldings', { connected_account_id: id });
        setSyncResult({ holdingsSynced: res.synced });
      } else {
        const res = await base44.functions.invoke('plaidSyncTransactions', { connected_account_id: id });
        setSyncResult({ imported: res.imported, skipped: res.skipped });
      }
      await loadAccounts();
    } catch (e) {
      setError(isInvestment ? "We couldn't sync your holdings. Please try again." : "We couldn't sync your transactions. Please try again.");
    }
    setSyncingId(null);
  };

  const disconnect = async (id) => {
    await base44.entities.ConnectedAccount.update(id, { sync_status: 'disconnected' });
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  if (loading) {
    return (
      <div className="py-4 space-y-3">
        {[1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-secondary animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="py-4 pb-8">
      <PageHeader
        title="Connected Accounts"
        subtitle="Auto-import transactions from your bank"
        icon={Landmark}
        gradient="gradient-primary"
        action={
          accounts.length > 0 && (
            <Button size="sm" onClick={connectBank} disabled={connecting} className="gap-1">
              {connecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add Bank
            </Button>
          )
        }
      />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-4 text-sm text-emerald-700">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            {syncResult.holdingsSynced != null
              ? `Synced! ${syncResult.holdingsSynced} holding${syncResult.holdingsSynced !== 1 ? 's' : ''} updated.`
              : `Synced! ${syncResult.imported} new transaction${syncResult.imported !== 1 ? 's' : ''} imported${syncResult.skipped > 0 ? `, ${syncResult.skipped} duplicates skipped` : ''}.`}
          </span>
          <button onClick={() => setSyncResult(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="sky-card rounded-2xl p-8 text-center border border-dashed border-blue-200">
          <div className="w-14 h-14 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
            <Landmark className="w-7 h-7 text-white" />
          </div>
          <p className="text-base font-black text-foreground mb-1">Connect your bank</p>
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            Automatically import transactions and keep MoneyGlow up to date. Works with banks, Venmo, and Coinbase — search for it by name below. Your credentials are never stored.
          </p>
          <Button
            onClick={connectBank}
            disabled={connecting}
            className="w-full min-h-[44px] gap-2 mb-3"
          >
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {connecting ? 'Connecting…' : 'Connect Bank with Plaid'}
          </Button>
          <Link to="/csv-import">
            <Button variant="outline" className="w-full min-h-[44px] gap-2">
              <Upload className="w-4 h-4" /> Import CSV instead
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acct => {
            const cfg = STATUS_CONFIG[acct.sync_status] || STATUS_CONFIG.not_connected;
            const Icon = cfg.icon;
            const isInvestment = acct.account_type === 'investment';
            const isSyncing = syncingId === acct.id || acct.sync_status === 'syncing';
            return (
              <div key={acct.id} className="sky-card rounded-2xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    {isInvestment ? <TrendingUp className="w-5 h-5 text-primary" /> : <Landmark className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{acct.institution_name}</p>
                    <p className="text-xs text-muted-foreground">{acct.account_name}{acct.account_mask ? ` ···${acct.account_mask}` : ''}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Icon className={`w-3 h-3 ${cfg.color} ${isSyncing ? 'animate-spin' : ''}`} />
                      <span className={`text-xs font-medium ${cfg.color}`}>{isSyncing ? 'Syncing…' : cfg.label}</span>
                      {acct.last_synced_at && !isSyncing && (
                        <span className="text-xs text-muted-foreground ml-1">
                          · {format(new Date(acct.last_synced_at), 'MMM d, h:mm a')}
                        </span>
                      )}
                    </div>
                    {acct.error_message && (
                      <p className="text-xs text-red-500 mt-1">{acct.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline" size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => syncAccount(acct.id, acct.account_type)}
                      disabled={!!syncingId}
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing' : 'Sync'}
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => disconnect(acct.id)}
                      aria-label="Disconnect account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          <Button onClick={connectBank} disabled={connecting} variant="outline" className="w-full min-h-[44px] gap-2">
            {connecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {connecting ? 'Connecting…' : 'Connect Another Bank'}
          </Button>
        </div>
      )}

      {/* Holdings — a Coinbase/brokerage connection reports positions, not a
          transaction feed, so it gets its own breakdown instead of trying to
          force crypto balances into the transaction list above. */}
      {holdings.length > 0 && (
        <div className="mt-6 sky-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-foreground">Holdings</p>
            </div>
            <p className="text-sm font-black text-foreground tabular-nums">
              ${fmt(holdings.reduce((s, h) => s + (h.institution_value || 0), 0))}
            </p>
          </div>
          <div className="divide-y divide-border/50">
            {holdings.map(h => (
              <div key={h.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{h.security_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.ticker_symbol ? `${h.ticker_symbol} · ` : ''}{h.quantity != null ? `${Number(h.quantity).toLocaleString('en-US', { maximumFractionDigits: 8 })} units` : ''}
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums shrink-0">${fmt(h.institution_value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 sky-card rounded-2xl p-4">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Privacy Note</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          MoneyGlow uses read-only bank connections powered by Plaid. Your login credentials are never stored — only a secure access token is saved to fetch transactions.
        </p>
      </div>
    </div>
  );
}