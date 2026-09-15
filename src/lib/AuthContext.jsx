import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const authVersion = useRef(0);
  const mounted = useRef(false);

  const checkUserAuth = async (expectedUserId) => {
    const version = ++authVersion.current;
    const isCurrent = () => mounted.current && version === authVersion.current;
    if (!mounted.current) return;
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await base44.auth.me();
      if (!isCurrent()) return;
      if (!currentUser?.id || (expectedUserId && currentUser.id !== expectedUserId)) {
        throw Object.assign(new Error('Account changed. Please sign in again.'), { status: 401 });
      }
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      if (!isCurrent()) return;
      setUser(null);
      setIsAuthenticated(false);
      if (error?.status === 401) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    } finally {
      if (isCurrent()) {
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    let pendingCheck;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      // Invalidate old requests immediately, before a deferred profile read starts.
      const version = ++authVersion.current;
      clearTimeout(pendingCheck);
      setAuthError(null);
      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
        return;
      }
      setUser(previous => previous?.id === session.user.id ? previous : null);
      setIsLoadingAuth(true);
      // Leave Supabase's synchronous auth callback before calling auth APIs.
      pendingCheck = setTimeout(() => {
        if (mounted.current && version === authVersion.current) {
          void checkUserAuth(session.user.id);
        }
      }, 0);
    });
    void checkUserAuth();
    return () => {
      mounted.current = false;
      ++authVersion.current;
      clearTimeout(pendingCheck);
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const logout = (shouldRedirect = true) => {
    ++authVersion.current;
    setUser(null);
    setIsAuthenticated(false);
    setIsLoadingAuth(false);
    return base44.auth.logout(shouldRedirect ? '/login' : undefined);
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Kept for compatibility with any page still reading these — Supabase has
        // no separate "app public settings" concept, so these resolve immediately.
        isLoadingPublicSettings: false,
        appPublicSettings: null,
        authError,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
