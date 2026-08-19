# Payment path — audit, 18 August 2026

A fresh read of the money path against the code as it stands today: the three
Stripe Edge Functions, the entitlement store, and the migrations that lock the
entitlement columns.

**This is not a recovery of the earlier findings.** Those lived only in a chat
transcript and are gone. Writing them from memory would mean publishing security
claims nobody can check, which is worse than publishing none — so this starts
over and every item below points at a line that exists now. If the original list
resurfaces, it belongs beside this one, not merged into it.

Scope: `supabase/functions/{create-checkout-session,create-portal-session,
stripe-webhook,get-plan-prices}`, `src/store/entitlement-store.ts`,
`src/services/supabase/billing.ts`, `supabase/migrations/*`.

Severity is by consequence, not by how hard the bug is to reach:
**blocking** = charges the wrong person or the wrong amount, or grants paid
access without payment. **should-fix** = degrades to a wrong state that a human
has to notice. **nit** = worth tidying.

---

## B0 · blocking · The Stripe customer id is written and never checked

`create-checkout-session/index.ts`

```ts
customerId = customer.id
await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
```

No `{ error }`, no `.select()`, no row count. `supabase-js` does not throw on a
write that fails or matches nothing, so a lost write here is completely silent
and the checkout carries on to take the money.

The third instance of this exact class in this codebase, and the one that
matters most, because it is the **root the other two grow from**. When it goes
wrong the customer still gets what they paid for — the webhook resolves them
through `subscription_data.metadata.supabase_user_id`, not through the customer
id, so the entitlement lands. What is lost is the link back:

| Consequence | Finding |
|---|---|
| The customer portal refuses them: "No subscription to manage" — **they cannot cancel a subscription that keeps billing** | B5 |
| A second "Go Pro" creates a second Stripe customer and sells a second subscription | B1 |
| `invoice.payment_failed` matches no row, so they are never downgraded | B2 |

**This is why B1's severity was understated below.** That section describes the
trigger as account deletion followed by a fresh signup — but **the app has no
account-deletion feature**, so that path needs an administrator acting directly
in Supabase. This one needs nobody: one failed write on the ordinary purchase
path, and the account is permanently in the broken state.

The probability per purchase is low — a `service_role` update on an existing row
by primary key. It is not zero (transient database error, or a signup whose
profile row has not committed yet), it is permanent once it happens, and it is
silent.

**Fix: check it, and refuse to sell if it did not land.**

```ts
const { data: saved, error: saveErr } = await admin
  .from('profiles')
  .update({ stripe_customer_id: customerId })
  .eq('id', user.id)
  .select('id')
if (saveErr || !saved?.length) throw new Error(`could not record customer ${customerId}`)
```

Failing before the Checkout Session is created is the whole point. The customer
sees an error and retries; nobody is charged for a subscription they would not
be able to cancel. Refusing a sale is cheap, an uncancellable subscription is
not.

Note this leaves an orphaned Stripe customer behind on failure. That is fine —
the retry finds it by email or creates another, and an unused customer object
costs nothing. Compare with the alternative, which costs a chargeback.

---

## B1 · blocking · A lost customer id skips the double-charge guard

`create-checkout-session/index.ts`

The refusal to sell a second subscription lives in the `else` branch:

```ts
let customerId = profile?.stripe_customer_id
if (!customerId) {
  const customer = await stripe.customers.create({ … })   // ← no check here
} else {
  const existing = await stripe.subscriptions.list({ customer: customerId, … })
  if (live) return json({ alreadySubscribed: true, … })
}
```

So the guard runs only when the profile already knows the customer. When
`stripe_customer_id` is null, a **new** Stripe customer is created and a second
subscription is sold — same person, same email, two customers, two charges.

The comment above the check anticipates the general problem and says the right
thing: it asks Stripe rather than the profile row "because a row that drifted
out of sync is precisely the case this needs to survive." Drifting to `null` is
the one variant it does not survive, because that drift also routes around the
check.

