import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import ScrollToTop from '@/components/ScrollToTop';
import Layout from '@/components/Layout';
import { FEATURES } from '@/lib/features';

// Every page is its own chunk, fetched only when actually visited, instead
// of one ~1.9MB bundle shipped to every user regardless of which page they
// open. Layout/ProtectedRoute/ErrorBoundary stay eager since they're always
// needed immediately.
const Dashboard = lazy(() => import('@/pages/Dashboard.jsx'));
const Finance = lazy(() => import('@/pages/Finance.jsx'));
const Budget = lazy(() => import('@/pages/Budget'));
const Coach = lazy(() => import('@/pages/Coach'));
const Bills = lazy(() => import('@/pages/Bills'));
const CSVImport = lazy(() => import('@/pages/CSVImport'));
const Forms = lazy(() => import('@/pages/Forms'));
const SpendingSummary = lazy(() => import('@/pages/SpendingSummary'));
const Goals = lazy(() => import('@/pages/Goals'));
const SaveMore = lazy(() => import('@/pages/SaveMore'));
const Recurring = lazy(() => import('@/pages/Recurring'));
const Settings = lazy(() => import('@/pages/Settings'));
const LaunchChecklist = lazy(() => import('@/pages/LaunchChecklist'));
const BankSync = lazy(() => import('@/pages/BankSync'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('@/pages/TermsOfUse'));
const Support = lazy(() => import('@/pages/Support'));
const TestFlightChecklist = lazy(() => import('@/pages/TestFlightChecklist'));
const AppStoreCopy = lazy(() => import('@/pages/AppStoreCopy'));
const Upgrade = lazy(() => import('@/pages/Upgrade'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Notes = lazy(() => import('@/pages/Notes'));
const Tasks = lazy(() => import('@/pages/Tasks'));
const Habits = lazy(() => import('@/pages/Habits'));
const Journal = lazy(() => import('@/pages/Journal'));
const HealthLog = lazy(() => import('@/pages/HealthLog'));
const More = lazy(() => import('@/pages/More'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
// BankSync conditionally imported but route only renders when FEATURES.bankSync is true

const PageLoading = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
  </div>
);

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
    <Suspense fallback={<PageLoading />}>
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
            <Route path="/save-more" element={<SaveMore />} />
            <Route path="/recurring" element={<Recurring />} />
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
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
