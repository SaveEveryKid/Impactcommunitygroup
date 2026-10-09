import "server-only";
import Stripe from "stripe";

let client: Stripe | null | undefined;

/**
 * Returns a Stripe client, or null when payments are not configured.
 * Live-mode keys are refused unless STRIPE_ALLOW_LIVE=true, so a stray
 * production key can never move real money before the client approves it.
 */
export function getStripe(): Stripe | null {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return (client = null);
  if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    console.error("[stripe] Live key present but STRIPE_ALLOW_LIVE is not 'true'. Payments disabled.");
    return (client = null);
  }
  // Fetch-based HTTP client works on Cloudflare Workers and in Node.
  client = new Stripe(key, { appInfo: { name: "kindred-commons" }, maxNetworkRetries: 2, httpClient: Stripe.createFetchHttpClient() });
  return client;
}

export const isStripeConfigured = () => getStripe() !== null;

/** Web Crypto provider for async webhook signature verification (Workers-compatible). */
export const stripeCrypto = Stripe.createSubtleCryptoProvider();
