// Supabase refuses a password login until the account's email is confirmed.
// That needs a new confirmation link, not a different password, so the login
// screen offers a resend instead of showing the raw "Email not confirmed".
export function isEmailNotConfirmed(error) {
  return error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '');
}
