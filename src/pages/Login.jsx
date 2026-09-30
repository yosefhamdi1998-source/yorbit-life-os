import React, { useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import { FEATURES } from "@/lib/features";
import { isEmailNotConfirmed } from "@/lib/authErrors";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // An unconfirmed account can't log in until its email is confirmed; the
  // only way forward is a new link, so offer one right here.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState("");
  const oauthStarting = useRef(false);
  // Set by the email confirmation link, so a confirmed account lands on an
  // acknowledgement rather than a bare form that looks like nothing happened.
  const [params] = useSearchParams();
  const justConfirmed = params.get("confirmed") === "1";

  // A confirmation link lands here with the session in the URL hash, so the
  // account is already signed in by the time this renders — sitting on the
  // form would look like the link did nothing. Also surface the hash error
  // Supabase returns for an expired or reused link.
  const [linkError, setLinkError] = useState("");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error_description")) {
      setLinkError(hash.get("error_description").replace(/\+/g, " "));
      // Clear it from the URL once it's been read. Without this the hash
      // sticks around for the life of the tab (and through any bookmark or
      // reload of that URL), so a single expired email link made the error
      // banner reappear on EVERY subsequent visit to the login page — it
      // looked like logging in was permanently broken when nothing was
      // actually wrong.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const home = import.meta.env.BASE_URL;
    base44.auth.getSession().then((session) => { if (session) window.location.replace(home); });
    return base44.auth.onAuthStateChange((session) => { if (session) window.location.replace(home); });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUnconfirmed(false);
    setResendNote("");
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password);
      window.location.href = import.meta.env.BASE_URL;
    } catch (err) {
      if (isEmailNotConfirmed(err)) setUnconfirmed(true);
      else setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    setResending(true);
    setResendNote("");
    try {
      await base44.auth.resendOtp(email);
      setResendNote(`Sent. Check ${email}, including your spam folder.`);
    } catch (err) {
      setResendNote(`We couldn't send a new link: ${err.message || "please try again in a few minutes."}`);
    } finally {
      setResending(false);
    }
  };

  const handleGoogle = async () => {
    if (oauthStarting.current) return;
    oauthStarting.current = true;
    setLoading(true);
    setError('');
    try { await base44.auth.loginWithProvider('google', '/'); }
    catch { setError('Unable to open Google sign-in. Please try again.'); }
    finally { oauthStarting.current = false; setLoading(false); }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      {FEATURES.googleLogin && (
        <>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-medium mb-6"
            onClick={handleGoogle}
            disabled={loading}
          >
            <GoogleIcon className="w-5 h-5 mr-2" />
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">or</span>
            </div>
          </div>
        </>
      )}

      {linkError && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {linkError}. Request a new link below.
        </div>
      )}

      {justConfirmed && !error && !linkError && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm">
          Email confirmed. Log in below to get started.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {unconfirmed && (
        <div role="status" className="mb-4 p-3 rounded-lg bg-secondary text-sm">
          <p className="font-medium">Confirm your email to log in.</p>
          <p className="mt-1 text-muted-foreground">
            We sent a confirmation link to {email} when you signed up. Check your inbox and spam folder, or send a new link.
          </p>
          <Button type="button" variant="outline" className="mt-3 min-h-[44px]" onClick={handleResendConfirmation} disabled={resending}>
            {resending ? "Sending…" : "Resend confirmation email"}
          </Button>
          {resendNote && <p className="mt-2" aria-live="polite">{resendNote}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setUnconfirmed(false); setResendNote(""); }}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
