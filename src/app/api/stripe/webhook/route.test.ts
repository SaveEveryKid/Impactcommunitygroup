import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
const handle = vi.fn();
vi.mock("@/lib/payments", () => ({ handleStripeEvent: (e: unknown) => handle(e) }));

const SECRET = "whsec_test_secret";

function signed(payload: object) {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    handle.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });

  it("rejects requests without a valid signature", async () => {
    const { POST } = await import("./route");
    const bad = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=deadbeef" } });
    expect((await POST(bad)).status).toBe(400);
    const missing = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" });
    expect((await POST(missing)).status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
  });

  it("passes verified events to the handler", async () => {
    handle.mockResolvedValue("processed");
    const { POST } = await import("./route");
    const res = await POST(signed({ id: "evt_1", object: "event", type: "checkout.session.completed", data: { object: {} } }));
    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_1" }));
  });

  it("accepts events signed with the Connect endpoint secret", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect";
    handle.mockResolvedValue("processed");
    const { POST } = await import("./route");
    const body = JSON.stringify({ id: "evt_c", object: "event", type: "account.updated", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_connect" });
    const res = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } }));
    expect(res.status).toBe(200);
  });

  it("returns 500 so Stripe retries when processing fails", async () => {
    handle.mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const res = await POST(signed({ id: "evt_2", object: "event", type: "invoice.paid", data: { object: {} } }));
    expect(res.status).toBe(500);
  });

  it("refuses live keys unless explicitly allowed", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    delete process.env.STRIPE_ALLOW_LIVE;
    const { getStripe } = await import("@/lib/stripe");
    expect(getStripe()).toBeNull();
  });
});
