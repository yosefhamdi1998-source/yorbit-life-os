import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUser } from '../_shared/supabase.ts';
import { billingPrices, CHECKOUT_PLANS, checkoutAllowed, planForPrice, stripeMode, validCheckoutReturn } from '../_shared/billing.ts';
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
    const prices = billingPrices(stripeKey, name => Deno.env.get(name));
    if (!stripeKey || !prices) {
      if (stripeKey) console.error(`create-checkout: no ${stripeMode(stripeKey) ?? 'unrecognised'}-mode prices configured`);
      return jsonResponse({ error: 'Billing is not enabled yet.' }, 501, {}, req);
    }
    if (!checkoutAllowed(stripeKey, user.email, name => Deno.env.get(name))) {
      return jsonResponse({ error: 'Billing is not enabled yet.' }, 501, {}, req);
    }
    const stripe = new Stripe(stripeKey);
    const body = await req.json();
    const { plan, successUrl, cancelUrl } = body;
    // `priceId` is what web builds before the plan-name change send.
    const priceId = Object.hasOwn(CHECKOUT_PLANS, plan) ? prices[CHECKOUT_PLANS[plan]]
      : planForPrice(prices, body.priceId) ? body.priceId : undefined;

    if (!priceId || !validCheckoutReturn(successUrl) || !validCheckoutReturn(cancelUrl)) {
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
