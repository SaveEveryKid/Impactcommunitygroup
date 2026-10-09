import type Stripe from "stripe";
import { getStripe, stripeCrypto } from "@/lib/stripe";
import { handleStripeEvent } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Signature is verified against the RAW body before anything
 * else happens; unverified requests are rejected with 400.
 * Configure the endpoint in Stripe for both platform and Connect events.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  // Platform and Connect endpoints have separate signing secrets.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  if (!stripe || !secrets.length) return new Response("Payments not configured", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, secret, undefined, stripeCrypto);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) return new Response("Invalid signature", { status: 400 });
  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("[stripe webhook] processing failed", event.id, event.type, e);
    // 500 tells Stripe to retry; handlers are idempotent.
    return new Response("Processing error", { status: 500 });
  }
}
