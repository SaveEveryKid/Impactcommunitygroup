import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/misc";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about registering an organization, volunteering, sponsorship or safety? Send us a message.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader title="Contact us" lede="We read every message. For urgent safety issues involving immediate danger, call 911 first." />
      <Container className="grid gap-12 py-14 lg:grid-cols-[1fr_360px]">
        <div className="max-w-xl">
          <ContactForm />
        </div>
        <aside className="space-y-6 text-ink-soft">
          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Reporting a listing or person</h2>
            <p className="mt-2">Use the Report link on any organization, event, listing or message. It goes straight to our moderators with the context attached.</p>
          </section>
          <section>
            <h2 className="font-display text-lg font-semibold text-ink">Privacy requests</h2>
            <p className="mt-2">You can download or delete your data from Account settings. If you can&apos;t sign in, choose &quot;General question&quot; here.</p>
          </section>
        </aside>
      </Container>
    </>
  );
}
