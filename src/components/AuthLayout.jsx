import React from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="w-full max-w-md">
        {/* Yorbit brand mark — same treatment as the app shell's logo
            (Layout.jsx) — a stranger landing here from a link had no way to
            tell which app they were signing into. */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: '#0a0a0a', boxShadow: '0 0 0 1.5px #D4AF37' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} strokeWidth={2.5} />
          </div>
          <span className="font-black text-[15px] tracking-tight text-foreground">Yorbit</span>
        </div>

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
        <p className="text-center text-xs text-muted-foreground/70 mt-4">
          By continuing you agree to Yorbit's{" "}
          <Link to="/terms-of-use" className="underline hover:text-foreground">Terms of Use</Link>
          {" "}and{" "}
          <Link to="/privacy-policy" className="underline hover:text-foreground">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}