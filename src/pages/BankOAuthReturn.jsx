import { Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';

// Reached only when Plaid's OAuth redirect_uri loaded as a real page instead
// of being intercepted back into the native app - meaning the universal
// link (iOS) or app link (Android) isn't registered yet, or interception
// otherwise didn't happen. See NATIVE_BANK_LINK_REDIRECT_URI in
// src/lib/plaidLink.js and OWNER_ACTIONS.md for what's still required.
// This is a safety net, not the primary mechanism.
export default function BankOAuthReturn() {
  return (
    <div className="max-w-lg mx-auto p-6">
      <PageHeader title="Bank Connection" />
      <p className="mt-4 text-muted-foreground">
        Return to the Yorbit app to finish connecting your bank. If it doesn't reopen on its own, switch to it manually — your progress wasn't lost.
      </p>
      <Link to="/bank-sync" className="inline-flex min-h-[44px] items-center underline mt-6">
        Go to Bank Sync
      </Link>
    </div>
  );
}
