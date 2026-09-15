import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

// CHANGED FROM BASE44: Supabase's password-recovery email links to
// `${redirectTo}#access_token=...&type=recovery` (a URL *hash*, not a `?token=`
// query param). The Supabase client (see supabaseClient.js: detectSessionInUrl: true)
// picks that up automatically on page load and establishes a temporary "recovery"
// session — there's no separate token for this page to read or pass along.
// So instead of gating on a query param, this page waits for that recovery
// session to appear via onAuthStateChange (event === 'PASSWORD_RECOVERY').
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    let version = 0;
    const checkSession = async (markMissingInvalid = false) => {
      const request = ++version;
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (disposed || request !== version) return;
        if (sessionError) throw sessionError;
        if (data?.session) {
          setReady(true);
          setInvalid(false);
        } else if (markMissingInvalid) {
          setReady(false);
          setInvalid(true);
        }
      } catch {
        if (disposed || request !== version) return;
        setReady(false);
        setInvalid(true);
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (disposed) return;
      if (event === "PASSWORD_RECOVERY") {
        ++version;
        setReady(true);
        setInvalid(false);
      } else if (event === "SIGNED_OUT") {
        ++version;
        setReady(false);
        setInvalid(true);
      }
    });
    // Existing sessions support revisiting this page; server auth still
    // authorizes the password update. Failed reads must not leave a spinner.
    void checkSession();
    const timeout = setTimeout(() => { void checkSession(true); }, 2500);
    return () => {
      disposed = true;
      ++version;
      listener?.subscription?.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ newPassword });
      window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/login`;
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (invalid && !ready) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Unable to verify reset link"
        subtitle="The link may have expired, or your session could not be loaded"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          Try opening the link again. If that does not work, request a new password reset email.
        </p>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout icon={Lock} title="Verifying link…" subtitle="One moment">
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title="New password" subtitle="Enter your new password below">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
