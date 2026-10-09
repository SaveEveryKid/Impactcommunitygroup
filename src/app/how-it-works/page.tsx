import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { Container, PageHeader } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "How it works",
  description: "How organizations, volunteers and donors use the network to share resources, run events and record verified impact.",
  alternates: { canonical: "/how-it-works" },
};

const FLOWS = [
  {
    id: "organizations",
    title: "For organizations",
    steps: [
      ["Register and get reviewed", "Create your profile and submit verification details. A person on our team reviews every organization, usually within a few business days."],
      ["Invite your team", "Add staff as owners, administrators, coordinators or members. Each role sees and does only what it should."],
      ["Share and request resources", "List surplus or post a need. Approve requests in full or in part; reserved quantities can't be promised twice."],
      ["Recruit volunteers and run events", "Publish opportunities with shifts and capacity, manage waitlists, check people in, and verify hours."],
      ["Report impact", "Completed transfers, verified hours and checked-in attendance roll up into reports you can export for funders."],
    ],
  },
  {
    id: "volunteers",
    title: "For volunteers",
    steps: [
      ["Create a free account", "Tell us your interests, general availability and the areas you can reach. Only you control what's shared."],
      ["Find something that fits", "Filter by cause, well-being area, date and distance. Sign up in a tap; some roles need the organizer's approval."],
      ["Show up and serve", "Get reminders before each commitment. Cancel any time if plans change, and the next person on the waitlist moves up."],
      ["Keep a verified record", "Organizations confirm your attendance and hours, so your service history is accurate for school, work or yourself."],
    ],
  },
  {
    id: "donors",
    title: "For businesses and donors",
    steps: [
      ["Give goods or services", "Register your business to list donations on the resource exchange, from inventory to professional time."],
      ["Give money securely", "Donate to platform campaigns or directly to verified organizations through Stripe-hosted checkout. We never see your card number."],
      ["See where it went", "Campaign progress and organization impact are based on confirmed activity, never estimates presented as fact."],
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader title="How it works" lede="The same network serves three groups of people. Here's what each of them does.">
        <nav aria-label="Jump to section" className="mt-6 flex flex-wrap gap-2">
          {FLOWS.map((f) => (
            <a key={f.id} href={`#${f.id}`} className="rounded-full border border-line-strong bg-surface px-4 py-2 font-semibold hover:border-ink">
              {f.title}
            </a>
          ))}
        </nav>
      </PageHeader>
      <Container className="space-y-20 py-14">
        {FLOWS.map((f) => (
          <section key={f.id} id={f.id} aria-labelledby={`${f.id}-h`} className="grid gap-8 lg:grid-cols-[300px_1fr]">
            <h2 id={`${f.id}-h`} className="text-3xl font-semibold">
              {f.title}
            </h2>
            <ol className="space-y-6">
              {f.steps.map(([t, b], i) => (
                <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-ink font-display font-bold text-white">{i + 1}</span>
                  <div>
                    <h3 className="text-xl font-semibold">{t}</h3>
                    <p className="mt-1 text-ink-soft">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/signup" size="lg">
            Create a free account
          </LinkButton>
          <LinkButton href="/faq" size="lg" variant="secondary">
            Read common questions
          </LinkButton>
        </div>
      </Container>
    </>
  );
}
