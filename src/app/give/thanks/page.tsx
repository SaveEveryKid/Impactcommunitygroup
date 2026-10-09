import type { Metadata } from "next";
import { HeartHandshake } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Container } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Thank you", robots: { index: false } };

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  return (
    <Container className="max-w-xl py-20">
      <HeartHandshake className="h-12 w-12 text-teal" aria-hidden="true" />
      <h1 className="mt-6 text-4xl font-bold">Thank you</h1>
      <p className="mt-4 text-lg text-ink-soft">Your payment is being confirmed by our payment processor. Stripe will email a payment receipt, and your donation receipt will be ready in a minute or two.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {d && /^[0-9a-f-]{36}$/i.test(d) ? <LinkButton href={`/give/receipt/${d}`}>View receipt</LinkButton> : null}
        <LinkButton href="/support" variant="secondary">See other campaigns</LinkButton>
      </div>
    </Container>
  );
}
