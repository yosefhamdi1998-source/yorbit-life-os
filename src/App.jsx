import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard.jsx';
import Finance from '@/pages/Finance.jsx';
import Budget from '@/pages/Budget';
import Coach from '@/pages/Coach';
import Bills from '@/pages/Bills';
import CSVImport from '@/pages/CSVImport';
import Forms from '@/pages/Forms';
import SpendingSummary from '@/pages/SpendingSummary';
import Goals from '@/pages/Goals';
import Settings from '@/pages/Settings';
import LaunchChecklist from '@/pages/LaunchChecklist';
import BankSync from '@/pages/BankSync';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfUse from '@/pages/TermsOfUse';
import Support from '@/pages/Support';
import TestFlightChecklist from '@/pages/TestFlightChecklist';
import AppStoreCopy from '@/pages/AppStoreCopy';
import { FEATURES } from '@/lib/features';
import Upgrade from '@/pages/Upgrade';
import Onboarding from '@/pages/Onboarding';
import Notifications from '@/pages/Notifications';
import Notes from '@/pages/Notes';
import Tasks from '@/pages/Tasks';
import Habits from '@/pages/Habits';
import Journal from '@/pages/Journal';
import HealthLog from '@/pages/HealthLog';
import More from '@/pages/More';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// BankSync conditionally imported but route only renders when FEATURES.bankSync is true

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 gradient-primary rounded-2xl flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading MoneyGlow…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/finance" element={<Finance />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/csv-import" element={<CSVImport />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/spending-summary" element={<SpendingSummary />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/notes" element={<Notes />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/health-log" element={<HealthLog />} />
          <Route path="/more" element={<More />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/upgrade" element={<Upgrade />} />
          {FEATURES.bankSync && <Route path="/bank-sync" element={<BankSync />} />}
          {FEATURES.launchChecklist && <Route path="/launch-checklist" element={<LaunchChecklist />} />}
          {FEATURES.launchChecklist && <Route path="/testflight-checklist" element={<TestFlightChecklist />} />}
          {FEATURES.launchChecklist && <Route path="/app-store-copy" element={<AppStoreCopy />} />}
        </Route>
        <Route path="/onboarding" element={<Onboarding />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-use" element={<TermsOfUse />} />
      <Route path="/support" element={<Support />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;