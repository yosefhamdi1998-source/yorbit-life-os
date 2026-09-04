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

// Gate for system/cron endpoints that act across ALL users.
//
// Three functions got this wrong in three different ways, all with the same
// root cause: they treated "the platform let this request through" as
// authorisation. It isn't. Supabase's verify_jwt only proves the caller
// presented a structurally valid key — and the anon key ships inside the
// frontend bundle, so every visitor has one.
//
// The failures that produced:
//   sync-all-accounts               ran the admin check only if a user
//                                   resolved, so no user meant no check
//   generate-subscription-reminders no check at all - anyone could write
//                                   notifications to every user
//   weekly-custom-record-analysis   no check at all - anyone could trigger
//                                   AI analysis for every user, on your bill
//
// Returns null when the caller is allowed, or a Response to return as-is.
export async function requireSystemCaller(
  req: Request,
  admin: ReturnType<typeof serviceClient>,
  jsonResponse: (b: unknown, s?: number, h?: Record<string, string>, r?: Request) => Response,
): Promise<Response | null> {
  const authHeader = req.headers.get('Authorization') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '__none__';
  if (authHeader.includes(serviceKey)) return null; // pg_cron / server-to-server

  // Anything else must be a real signed-in admin. Deny by default: an
  // unauthenticated caller is not an admin, and that has to be the default
  // branch rather than a case that falls through.
  const user = await getUser(req);
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403, {}, req);

  return null;
}
