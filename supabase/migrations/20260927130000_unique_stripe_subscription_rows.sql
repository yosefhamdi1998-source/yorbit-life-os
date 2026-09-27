-- One row per Stripe subscription. stripe-webhook now keys rows by
-- subscription (never overwriting one subscription's row with another's
-- event), so two deliveries racing to insert the same new subscription must
-- not both succeed: the loser fails here, returns an error, and Stripe's
-- retry then updates the row that won. Fails loudly if duplicates already
-- exist, rather than silently choosing one.
create unique index if not exists subscriptions_stripe_subscription_id_key
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
