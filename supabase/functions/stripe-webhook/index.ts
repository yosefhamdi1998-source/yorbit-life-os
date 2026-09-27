import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { PRICE_TO_PLAN } from '../_shared/billing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import Stripe from 'npm:stripe@14.21.0';

// Point Stripe's webhook at:
// https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
// Set STRIPE_WEBHOOK_SECRET from Stripe's webhook config screen.
// IMPORTANT: this endpoint must accept unauthenticated requests (Stripe can't send
// your Supabase anon/service key) — deploy with `--no-verify-jwt`, see MIGRATION_STEPS.md.

// Stripe statuses the subscriptions table cannot store are mapped to the
// nearest state that grants no access, so an unexpected status never fails
// the write (which Stripe would retry for days) and never grants Pro.
const STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  unpaid: 'past_due',
  paused: 'past_due',
  incomplete_expired: 'canceled',
};

Deno.serve(async (req) => {
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!stripeKey || !webhookSecret) return jsonResponse({ error: 'Billing is not enabled yet.' }, 501, {}, req);

    const stripe = new Stripe(stripeKey);
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return jsonResponse({ error: 'Invalid signature' }, 400, {}, req);
    }

    const admin = serviceClient();

    // Writes a subscription's CURRENT state, fetched from Stripe - never the
    // event's own snapshot. Stripe neither guarantees delivery order nor
    // stops retrying/replaying events, so an 'updated' (active) delivered
    // after 'deleted' must not restore access; converging on Stripe's
    // present state makes every delivery, in any order, safe to repeat.
    // Rows are keyed by subscription, never overwritten by another
    // subscription's event: a replayed event for a canceled subscription
    // cannot clobber the same customer's newer, paid one.
    async function applySubscription(subscriptionId: string, userId?: string) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      const status = STATUS_MAP[subscription.status] ?? 'canceled';
      const priceId = subscription.items?.data?.[0]?.price?.id;
      const fields = {
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        plan: status === 'canceled' ? 'free' : (PRICE_TO_PLAN[priceId || ''] || 'free'),
        status,
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: !!subscription.cancel_at_period_end,
      };

      const own = await admin.from('subscriptions').select('id').eq('stripe_subscription_id', subscription.id);
      if (own.error) throw own.error;
      let targetId = own.data?.[0]?.id;

      if (!targetId) {
        // A row created for this customer before any subscription was tied
        // to it (older webhook versions keyed by customer only).
        const untied = await admin.from('subscriptions').select('id')
          .eq('provider', 'stripe').eq('stripe_customer_id', customerId).is('stripe_subscription_id', null);
        if (untied.error) throw untied.error;
        targetId = untied.data?.[0]?.id;
      }

      if (targetId) {
        const { error } = await admin.from('subscriptions').update(fields).eq('id', targetId);
        if (error) throw error;
        return;
      }

      let owner = userId;
      if (!owner) {
        const known = await admin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).limit(1);
        if (known.error) throw known.error;
        owner = known.data?.[0]?.user_id;
      }
      if (!owner) throw new Error('Subscription owner is not available yet; retry this event.');
      // A concurrent delivery for the same new subscription loses on the
      // unique index and is retried by Stripe, which then updates the row.
      const { error } = await admin.from('subscriptions').insert({ ...fields, user_id: owner });
      if (error) throw error;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if (session.subscription) {
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        await applySubscription(subscriptionId, session.client_reference_id || undefined);
        console.log(`Checkout completed for subscription ${subscriptionId}`);
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      await applySubscription(subscription.id);
      console.log(`Subscription ${event.type.split('.').pop()} event applied for ${subscription.id}`);
    }

    return jsonResponse({ received: true }, 200, {}, req);
  } catch (err) {
    console.error('stripe-webhook error:', err.message);
    return errorResponse('Something went wrong processing the payment.', 500, { internal: err, fn: 'stripe-webhook', req });
  }
});
