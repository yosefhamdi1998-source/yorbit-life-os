import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const body = await req.json();
    const { priceId, successUrl, cancelUrl } = body;

    if (!priceId || !successUrl || !cancelUrl) {
      return Response.json({ error: 'Something went wrong setting up checkout. Please try again.' }, { status: 400 });
    }

    // Try to get user if logged in (optional — app is public)
    let userEmail = undefined;
    try {
      const base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      if (user?.email) userEmail = user.email;
    } catch (_) { /* public app — no user required */ }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7,
      },
      ...(userEmail ? { customer_email: userEmail } : {}),
      metadata: {
        base44_app_id: Deno.env.get('BASE44_APP_ID'),
      },
    });

    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('createCheckout error:', err.message);
    return Response.json({ error: 'We couldn\'t open checkout. Please try again.' }, { status: 500 });
  }
});