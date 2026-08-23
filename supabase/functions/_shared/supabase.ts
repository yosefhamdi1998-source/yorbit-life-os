import { createClient } from 'npm:@supabase/supabase-js@2';

// Client scoped to the calling user's JWT (respects RLS) — use this to verify
// who's calling and to read/write data as that user would be allowed to.
export function userClient(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

// Service-role client — bypasses RLS entirely. Only ever use this after you've
// verified the caller's identity (via userClient(...).auth.getUser()), and only
// to touch that same verified user's rows unless the operation is explicitly
// system-wide (e.g. generateSubscriptionReminders, syncAllAccounts).
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

export async function getUser(req: Request) {
  const supabase = userClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
