// Dev-only stand-in for AuthContext, wired in by vite.fixture.config.js.
// Never bundled by `npm run build` — the alias exists only in that config.
import { createContext, useContext } from 'react';

const AuthContext = createContext(null);
const FAKE_USER = { id: 'fixture-user', email: 'fixture@example.test', user_metadata: { full_name: 'Fixture User' } };

export const AuthProvider = ({ children }) => (
  <AuthContext.Provider
    value={{
      user: FAKE_USER,
      isAuthenticated: true,
      isLoadingAuth: false,
      isLoadingPublicSettings: false,
      appPublicSettings: null,
      authError: null,
      authChecked: true,
      logout: async () => {},
      navigateToLogin: () => {},
      checkUserAuth: async () => {},
      checkAppState: async () => {},
    }}
  >
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
