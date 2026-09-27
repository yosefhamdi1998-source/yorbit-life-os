import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, serviceClient } from '../_shared/supabase.ts';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';
import { fetchSubscriber, appStoreState, applyAppStoreState } from '../_shared/revenuecat.ts';

// Called by the iOS app right after a purchase or restore so the server
// knows immediately, without waiting for the webhook. Syncs only the signed-in
// caller's own RevenueCat customer; it accepts no user id and no purchase data
// from the client - RevenueCat is asked directly.
Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);
  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);
    const limited = await enforceRateLimit('revenuecat-sync', identityFromRequest(req, user.id), RULES.sync, undefined, req);
    if (limited) return limited;
    const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!secretKey) return jsonResponse({ error: 'App Store purchases are not enabled yet.' }, 501, {}, req);

    const state = appStoreState(await fetchSubscriber(user.id, secretKey));
    await applyAppStoreState(serviceClient(), user.id, state);
    return jsonResponse({ isPro: state.entitled, plan: state.fields.plan }, 200, {}, req);
  } catch (err) {
    return errorResponse("We couldn't confirm your App Store purchase yet. It will update shortly.", 503, { internal: err, fn: 'revenuecat-sync', req });
  }
});
