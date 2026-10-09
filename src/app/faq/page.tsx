import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Frequently asked questions",
  description: "Answers about registering, verification, volunteering, the resource exchange, donations and privacy.",
  alternates: { canonical: "/faq" },
};

const FAQ: { group: string; items: [string, string][] }[] = [
  {
    group: "Getting started",
    items: [
      ["Does it cost anything?", "No. Accounts are free for individuals and for nonprofits, churches and community groups. Card processing fees apply to donations and paid tickets, and are shown at checkout."],
      ["Who can register an organization?", "Nonprofits, churches and faith-based groups, small businesses that want to donate or sponsor, and community groups. Someone authorized to act for the organization should register it."],
      ["How long does approval take?", "A person on our team reviews each organization, usually within a few business days. You can set up your profile and invite your team while you wait."],
    ],
  },
  {
    group: "Verification and trust",
    items: [
      ["What does \"verified\" mean?", "Our team reviewed the organization's information and confirmed it's a real, operating organization. It isn't an endorsement."],
      ["Are donations tax-deductible?", "Only organizations marked \"tax-exempt status checked\" have had their IRS status reviewed by our team. Even then, confirm with your tax advisor; the platform doesn't give tax advice."],
      ["How do you keep people safe?", "Private details like pickup addresses are revealed only to the people involved. Volunteers under 18 need guardian consent. Anything can be reported, and moderators review every report."],
    ],
  },
  {
    group: "Volunteering",
    items: [
      ["Can I volunteer if I'm under 18?", "Yes, for opportunities that welcome youth volunteers, with a parent or guardian's consent for each one."],
      ["How are my hours tracked?", "The organization records your attendance and a coordinator verifies your hours. Your verified history appears on your dashboard."],
      ["What if I can't make it?", "Cancel from your dashboard as early as you can. If there's a waitlist, the next person is automatically offered your spot."],
    ],
  },
  {
    group: "Resource exchange",
    items: [
      ["Can individuals request resources?", "Requests come from approved organizations, so resources reach groups equipped to distribute them. Individuals in need can find organizations in the directory."],
      ["What if an organization asks for more than we have left?", "You can approve part of a request. The platform reserves quantities as you approve them, so the same item can never be promised to two organizations."],
      ["Do you check food safety?", "No. Listing organizations provide handling and use-by information. Receiving organizations follow their own food-safety standards."],
    ],
  },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.flatMap((g) => g.items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHeader title="Questions and answers" />
      <Container className="grid gap-12 py-12 lg:grid-cols-2">
        {FAQ.map((g) => (
          <section key={g.group} aria-labelledby={g.group}>
            <h2 id={g.group} className="text-2xl font-semibold">
              {g.group}
            </h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {g.items.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {q}
                    <span aria-hidden="true" className="text-2xl leading-none text-ink-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </Container>
    </>
  );
}
