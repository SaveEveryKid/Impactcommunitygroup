import type { Metadata } from "next";
import { ImpactStrip } from "@/components/impact-strip";
import { Container, PageHeader } from "@/components/ui/misc";
import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { getPublicImpact } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Our impact",
  description: "Verified community impact on the network, with the method behind every number.",
  alternates: { canonical: "/impact" },
};

const METHODS: [string, string][] = [
  ["Approved organizations", "Organizations a platform administrator reviewed and approved. Pending, suspended and demonstration organizations are excluded."],
  ["Completed resource transfers", "Counted when the receiving organization confirms delivery in the platform. Cancelled and in-progress transfers are excluded."],
  ["Resources redistributed", "The quantity confirmed on each completed transfer, in the unit the giving organization listed (lbs, boxes, hours)."],
  ["Verified volunteer hours", "Hours recorded and then verified by a coordinator of the hosting organization. Volunteers can't verify their own hours."],
  ["Checked-in event attendees", "People checked in at the door with their ticket code, counted once the organizer marks the event complete."],
  ["Partnerships formed", "Partnership requests accepted by both organizations."],
];

export default async function ImpactPage() {
  const impact = await getPublicImpact().catch(() => ({ connected: false, rows: [], demo: false }));
  const verified = impact.rows.filter((r) => r.verification === "verified");
  const selfReported = impact.rows.filter((r) => r.verification !== "verified");

  return (
    <>
      <PageHeader title="Our impact" lede="Every number here comes from activity recorded and confirmed on the platform. No estimates presented as results." />
      <section className="bg-ink py-14 text-white">
        <Container>
          <h2 className="text-2xl font-semibold">Verified totals</h2>
          <ImpactStrip rows={impact.rows} connected={impact.connected} demo={impact.demo} />
          {verified.length ? (
            <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {verified
                .filter((r) => !["organizations_registered", "volunteer_hours", "resource_transfer_completed", "event_attendance"].includes(r.metric))
                .map((r) => (
                  <div key={r.metric}>
                    <dt className="text-white/65">{IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric}</dt>
                    <dd className="font-display text-3xl font-bold">{formatNumber(r.total, 1)}</dd>
                  </div>
                ))}
            </dl>
          ) : null}
        </Container>
      </section>
      <Container className="grid gap-14 py-14 lg:grid-cols-2">
        <section aria-labelledby="method">
          <h2 id="method" className="text-2xl font-semibold">
            How each number is measured
          </h2>
          <dl className="mt-6 space-y-5">
            {METHODS.map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold">{t}</dt>
                <dd className="text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="self">
          <h2 id="self" className="text-2xl font-semibold">
            Self-reported by organizations
          </h2>
          <p className="mt-3 text-ink-soft">
            Organizations can also record work that happens outside the platform, like people served at a weekly meal. We show it separately,
            labelled as self-reported, and never add it to verified totals.
          </p>
          {selfReported.length ? (
            <dl className="mt-6 space-y-4">
              {selfReported.map((r) => (
                <div key={`${r.metric}-${r.verification}`}>
                  <dt className="text-ink-muted">
                    {IMPACT_METRIC_LABEL[r.metric]?.label ?? r.metric} ({r.verification === "estimated" ? "estimated" : "self-reported"})
                  </dt>
                  <dd className="font-display text-2xl font-bold">{formatNumber(r.total)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-4 text-ink-muted">Nothing self-reported yet.</p>
          )}
          <h3 className="mt-10 text-lg font-semibold">What we don&apos;t do</h3>
          <ul className="prose-body mt-2">
            <li>Count the same transfer, hour or attendee twice.</li>
            <li>Include demonstration data in any public figure.</li>
            <li>Show donation totals publicly without the organization&apos;s consent.</li>
          </ul>
        </section>
      </Container>
    </>
  );
}