**How the id goes missing.** Two ways, and the first one is B0 — a failed write
on the ordinary purchase path, needing no unusual action from anyone.

The second is an account deleted and re-created: the fresh profile row gets
`stripe_customer_id := null` from `protect_entitlement_columns` (correctly — it
is what stops a client granting itself Pro) while Stripe still holds the old
customer. **The app has no account-deletion feature**, so this one requires an
administrator acting directly in Supabase. It is how this account reached that
state, but it is not a path a customer can walk.

So the ranking is: fix B0 and most of B1's reachability goes with it. What
remains after that is the administrative case, which is worth closing but does
not carry the same urgency — and closing it means the customer-adoption change
below, which has trade-offs of its own.

**Recommended fix, once B0 is done — adopt, do not refuse.** Before creating a
customer, look for one by email and reuse it:

```ts
const found = await stripe.customers.list({ email: user.email, limit: 100 })
```

Adopting the existing customer id into the new profile row fixes three things at
once: the billable-subscription check then runs, the webhook can find the
profile again, and the customer portal (B5) starts working. Refusing the sale
without adopting would leave someone billed, unentitled, and with no way to
cancel.

Email is a weak identity in Stripe — it can be changed, and two accounts can
share one. It is still the only link that survives a Supabase user being
replaced, and the failure mode of matching too eagerly (reusing a customer) is
far cheaper than the failure mode of not matching (double billing).

---

## B2 · blocking · The `past_due` downgrade never checks that it hit a row

`stripe-webhook/index.ts`, the `invoice.payment_failed` case:

```ts
const { error } = await admin
  .from('profiles')
  .update({ subscription_status: 'past_due' })
  .eq('stripe_customer_id', invoice.customer as string)
if (error) throw new Error(`past_due downgrade failed: …`)
```

`supabase-js` does not throw on a write that matches nothing — it returns
`{ data, error: null }`. A zero-row update is a success here, the handler
answers Stripe 200, and someone who has stopped paying keeps Pro.

The same file already knows this. `syncSubscriptionById` twenty lines above adds
`.select('id')` and a row-count check, with a comment spelling out exactly this
failure: *"a correct write that matched zero rows because the customer id was
never stored returned normally and the caller answered Stripe with 200."* The
lesson was applied in one place and not the other.

It matters most in the same situation as B0: once `stripe_customer_id` is null,
**no** row matches this customer — and the one event whose entire job is to
withdraw access silently does nothing.

**Fix:** `.select('id')`, then throw when the result is empty, the way
`syncSubscriptionById` does. Throwing releases the ledger claim and Stripe
retries, which is the correct behaviour for a downgrade that did not land.

Worth considering alongside: this hard-writes the string `past_due` rather than
re-reading the subscription's real status. The following
`customer.subscription.updated` normally corrects it, so on its own that is a
nit — but it means the two writers of this column disagree about where truth
comes from.

---

## B3 · should-fix · The VAT the Terms promise may not be on any invoice

`create-checkout-session/index.ts` · `src/pages/legal/terms-content.ts` ·
`src/services/pro-features.ts`

Three statements have to agree and one of them is not verifiable from the repo:

| Where | What it says |
|---|---|
| `pricing.vatNote`, on the paywall and the pricing card | "Final price, incl. 8.1% Swiss VAT for customers in Switzerland" |
| `terms-content.ts` | VAT "is contained in the price shown and is **stated separately on your invoice and payment receipt**" |
| `create-checkout-session` | sends `automatic_tax` **only if** `STRIPE_AUTOMATIC_TAX` is set |

Verified on 18 Aug 2026: `price_1U2zXhR3rB09i6YBNhjXs1oF` has
**`tax_behavior: inclusive`**, so the price side is correctly configured. What
cannot be read from the repo — or from the Supabase dashboard, which shows only
a digest of a secret's value — is whether `STRIPE_AUTOMATIC_TAX` is set at all.

