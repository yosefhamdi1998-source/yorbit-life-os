import * as Sentry from '@sentry/react';

// No-ops entirely until VITE_SENTRY_DSN is set - safe to ship with nothing
// configured, and a one-line env var away from being live.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const errorReportingEnabled = Boolean(dsn);

export function initErrorReporting() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

export function reportError(error, context) {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
