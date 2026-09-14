import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser, userClient } from '../_shared/supabase.ts';
import { validCheckoutReturn } from '../_shared/billing.ts';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';
import Stripe from 'npm:stripe@22.4.0';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);
  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Please sign in to manage your subscription.' }, 401, {}, req);
    const limited = await enforceRateLimit('billing-portal', identityFromRequest(req, user.id), RULES.auth, undefined, req);
    if (limited) return limited;
    const key = Deno.env.get('STRIPE_SECRET_KEY');
    if (!key) return jsonResponse({ error: 'Subscription management is not available yet. Please contact support.' }, 501, {}, req);
    let body;
    try { body = await req.json(); }
    catch { return jsonResponse({ error: 'Invalid request.' }, 400, {}, req); }
    if (!validCheckoutReturn(body?.returnUrl)) return jsonResponse({ error: 'Invalid return address.' }, 400, {}, req);

    // Never accept a customer ID from the browser. Both RLS and this filter
    // bind the portal to the authenticated user's saved subscription records.
    const { data, error } = await userClient(req).from('subscriptions')
      .select('stripe_customer_id').eq('user_id', user.id);
    if (error) throw error;
    const customers = [...new Set((data || []).map(row => row.stripe_customer_id).filter(Boolean))];
    if (!customers.length) return jsonResponse({ error: 'No web subscription was found for this account. If you subscribed through Apple, manage it in your Apple account.' }, 404, {}, req);
    if (customers.length !== 1) return jsonResponse({ error: 'More than one billing profile was found. Please contact support so we can help you manage the correct subscription.' }, 409, {}, req);
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
    const session = await stripe.billingPortal.sessions.create({ customer: customers[0], return_url: body.returnUrl });
    return jsonResponse({ url: session.url }, 200, {}, req);
  } catch (err) {
    return errorResponse("We couldn't open subscription management. Please try again later or contact support.", 500, { internal: err, fn: 'create-billing-portal', req });
  }
});
