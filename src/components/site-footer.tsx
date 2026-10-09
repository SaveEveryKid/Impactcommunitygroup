import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { Container } from "@/components/ui/misc";
import { brandName } from "@/lib/env";

const groups = [
  {
    title: "Find",
    links: [
      ["/organizations", "Organizations"],
      ["/volunteer", "Volunteer opportunities"],
      ["/events", "Community events"],
      ["/resources", "Resource exchange"],
      ["/feed", "Community feed"],
      ["/search", "Search everything"],
    ],
  },
  {
    title: "About",
    links: [
      ["/about", "Our mission"],
      ["/how-it-works", "How it works"],
      ["/impact", "Our impact"],
      ["/partners", "Partners and sponsors"],
      ["/faq", "Questions"],
    ],
  },
  {
    title: "Take part",
    links: [
      ["/signup?type=organization", "Register an organization"],
      ["/signup", "Become a volunteer"],
      ["/support", "Support the mission"],
      ["/contact", "Contact us"],
    ],
  },
  {
    title: "Policies",
    links: [
      ["/privacy", "Privacy policy"],
      ["/terms", "Terms of service"],
      ["/guidelines", "Community guidelines"],
      ["/accessibility", "Accessibility"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-ink text-white/85" style={{ paddingBottom: "var(--safe-bottom)" }}>
      <Container className="grid grid-cols-2 gap-x-6 gap-y-10 py-16 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <BrandLink inverse />
          <p className="mt-4 text-[0.95rem] text-white/70">
            Connecting the people who want to help with the organizations, resources and opportunities that make helping possible.
          </p>
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="font-display text-base font-semibold text-white">{g.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {g.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-[0.95rem] text-white/70 hover:text-white hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-sm text-white/55 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {brandName}. Working name, subject to change.
          </p>
          <p>Organizations are reviewed by people, not algorithms.</p>
        </Container>
      </div>
    </footer>
  );
}
