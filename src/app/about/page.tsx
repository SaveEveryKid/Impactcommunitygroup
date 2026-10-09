import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/misc";
import { PILLARS, PILLAR_META } from "@/lib/constants";
import { getSiteContent } from "@/lib/content";
import { brandName } from "@/lib/env";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${brandName} exists and how it works with nonprofits, churches, businesses and volunteers.`,
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const custom = await getSiteContent("about.story");
  return (
    <>
      <PageHeader title={custom?.title ?? "Helping is easier together"} lede="Connect the people who want to help with the organizations, resources and opportunities that make helping possible." />
      <Container className="grid gap-16 py-14 lg:grid-cols-[1fr_340px]">
        <div className="prose-body">
          {custom?.body ? (
            <div className="whitespace-pre-line">{custom.body}</div>
          ) : (
            <>
              <p>
                In most towns, the help already exists. A food pantry has more produce than it can move before Friday. A church has twenty people
                ready to serve on Saturday. A business has a storeroom of office chairs. Twelve blocks away, a shelter needs exactly those things and
                doesn&apos;t know they&apos;re there.
              </p>
              <p>
                {brandName} is the shared ground where those groups find each other. Organizations list what they have and what they need,
                recruit and schedule volunteers, run events, and coordinate handoffs, all in one place, with private details shared only with the
                people who need them.
              </p>
              <h2>What we believe</h2>
              <ul>
                <li>Well-being is whole-person: mind, body, relationships, faith and finances are connected.</li>
                <li>Trust is earned through verification. A person reviews every organization before it appears publicly.</li>
                <li>Impact should be checkable. We count only what was confirmed inside the platform, and say how we measured it.</li>
                <li>Privacy is part of safety. We collect only what we need, and never sell personal information.</li>
              </ul>
              <h2>Who runs this</h2>
              <p>
                The platform is operated by its founding organization. Contact details, governance and funding information will be published here
                as the organization finalizes its legal identity.
              </p>
            </>
          )}
        </div>
        <aside>
          <h2 className="font-display text-xl font-semibold">The five pillars</h2>
          <ul className="mt-4 space-y-4">
            {PILLARS.map((p) => {
              const m = PILLAR_META[p];
              return (
                <li key={p} className="border-l-4 pl-4" style={{ borderColor: m.color }}>
                  <p className="font-semibold">{m.label}</p>
                  <p className="text-[0.95rem] text-ink-soft">{m.blurb}</p>
                </li>
              );
            })}
          </ul>
          <LinkButton href="/how-it-works" variant="secondary" className="mt-8">
            See how it works
          </LinkButton>
        </aside>
      </Container>
    </>
  );
}