If it is not, `automatic_tax` is absent from the session, Stripe computes no
tax, and the invoice carries no VAT line. The 10 August checkout session records
`total_details.amount_tax: 0`, which is what that looks like. (That purchase ran
on the older price, before the tax setup, so it does not settle the current
state either way.)

For a Swiss GmbH selling to Swiss consumers, an invoice that does not state VAT
separately while the Terms promise it does is a bookkeeping problem, not a
cosmetic one.

**The check is one glance and needs no secret revealed:** the Supabase Edge
Function secrets page lists secret *names* even though values are hashed. Is
`STRIPE_AUTOMATIC_TAX` in the list?

- **Present** → automatic tax is on; confirm on the next real invoice that a
  VAT line appears, and this item closes.
- **Absent** → either set it (Stripe Tax must be active and the Swiss
  registration entered first, or Stripe rejects every session and nobody can
  buy anything), or change the two sentences so they stop promising a VAT
  breakdown that is not produced.

Do not enable it blind. The failure mode of turning it on before the dashboard
is ready is a total outage of the purchase path.

---

## B4 · nit · A malformed request body sells the monthly plan

`create-checkout-session/index.ts`

```ts
const { plan } = await req.json().catch(() => ({ plan: 'monthly' }))
```

A request whose body fails to parse is treated as an order for the monthly plan
rather than rejected. Nobody is charged silently — Stripe still shows the amount
before payment — but a purchase path should not have a default. The allowlist
already returns 400 for an unknown plan; an unreadable body deserves the same.

---

## B5 · should-fix · A recreated account cannot cancel a subscription still billing it

`create-portal-session/index.ts`

```ts
if (!customerId) return json({ error: 'No subscription to manage' }, 400)
```

Correct as written, and wrong as an outcome in the B1 scenario. Someone who
deleted their account while subscribed has a live subscription in Stripe, a
profile row with `stripe_customer_id: null`, and therefore no route to the
portal: still billed, no Pro, and told they have "no subscription to manage".

B0's fix prevents this arising in the first place; B1's adoption fix repairs an
account already in it. Listed separately because it is the part a customer
experiences — and because it is the most damaging single consequence in this
document: someone paying who cannot stop paying.

---

## What was checked and found sound

Recorded so a future reader knows the difference between "not examined" and
"examined and fine".

- **Entitlement writes are locked to the webhook.** `protect_entitlement_columns`
  reverts any non-`service_role` write to the entitlement columns and forces
  them to their defaults on insert. Deployed and verified against the running
  database on 1 Aug 2026.
- **Idempotency is claim-then-commit.** The `stripe_events` row is deleted again
  if the handler throws, so Stripe's retry can do the work instead of being
  swallowed as a duplicate — and the one unrecoverable case logs loudly enough
  to be found.
- **The client never names a price or an amount.** Price ids are server-side in
  both the checkout and the price-display function.
- **Statuses are derived, never stored.** `selectIsPro` computes access from
  status plus period end, and `selectHasSubscription` is deliberately separate
  so an offline unlock is never read as proof of payment.
- **Events from the other Stripe mode are rejected** (added 18 Aug 2026), after
  the ledger showed sandbox events had written real entitlements in July.
- **Displayed prices come from Stripe**, so the amount shown and the amount
  billed cannot drift (added 18 Aug 2026).
- **CORS echoes only allowlisted origins** rather than reflecting any caller.
- **`create-checkout-session` refuses a second subscription** — except along the
  path in B1.

## Not covered

- `supabase/functions/` has **no test setup at all**. All four functions are
  untested, including every guard above. This is the largest single gap in the
  payment path and it is structural, not an oversight in any one file.
- No load or race testing of concurrent webhook deliveries beyond the ledger's
  unique-key behaviour.
- Stripe dashboard configuration (Tax registrations, portal settings, webhook
  event selection) is only checkable in the dashboard; this audit reads the
  repo plus the two facts verified in Stripe and named inline.
