#!/usr/bin/env node
/**
 * Ensures a Stripe webhook endpoint exists for this deployment, listening to
 * the events the app handles (platform + Connect). Idempotent.
 *
 * If it creates a NEW endpoint, it prints the signing secret to the file given
 * by --secret-out so the deploy workflow can store it as a Cloudflare secret.
 * (Stripe only reveals a signing secret at creation time.)
 *
 * Env: STRIPE_SECRET_KEY, NEXT_PUBLIC_SITE_URL
 */
import { writeFileSync } from "node:fs";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (!key || !site) {
  console.log("STRIPE_SECRET_KEY or NEXT_PUBLIC_SITE_URL not set; skipping Stripe webhook setup.");
  process.exit(0);
}
if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
  console.error("Refusing to configure a LIVE Stripe webhook while STRIPE_ALLOW_LIVE is not 'true'.");
  process.exit(1);
}
const outIdx = process.argv.indexOf("--secret-out");
const secretOut = outIdx > -1 ? process.argv[outIdx + 1] : null;

const stripe = new Stripe(key);
const url = `${site}/api/stripe/webhook`;
// Destination charges and subscriptions live on the platform account; only
// account.updated comes from connected accounts. Stripe needs one endpoint per
// scope, each with its own signing secret.
const ENDPOINTS = [
  {
    connect: false,
    secretName: "STRIPE_WEBHOOK_SECRET",
    events: [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
      "invoice.paid",
      "charge.refunded",
      "customer.subscription.deleted",
    ],
  },
  { connect: true, secretName: "STRIPE_CONNECT_WEBHOOK_SECRET", events: ["account.updated"] },
];

const existing = [];
for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) existing.push(ep);
const newSecrets = {};

for (const spec of ENDPOINTS) {
  const isConnect = (e) => Boolean(e.description?.includes("[connect]"));
  const match = existing.find((e) => e.url === url && isConnect(e) === spec.connect);
  if (match) {
    const missing = spec.events.filter((e) => !match.enabled_events.includes(e));
    if (missing.length || match.status !== "enabled") {
      await stripe.webhookEndpoints.update(match.id, { enabled_events: spec.events, disabled: false });
      console.log(`Updated ${spec.connect ? "Connect" : "platform"} webhook ${match.id}.`);
    } else {
      console.log(`${spec.connect ? "Connect" : "Platform"} webhook already configured: ${match.id}`);
    }
    continue;
  }
  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: spec.events,
    connect: spec.connect,
    description: `Kindred Commons app ${spec.connect ? "[connect]" : "[platform]"} (managed by deploy workflow)`,
  });
  console.log(`Created ${spec.connect ? "Connect" : "platform"} webhook ${created.id}`);
  if (created.secret) newSecrets[spec.secretName] = created.secret;
}

if (secretOut) {
  writeFileSync(secretOut, JSON.stringify(newSecrets), { mode: 0o600 });
  console.log(`New signing secrets: ${Object.keys(newSecrets).join(", ") || "none"}`);
}
