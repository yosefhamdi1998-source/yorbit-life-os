import { jsonResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import Stripe from 'npm:stripe@14.21.0';

// Point Stripe's webhook at:
// https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
// Set STRIPE_WEBHOOK_SECRET from Stripe's webhook config screen.
// IMPORTANT: this endpoint must accept unauthenticated requests (Stripe can't send
// your Supabase anon/service key) — deploy with `--no-verify-jwt`, see MIGRATION_STEPS.md.

// Fill in your own Stripe Price IDs here once you've re-created products in Stripe.
const PRICE_TO_PLAN: Record<string, string> = {
  // 'price_XXXXXXXXXXXX': 'pro_monthly',
  // 'price_YYYYYYYYYYYY': 'pro_yearly',
};

Deno.serve(async (req) => {
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookSecret) return jsonResponse({ error: 'Billing is not enabled yet.' }, 501);

    const stripe = new Stripe(stripeKey);
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    const admin = serviceClient();

    async function upsertSubscription(customerId: string, fields: Record<string, unknown>, userId?: string) {
      const { data: existing } = await admin
        .from('subscriptions').select('id').eq('stripe_customer_id', customerId);
      if (existing && existing.length > 0) {
        await admin.from('subscriptions').update(fields).eq('id', existing[0].id);
      } else if (userId) {
        await admin.from('subscriptions').insert({ ...fields, stripe_customer_id: customerId, user_id: userId });
      } else {
        console.warn(`No local subscription row and no user_id for new Stripe customer ${customerId}; skipping.`);
      }
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const userId = session.client_reference_id as string | undefined;
      if (!subscriptionId) return jsonResponse({ received: true });

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId || ''] || 'free';

      await upsertSubscription(customerId, {
        stripe_subscription_id: subscriptionId,
        plan,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      }, userId);
      console.log(`Subscription activated: ${plan} for customer ${customerId}`);
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any;
      const customerId = subscription.customer;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = PRICE_TO_PLAN[priceId || ''] || 'free';

      await upsertSubscription(customerId, {
        plan,
        status: subscription.status,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
      console.log(`Subscription updated: ${plan} for customer ${customerId}`);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const customerId = subscription.customer;
      await upsertSubscription(customerId, {
        plan: 'free',
        status: 'canceled',
        cancel_at_period_end: false,
      });
      console.log(`Subscription canceled for customer ${customerId}`);
    }

    return jsonResponse({ received: true });
  } catch (err) {
    console.error('stripe-webhook error:', err.message);
    return jsonResponse({ error: 'Something went wrong processing the payment.' }, 500);
  }
});
