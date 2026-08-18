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
4. Nothing to change in the app. The prices shown on the paywall and the
   landing card are fetched from these Prices at runtime by `get-plan-prices`,
   so the amounts exist once, in Stripe. (They used to be literals in
   `src/services/pro-features.ts` kept in step by hand, which is how the page
   came to advertise CHF 8.90 while the configured price charged 7.90.)

## 3. Deploy the Edge Functions

```bash
# All four use --no-verify-jwt. The webhook authenticates by Stripe signature;
# the other two verify the user INSIDE the function (getUser on the passed token).
# Leaving the platform JWT gate on would reject the browser's CORS preflight
# (the OPTIONS request carries no JWT) → "Failed to send a request to the Edge Function".
supabase functions deploy create-checkout-session --no-verify-jwt
supabase functions deploy create-portal-session --no-verify-jwt
supabase functions deploy get-plan-prices --no-verify-jwt
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
5. **Check the paywall shows the price you set**, and that it shows *nothing*
   rather than a stale figure when `get-plan-prices` is undeployed or failing.
6. **Send a live-mode event at a test-mode deployment** (or the reverse) — the
   webhook must answer 202 and write nothing. Production once accepted sandbox
   events and granted real Pro from a test card.
7. Open **Manage subscription** → cancel → confirm status flips and access ends
   at the period end.

## 7. Go live

> ⚠️ **Do this at deployment time, not on localhost.** Live keys charge real
> cards, and `APP_URL` must be the real production origin — Stripe redirects the
> customer to `${APP_URL}/app` after paying, which only works on a public domain.
> Live mode is entirely separate from test mode (separate keys, prices, webhook).

Ordered checklist:

1. **Deploy the app first** to its production domain (e.g. `https://app.example.com`)
   — this is the prerequisite; without it the post-payment redirect is broken.
2. In Stripe, flip the dashboard to **live mode** and re-create the product +
   the two recurring **prices** there (test-mode price ids do NOT work live).
   Note the new live `price_…` ids.
3. Add a **live-mode webhook endpoint** pointing at the same function URL
   (`https://<ref>.supabase.co/functions/v1/stripe-webhook`), same five events,
   and copy its **live** signing secret (`whsec_…`).
4. Grab the **live secret key** (`sk_live_…`) from the live API-keys page.
5. Update the Supabase secrets in one go:
   ```bash
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_live_… \
     STRIPE_WEBHOOK_SECRET=whsec_…(live) \
     STRIPE_PRICE_MONTHLY=price_…(live) \
     STRIPE_PRICE_YEARLY=price_…(live) \
     APP_URL=https://app.example.com
   ```
   (No function redeploy needed — secrets are read at runtime.)
6. Enable the **live** Customer Portal (Settings → Billing → Customer portal).
7. Do **one real, low-value purchase** end to end, confirm `subscription_status`
   flips to `active`, then cancel it from the portal before announcing.

> ⚠️ There is only **one** set of Supabase secrets, so this is a switch, not a
> parallel setup. The moment `STRIPE_SECRET_KEY` holds an `sk_live_…`, the test
> card `4242…` no longer works against production. Do the full test-mode run
> first; you do not get to keep both.

## 8. VAT — Swiss customers only

The operator is a Swiss company selling to consumers. Swiss customers owe Swiss
VAT; customers elsewhere owe nothing here and must see no VAT line at all.

**A fixed Tax Rate cannot express that.** The Checkout Session is created before
the customer types an address, so at that point their country is unknown —
attaching a Swiss rate applies it to everyone, and a German customer's invoice
would claim Swiss VAT. Use **Stripe Tax**, which decides from the address the
customer actually enters.

Order matters; enabling the flag before the dashboard is ready makes Stripe
reject every session, and nobody can buy anything:

1. **Stripe → Tax**: activate Stripe Tax and add the **Switzerland**
   registration. Only registered jurisdictions get taxed; everywhere else
   produces no tax line, which is exactly the wanted behaviour.
2. **Product catalogue → both prices**: set **tax behaviour to `inclusive`**.
   The page shows final prices, so the VAT must be split *out* of 7.90, not
   added to it. Stripe allows this only while the behaviour is still
   `unspecified` — once set, it is permanent and a change means new prices.
3. Set the head-office address and a product tax code (digital services /
   SaaS) under **Settings → Tax**.
4. Only now: `supabase secrets set STRIPE_AUTOMATIC_TAX=on`
5. Redeploy `create-checkout-session`.
6. Buy once from a Swiss address and once with a non-Swiss address: the first
   invoice shows the VAT split out, the second shows no tax line and the same
   total.

Stripe Tax charges a per-transaction fee. A manually created Tax Rate
(`txr_…`) is cheaper but country-blind, so it is only correct for a business
that sells exclusively into one country and never checks.

The price note on the site (`VAT_NOTE` in `src/services/pro-features.ts`) names
Switzerland explicitly rather than being hidden from foreign visitors. Swiss
price-disclosure rules want the all-in figure shown to consumers, and a
sentence that says *who* the VAT applies to stays true for every reader —
unlike geolocation, which is wrong for anyone travelling or on a VPN.
