import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getServiceClient } from "@/lib/supabase/admin";
import { brandName, siteUrl } from "@/lib/env";
import { formatCurrency } from "@/lib/utils";

/**
 * All money movement is created and confirmed on the server.
 * - Organization donations and tickets use Stripe Connect destination charges,
 *   so funds settle to the organization's own connected account.
 * - Platform campaigns (org_id = null) settle to the platform account.
 * - Payment state is only ever changed by the verified webhook handler.
 */

export async function platformFeeBps(): Promise<number> {
  const { data } = await getServiceClient().from("platform_settings").select("value").eq("key", "payments.platform_fee_bps").maybeSingle();
  const n = Number(data?.value ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : 0;
}

async function liveAllowed(): Promise<boolean> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_live_")) return true;
  const { data } = await getServiceClient().from("platform_settings").select("value").eq("key", "payments.live_enabled").maybeSingle();
  return data?.value === true;
}

export class PaymentError extends Error {}

async function requireStripe(): Promise<Stripe> {
  const stripe = getStripe();
  if (!stripe) throw new PaymentError("Payments aren't set up on this site yet.");
  if (!(await liveAllowed())) throw new PaymentError("Live payments haven't been enabled by the platform administrator yet.");
  return stripe;
}

// ---------------------------------------------------------------- Connect
export async function connectOnboardingLink(orgId: string, email: string | null): Promise<string> {
  const stripe = await requireStripe();
  const sb = getServiceClient();
  const { data: existing } = await sb.from("org_payment_accounts").select("stripe_account_id").eq("org_id", orgId).maybeSingle();
  let accountId = existing?.stripe_account_id;
  if (!accountId) {
    const { data: org } = await sb.from("organizations").select("name, website_url, org_type").eq("id", orgId).single();
    const account = await stripe.accounts.create(
      {
        type: "express",
        email: email ?? undefined,
        business_profile: { name: org?.name ?? undefined, url: org?.website_url ?? undefined },
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { org_id: orgId },
      },
      { idempotencyKey: `connect-create-${orgId}` },
    );
    accountId = account.id;
    const { error } = await sb.from("org_payment_accounts").insert({ org_id: orgId, stripe_account_id: accountId, livemode: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") });
    if (error) throw new PaymentError("Could not save the payment account. Try again.");
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${siteUrl}/api/stripe/connect?org=${orgId}`,
    return_url: `${siteUrl}/api/stripe/connect/return?org=${orgId}`,
  });
  return link.url;
}

export async function syncConnectAccount(account: Stripe.Account) {
  const sb = getServiceClient();
  await sb
    .from("org_payment_accounts")
    .update({
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      requirements_due: account.requirements?.currently_due ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id);
}

export async function refreshConnectAccount(orgId: string) {
  const stripe = await requireStripe();
  const { data } = await getServiceClient().from("org_payment_accounts").select("stripe_account_id").eq("org_id", orgId).maybeSingle();
  if (!data) return;
  await syncConnectAccount(await stripe.accounts.retrieve(data.stripe_account_id));
}

export async function connectDashboardLink(orgId: string): Promise<string> {
  const stripe = await requireStripe();
  const { data } = await getServiceClient().from("org_payment_accounts").select("stripe_account_id").eq("org_id", orgId).maybeSingle();
  if (!data) throw new PaymentError("No payment account connected.");
  return (await stripe.accounts.createLoginLink(data.stripe_account_id)).url;
}

// ---------------------------------------------------------------- Donations
export type DonationInput = {
  campaignId: string | null;
  orgId: string | null;
  amountCents: number;
  recurring: boolean;
  interval: "month" | "year";
  donorUserId: string | null;
  donorName: string | null;
  donorEmail: string;
  visibility: "public" | "organization_only" | "anonymous";
  message: string | null;
};

export async function createDonationCheckout(input: DonationInput): Promise<string> {
  const stripe = await requireStripe();
  const sb = getServiceClient();
  if (input.amountCents < 100 || input.amountCents > 5_000_000) throw new PaymentError("Donations must be between $1 and $50,000.");

  let destination: string | null = null;
  let recipientName = brandName;
  let campaignTitle: string | null = null;
  let orgId = input.orgId;

  if (input.campaignId) {
    const { data: c } = await sb.from("fundraising_campaigns").select("id, org_id, title, status, allow_recurring, ends_at").eq("id", input.campaignId).maybeSingle();
    if (!c || c.status !== "active" || (c.ends_at && new Date(c.ends_at) < new Date())) throw new PaymentError("This campaign isn't accepting donations.");
    if (input.recurring && !c.allow_recurring) throw new PaymentError("This campaign accepts one-time gifts only.");
    orgId = c.org_id;
    campaignTitle = c.title;
  }
  if (orgId) {
    const [{ data: ok }, { data: acct }, { data: org }] = await Promise.all([
      sb.rpc("org_can_fundraise", { p_org: orgId }),
      sb.from("org_payment_accounts").select("stripe_account_id").eq("org_id", orgId).maybeSingle(),
      sb.from("organizations").select("name").eq("id", orgId).single(),
    ]);
    if (!ok || !acct) throw new PaymentError("This organization can't accept donations yet.");
    destination = acct.stripe_account_id;
    recipientName = org?.name ?? recipientName;
  }

  const feeBps = destination ? await platformFeeBps() : 0;
  const fee = Math.floor((input.amountCents * feeBps) / 10_000);
  const productName = campaignTitle ? `Donation: ${campaignTitle}` : `Donation to ${recipientName}`;

  const { data: donation, error } = await sb
    .from("donations")
    .insert({
      campaign_id: input.campaignId,
      org_id: orgId,
      donor_user_id: input.donorUserId,
      donor_name: input.donorName,
      donor_email: input.donorEmail,
      donor_visibility: input.visibility,
      amount_cents: input.amountCents,
      is_recurring: input.recurring,
      recurring_interval: input.recurring ? input.interval : null,
      message: input.message,
      stripe_account_id: destination,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !donation) throw new PaymentError("Could not start the donation. Try again.");

  const metadata = { kind: "donation", donation_id: donation.id, org_id: orgId ?? "", campaign_id: input.campaignId ?? "" };
  const common: Stripe.Checkout.SessionCreateParams = {
    customer_email: input.donorEmail,
    success_url: `${siteUrl}/give/thanks?d=${donation.id}`,
    cancel_url: input.campaignId ? `${siteUrl}/campaigns/${input.campaignId}?cancelled=1` : `${siteUrl}/support`,
    metadata,
    client_reference_id: donation.id,
  };

  const session = input.recurring
    ? await stripe.checkout.sessions.create(
        {
          ...common,
          mode: "subscription",
          line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, recurring: { interval: input.interval }, product_data: { name: productName } } }],
          subscription_data: {
            metadata,
            ...(destination ? { transfer_data: { destination }, application_fee_percent: feeBps ? feeBps / 100 : undefined } : {}),
          },
        },
        { idempotencyKey: `donation-${donation.id}` },
      )
    : await stripe.checkout.sessions.create(
        {
          ...common,
          mode: "payment",
          submit_type: "donate",
          line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: input.amountCents, product_data: { name: productName } } }],
          payment_intent_data: {
            metadata,
            ...(destination ? { transfer_data: { destination }, application_fee_amount: fee || undefined } : {}),
          },
        },
        { idempotencyKey: `donation-${donation.id}` },
      );

  await sb.from("donations").update({ stripe_checkout_session_id: session.id, livemode: session.livemode }).eq("id", donation.id);
  if (!session.url) throw new PaymentError("Stripe didn't return a checkout page.");
  return session.url;
}

// ---------------------------------------------------------------- Tickets
export async function createEventCheckout(registrationId: string, userId: string, email: string): Promise<string> {
  const stripe = await requireStripe();
  const sb = getServiceClient();
  const { data: reg } = await sb
    .from("event_registrations")
    .select("id, user_id, status, amount_cents, hold_expires_at, events(id, title, org_id, starts_at, currency)")
    .eq("id", registrationId)
    .maybeSingle();
  type R = { id: string; user_id: string; status: string; amount_cents: number; hold_expires_at: string | null; events: { id: string; title: string; org_id: string; starts_at: string; currency: string } };
  const r = reg as unknown as R | null;
  if (!r || r.user_id !== userId) throw new PaymentError("Registration not found.");
  if (r.status !== "pending_payment") throw new PaymentError("This registration doesn't need payment.");
  if (!r.hold_expires_at || new Date(r.hold_expires_at) < new Date()) throw new PaymentError("Your seat hold expired. Register again to check availability.");
  const { data: acct } = await sb.from("org_payment_accounts").select("stripe_account_id, charges_enabled").eq("org_id", r.events.org_id).maybeSingle();
  if (!acct?.charges_enabled) throw new PaymentError("The organizer can't accept payments right now.");
  const fee = Math.floor((r.amount_cents * (await platformFeeBps())) / 10_000);
  // Stripe requires expires_at at least 30 minutes ahead.
  const expires = Math.max(Math.floor(new Date(r.hold_expires_at).getTime() / 1000), Math.floor(Date.now() / 1000) + 31 * 60);
  const metadata = { kind: "event_ticket", registration_id: r.id, event_id: r.events.id, org_id: r.events.org_id };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer_email: email,
      client_reference_id: r.id,
      expires_at: expires,
      line_items: [{ quantity: 1, price_data: { currency: r.events.currency, unit_amount: r.amount_cents, product_data: { name: `Ticket: ${r.events.title}` } } }],
      payment_intent_data: { metadata, transfer_data: { destination: acct.stripe_account_id }, application_fee_amount: fee || undefined },
      metadata,
      success_url: `${siteUrl}/events/${r.events.id}?paid=1`,
      cancel_url: `${siteUrl}/events/${r.events.id}?payment=cancelled`,
    },
    { idempotencyKey: `ticket-${r.id}-${r.hold_expires_at}` },
  );
  await sb.from("event_registrations").update({ stripe_checkout_session_id: session.id }).eq("id", r.id);
  if (!session.url) throw new PaymentError("Stripe didn't return a checkout page.");
  return session.url;
}

export async function refundCancelledEventRegistrations(eventId: string): Promise<{ message: string }> {
  const sb = getServiceClient();
  const { data: paid } = await sb
    .from("payment_records")
    .select("id, stripe_object_id, amount_cents, event_registration_id, event_registrations!inner(event_id)")
    .eq("kind", "event_ticket")
    .eq("event_registrations.event_id", eventId);
  const rows = (paid ?? []) as unknown as { stripe_object_id: string; amount_cents: number; event_registration_id: string }[];
  if (!rows.length) {
    await sb.from("event_registrations").update({ status: "cancelled" }).eq("event_id", eventId).eq("status", "confirmed");
    return { message: "Event cancelled and attendees notified." };
  }
  const stripe = getStripe();
  if (!stripe) return { message: "Event cancelled. Paid tickets need refunds, but payments aren't configured. Contact the platform administrator." };
  let ok = 0;
  let failed = 0;
  for (const p of rows) {
    try {
      await stripe.refunds.create({ payment_intent: p.stripe_object_id, reverse_transfer: true, refund_application_fee: true, metadata: { reason: "event_cancelled", event_id: eventId } }, { idempotencyKey: `refund-evt-${p.stripe_object_id}` });
      await sb.from("event_registrations").update({ status: "refunded" }).eq("id", p.event_registration_id);
      ok++;
    } catch (e) {
      failed++;
      console.error("[payments] refund failed", p.stripe_object_id, e);
    }
  }
  await sb.from("event_registrations").update({ status: "cancelled" }).eq("event_id", eventId).eq("status", "confirmed");
  return {
    message: failed
      ? `Event cancelled. ${ok} ticket refund${ok === 1 ? "" : "s"} issued; ${failed} failed and need attention in the admin console.`
      : `Event cancelled. ${ok} paid ticket${ok === 1 ? " was" : "s were"} refunded in full.`,
  };
}

// ---------------------------------------------------------------- Webhooks
export async function handleStripeEvent(event: Stripe.Event): Promise<"processed" | "duplicate" | "ignored"> {
  const sb = getServiceClient();
  const { error: insertErr } = await sb.from("stripe_events").insert({ id: event.id, type: event.type, livemode: event.livemode, payload: event as unknown as Record<string, unknown> });
  if (insertErr) {
    if (insertErr.code !== "23505") throw new Error(`stripe_events insert failed: ${insertErr.message}`);
    const { data: prior } = await sb.from("stripe_events").select("processed_at").eq("id", event.id).single();
    if (prior?.processed_at) return "duplicate";
    // previous attempt failed midway: fall through and retry (all handlers are idempotent)
  }
  try {
    const handled = await dispatch(event);
    await sb.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return handled ? "processed" : "ignored";
  } catch (e) {
    await sb.from("stripe_events").update({ error: e instanceof Error ? e.message : String(e) }).eq("id", event.id);
    throw e;
  }
}

async function dispatch(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutPaid(event, event.data.object as Stripe.Checkout.Session);
    case "checkout.session.expired":
      return onCheckoutExpired(event.data.object as Stripe.Checkout.Session);
    case "checkout.session.async_payment_failed":
      return onCheckoutFailed(event.data.object as Stripe.Checkout.Session);
    case "invoice.paid":
      return onInvoicePaid(event, event.data.object as Stripe.Invoice);
    case "charge.refunded":
      return onChargeRefunded(event.data.object as Stripe.Charge);
    case "customer.subscription.deleted":
      return true; // future invoices simply stop; nothing to reconcile
    case "account.updated":
      await syncConnectAccount(event.data.object as Stripe.Account);
      return true;
    default:
      return false;
  }
}

function piId(x: string | Stripe.PaymentIntent | null | undefined) {
  return typeof x === "string" ? x : (x?.id ?? null);
}

async function onCheckoutPaid(event: Stripe.Event, s: Stripe.Checkout.Session): Promise<boolean> {
  const sb = getServiceClient();
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return true; // async methods confirm later
  const kind = s.metadata?.kind;
  if (kind === "event_ticket") {
    const regId = s.metadata!.registration_id;
    const amount = s.amount_total ?? 0;
    const { data: result, error } = await sb.rpc("finalize_event_payment", { p_reg: regId, p_session: s.id, p_amount: amount });
    if (error) throw new Error(error.message);
    const pi = piId(s.payment_intent);
    if (pi) {
      await sb.from("payment_records").upsert(
        { kind: "event_ticket", event_registration_id: regId, org_id: s.metadata!.org_id || null, amount_cents: amount, currency: s.currency ?? "usd", stripe_object_id: pi, stripe_event_id: event.id, livemode: s.livemode },
        { onConflict: "kind,stripe_object_id", ignoreDuplicates: true },
      );
    }
    if (result === "refund_required" && pi) {
      const stripe = getStripe()!;
      await stripe.refunds.create({ payment_intent: pi, reverse_transfer: true, refund_application_fee: true, metadata: { reason: "no_seat" } }, { idempotencyKey: `refund-noseat-${pi}` });
      await sb.from("event_registrations").update({ status: "refunded" }).eq("id", regId);
      const { data: reg } = await sb.from("event_registrations").select("user_id, event_id").eq("id", regId).single();
      if (reg) await sb.rpc("server_notify", { p_user: reg.user_id, p_type: "event_update", p_title: "Your ticket was refunded", p_body: "Your payment arrived after the event filled, so we refunded it in full.", p_link: `/events/${reg.event_id}`, p_dedupe: `noseat:${regId}` });
    }
    return true;
  }
  if (kind === "donation") {
    const donationId = s.metadata!.donation_id;
    if (s.mode === "subscription") {
      // The first payment arrives as invoice.paid; store the subscription id now.
      const sub = typeof s.subscription === "string" ? s.subscription : s.subscription?.id;
      await sb.from("donations").update({ stripe_subscription_id: sub }).eq("id", donationId);
      return true;
    }
    const pi = piId(s.payment_intent);
    const { data: updated } = await sb
      .from("donations")
      .update({ status: "succeeded", stripe_payment_intent_id: pi, succeeded_at: new Date().toISOString(), amount_cents: s.amount_total ?? undefined, donor_name: s.customer_details?.name ?? undefined })
      .eq("id", donationId)
      .eq("status", "pending")
      .select("id, org_id, amount_cents, donor_user_id, campaign_id")
      .maybeSingle();
    if (updated) await afterDonationSucceeded(updated, event.id, pi, s.livemode);
    return true;
  }
  return false;
}

async function afterDonationSucceeded(d: { id: string; org_id: string | null; amount_cents: number; donor_user_id: string | null }, eventId: string, objectId: string | null, livemode: boolean) {
  const sb = getServiceClient();
  const { data: receipt } = await sb.rpc("assign_receipt_number", { p_donation: d.id });
  if (objectId) {
    await sb.from("payment_records").upsert(
      { kind: "donation", donation_id: d.id, org_id: d.org_id, amount_cents: d.amount_cents, stripe_object_id: objectId, stripe_event_id: eventId, livemode },
      { onConflict: "kind,stripe_object_id", ignoreDuplicates: true },
    );
  }
  if (d.donor_user_id) {
    await sb.rpc("server_notify", {
      p_user: d.donor_user_id,
      p_type: "donation_receipt",
      p_title: `Thank you for your ${formatCurrency(d.amount_cents)} gift`,
      p_body: `Receipt ${receipt}. View it any time from your dashboard.`,
      p_link: `/give/receipt/${d.id}`,
      p_dedupe: `receipt:${d.id}`,
    });
  }
}

async function onCheckoutExpired(s: Stripe.Checkout.Session): Promise<boolean> {
  const sb = getServiceClient();
  if (s.metadata?.kind === "event_ticket") {
    await sb.rpc("release_event_hold", { p_reg: s.metadata.registration_id });
    return true;
  }
  if (s.metadata?.kind === "donation") {
    await sb.from("donations").update({ status: "canceled" }).eq("id", s.metadata.donation_id).eq("status", "pending");
    return true;
  }
  return false;
}

async function onCheckoutFailed(s: Stripe.Checkout.Session): Promise<boolean> {
  const sb = getServiceClient();
  if (s.metadata?.kind === "donation") {
    await sb.from("donations").update({ status: "failed" }).eq("id", s.metadata.donation_id).eq("status", "pending");
    return true;
  }
  if (s.metadata?.kind === "event_ticket") {
    await sb.rpc("release_event_hold", { p_reg: s.metadata.registration_id });
    return true;
  }
  return false;
}

async function onInvoicePaid(event: Stripe.Event, inv: Stripe.Invoice): Promise<boolean> {
  const sb = getServiceClient();
  const parent = (inv as unknown as { parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } }).parent;
  const legacy = inv as unknown as { subscription?: string | { id: string }; subscription_details?: { metadata?: Record<string, string> } };
  const subId = parent?.subscription_details?.subscription ?? (typeof legacy.subscription === "string" ? legacy.subscription : legacy.subscription?.id);
  const meta = parent?.subscription_details?.metadata ?? legacy.subscription_details?.metadata ?? {};
  if (!subId || meta.kind !== "donation") return false;
  const { data: original } = await sb.from("donations").select("*").eq("id", meta.donation_id).maybeSingle();
  if (!original) return false;

  if (original.status === "pending") {
    // First invoice completes the original donation row.
    const { data: updated } = await sb
      .from("donations")
      .update({ status: "succeeded", stripe_invoice_id: inv.id, stripe_subscription_id: subId, succeeded_at: new Date().toISOString(), amount_cents: inv.amount_paid })
      .eq("id", original.id)
      .eq("status", "pending")
      .select("id, org_id, amount_cents, donor_user_id")
      .maybeSingle();
    if (updated) await afterDonationSucceeded(updated, event.id, inv.id, inv.livemode);
    return true;
  }
  // Renewals: one new donation row per invoice (unique on stripe_invoice_id).
  const { data: renewal, error } = await sb
    .from("donations")
    .insert({
      campaign_id: original.campaign_id,
      org_id: original.org_id,
      donor_user_id: original.donor_user_id,
      donor_name: original.donor_name,
      donor_email: original.donor_email,
      donor_visibility: original.donor_visibility,
      amount_cents: inv.amount_paid,
      is_recurring: true,
      recurring_interval: original.recurring_interval,
      stripe_invoice_id: inv.id,
      stripe_subscription_id: subId,
      stripe_account_id: original.stripe_account_id,
      status: "succeeded",
      succeeded_at: new Date().toISOString(),
      livemode: inv.livemode,
    })
    .select("id, org_id, amount_cents, donor_user_id")
    .single();
  if (error?.code === "23505") return true; // already recorded
  if (error) throw new Error(error.message);
  await afterDonationSucceeded(renewal, event.id, inv.id, inv.livemode);
  return true;
}

async function onChargeRefunded(charge: Stripe.Charge): Promise<boolean> {
  const sb = getServiceClient();
  const pi = piId(charge.payment_intent);
  if (!pi) return false;
  const refunded = charge.amount_refunded;
  const { data: d } = await sb.from("donations").select("id, org_id, amount_cents").eq("stripe_payment_intent_id", pi).maybeSingle();
  if (d) {
    await sb
      .from("donations")
      .update({ refunded_cents: refunded, status: refunded >= d.amount_cents ? "refunded" : "partially_refunded" })
      .eq("id", d.id);
    await sb.from("payment_records").upsert(
      { kind: "refund", donation_id: d.id, org_id: d.org_id, amount_cents: -refunded, stripe_object_id: `${charge.id}:${refunded}`, livemode: charge.livemode },
      { onConflict: "kind,stripe_object_id", ignoreDuplicates: true },
    );
    return true;
  }
  const { data: ticket } = await sb.from("payment_records").select("event_registration_id, org_id").eq("kind", "event_ticket").eq("stripe_object_id", pi).maybeSingle();
  if (ticket) {
    await sb.from("payment_records").upsert(
      { kind: "refund", event_registration_id: ticket.event_registration_id, org_id: ticket.org_id, amount_cents: -refunded, stripe_object_id: `${charge.id}:${refunded}`, livemode: charge.livemode },
      { onConflict: "kind,stripe_object_id", ignoreDuplicates: true },
    );
    if (charge.refunded) await sb.from("event_registrations").update({ status: "refunded" }).eq("id", ticket.event_registration_id).neq("status", "refunded");
    return true;
  }
  return false;
}
