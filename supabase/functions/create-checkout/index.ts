import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser } from '../_shared/supabase.ts';
import { PRICE_TO_PLAN, validCheckoutReturn } from '../_shared/billing.ts';
import Stripe from 'npm:stripe@14.21.0';
import { enforceRateLimit, identityFromRequest, RULES } from '../_shared/rateLimit.ts';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);

  try {
    const user = await getUser(req);
    if (!user) return jsonResponse({ error: 'Please sign in before subscribing.' }, 401, {}, req);
    const limited = await enforceRateLimit('checkout', identityFromRequest(req, user.id), RULES.auth, undefined, req);
    if (limited) return limited;
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return jsonResponse({ error: 'Billing is not enabled yet.' }, 501, {}, req);
    const stripe = new Stripe(stripeKey);
    const body = await req.json();
    const { priceId, successUrl, cancelUrl } = body;

    if (!Object.hasOwn(PRICE_TO_PLAN, priceId) || !validCheckoutReturn(successUrl) || !validCheckoutReturn(cancelUrl)) {
      return jsonResponse({ error: 'Something went wrong setting up checkout. Please try again.' }, 400, {}, req);
    }

    const userEmail = user.email;
    const userId = user.id;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: { trial_period_days: 7 },
      ...(userEmail ? { customer_email: userEmail } : {}),
      // Lets stripe-webhook attach the right user_id when it sees this customer for the first time.
      ...(userId ? { client_reference_id: userId } : {}),
    });

    return jsonResponse({ url: session.url, sessionId: session.id }, 200, {}, req);
  } catch (err) {
    console.error('create-checkout error:', err.message);
    return errorResponse("We couldn't open checkout. Please try again.", 500, { internal: err, fn: 'create-checkout', req });
  }
});
