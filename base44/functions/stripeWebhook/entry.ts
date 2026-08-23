import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import Stripe from 'npm:stripe@14.21.0';

Deno.serve(async (req) => {
  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!subscriptionId) return Response.json({ received: true });

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price?.id;

      let plan = 'free';
      if (priceId === 'price_1Tp0ZJCvjMbso8E2tQSWOW8X') plan = 'pro_monthly';
      if (priceId === 'price_1Tp0ZMCvjMbso8E2xyERKi7E') plan = 'pro_yearly';

      // Check if subscription record already exists for this customer
      const existing = await base44.asServiceRole.entities.Subscription.filter({ stripe_customer_id: customerId });

      if (existing.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(existing[0].id, {
          stripe_subscription_id: subscriptionId,
          plan,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
      } else {
        await base44.asServiceRole.entities.Subscription.create({
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
      }

      console.log(`Subscription activated: ${plan} for customer ${customerId}`);
    }

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const priceId = subscription.items.data[0]?.price?.id;

      let plan = 'free';
      if (priceId === 'price_1Tp0ZJCvjMbso8E2tQSWOW8X') plan = 'pro_monthly';
      if (priceId === 'price_1Tp0ZMCvjMbso8E2xyERKi7E') plan = 'pro_yearly';

      const existing = await base44.asServiceRole.entities.Subscription.filter({ stripe_customer_id: customerId });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(existing[0].id, {
          plan,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
      }
      console.log(`Subscription updated: ${plan} for customer ${customerId}`);
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const existing = await base44.asServiceRole.entities.Subscription.filter({ stripe_customer_id: customerId });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.Subscription.update(existing[0].id, {
          plan: 'free',
          status: 'canceled',
          cancel_at_period_end: false,
        });
      }
      console.log(`Subscription canceled for customer ${customerId}`);
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error('stripeWebhook error:', err.message);
    return Response.json({ error: 'Something went wrong processing the payment.' }, { status: 500 });
  }
});