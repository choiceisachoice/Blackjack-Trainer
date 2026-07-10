# Stripe Setup — going live with Pro

The code (client gating, Edge Functions, migration) is in the repo. This is the
manual wiring you do in the Stripe and Supabase dashboards / CLI. Do it all in
**Stripe test mode first** and only switch to live keys once a full test
purchase works end to end.

See [ADR-002](./ADR-002-stripe-premium-gating.md) for the why.

## 1. Run the migration

Apply `supabase/migrations/20260710120000_stripe_entitlements.sql` to your
Supabase project (via `npx supabase db push`, or paste it into the SQL editor).
It adds the entitlement columns, the `stripe_events` idempotency ledger, and the
trigger that stops a user from writing their own entitlement.

**Verify the lock:** signed in as a normal user, try
`update profiles set subscription_status='active' where id = auth.uid();` from
the client — it must NOT change the value (the trigger reverts it).

## 2. Stripe: product, prices, portal

1. Create a **Product** ("Blackjack Trainer Pro").
2. Add two **recurring Prices**: monthly and yearly. Copy their `price_…` ids.
3. Enable the **Customer Portal** (Settings → Billing → Customer portal) and
   allow cancellation.
4. Adjust the display prices in `src/services/pro-features.ts` (`PLAN_OPTIONS`)
   to match the amounts you set — those strings are display-only.

## 3. Deploy the Edge Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
# The webhook has NO Supabase JWT — its auth is the Stripe signature:
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 4. Set the function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_… \
  STRIPE_WEBHOOK_SECRET=whsec_… \
  STRIPE_PRICE_MONTHLY=price_… \
  STRIPE_PRICE_YEARLY=price_… \
  APP_URL=http://localhost:5173      # your real origin in production
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected by
the platform — do not set them, and never put any of these in a `VITE_*` var
(Vite inlines those into the client bundle).

## 5. Register the webhook

In Stripe → Developers → Webhooks, add an endpoint pointing at the deployed
`stripe-webhook` function URL
(`https://<project-ref>.functions.supabase.co/stripe-webhook`). Subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

Copy the endpoint's **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`
(step 4).

## 6. Test end to end (test mode)

1. `stripe listen --forward-to https://<ref>.functions.supabase.co/stripe-webhook`
   (or use the dashboard endpoint) to see events.
2. Sign in, click **Go Pro**, pick a plan, pay with test card `4242 4242 4242 4242`.
3. Confirm `profiles.subscription_status` becomes `active` and the app unlocks
   the Pro modes on next load / re-fetch.
4. **Replay the same event twice** from the Stripe dashboard — the second must be
   a no-op (the `stripe_events` ledger dedupes it).
5. Open **Manage subscription** → cancel → confirm status flips and access ends
   at the period end.

## 7. Go live

Swap the `sk_test_`/`whsec_`/`price_` secrets for live-mode values, set `APP_URL`
to the production origin, and re-run one real purchase before announcing it.
