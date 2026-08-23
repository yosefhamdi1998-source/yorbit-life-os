import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { getUser } from '../_shared/supabase.ts';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return jsonResponse({ error: 'Billing is not enabled yet.' }, 501);
    const stripe = new Stripe(stripeKey);
    const body = await req.json();
    const { priceId, successUrl, cancelUrl } = body;

    if (!priceId || !successUrl || !cancelUrl) {
      return jsonResponse({ error: 'Something went wrong setting up checkout. Please try again.' }, 400);
    }

    // Try to get user if logged in (optional — matches base44's "public app" behavior)
    let userEmail: string | undefined;
    let userId: string | undefined;
    try {
      const user = await getUser(req);
      if (user?.email) userEmail = user.email;
      if (user?.id) userId = user.id;
    } catch (_) { /* public app — no user required */ }

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

    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('create-checkout error:', err.message);
    return jsonResponse({ error: "We couldn't open checkout. Please try again." }, 500);
  }
});
