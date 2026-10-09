import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Accessibility", alternates: { canonical: "/accessibility" } };

export default function AccessibilityPage() {
  return (
    <>
      <PageHeader title="Accessibility" lede="Everyone should be able to find help and offer it. We design to WCAG 2.2 AA." />
      <Container className="py-12">
        <div className="prose-body">
          <h2>What we&apos;ve done</h2>
          <ul>
            <li>Body text uses Atkinson Hyperlegible, a typeface designed for readers with low vision.</li>
            <li>Every page works with a keyboard, with a visible focus outline and a skip-to-content link.</li>
            <li>Colors meet AA contrast. Meaning is never carried by color alone; status always has a text label.</li>
            <li>Forms have visible labels, clear error messages tied to each field, and don&apos;t time out.</li>
            <li>Animations are minimal and turn off when your device asks for reduced motion.</li>
            <li>Pages reflow on small screens without horizontal scrolling and support text zoom up to 200%.</li>
            <li>Automated accessibility checks (axe) run against key pages in our test suite.</li>
          </ul>
          <h2>Known limitations</h2>
          <ul>
            <li>Photos uploaded by organizations may lack detailed descriptions. We prompt organizations to add them.</li>
            <li>Stripe&apos;s hosted checkout is outside our control, though Stripe publishes its own accessibility commitments.</li>
          </ul>
          <h2>Tell us about a barrier</h2>
          <p>
            If something doesn&apos;t work for you, <Link href="/contact">contact us</Link>. Tell us the page and what happened, and we&apos;ll work on a fix and
            help you get what you need in the meantime.
          </p>
        </div>
      </Container>
    </>
  );
}
