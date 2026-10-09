import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { brandName } from "@/lib/env";
import { formatDate, formatNumber } from "@/lib/utils";

export type ReportRow = { metric: string; verification: string; unit: string; total: number; records: number };

const METHOD: Record<string, string> = {
  resource_transfer_completed: "Transfers the receiving organization confirmed as delivered.",
  resource_quantity_redistributed: "Quantity on confirmed transfers, in the giver's listed unit.",
  volunteer_hours: "Hours recorded and verified by a coordinator of the hosting organization.",
  event_completed: "Events the organizer marked complete after they began.",
  event_attendance: "Attendees checked in with their ticket code.",
  partnership_formed: "Partnerships accepted by both organizations.",
  donation_processed: "Net amounts confirmed by the payment processor (after refunds).",
  people_served: "Entered by the organization; see each record's method note.",
};

export function ImpactReport({ title, subtitle, rows, from, to, demo }: { title: string; subtitle?: string; rows: ReportRow[]; from: string | null; to: string | null; demo?: boolean }) {
  const verified = rows.filter((r) => r.verification === "verified");
  const other = rows.filter((r) => r.verification !== "verified");
  const label = (m: string) => (m === "donation_processed" ? "Donations received (USD)" : (IMPACT_METRIC_LABEL[m]?.label ?? m));
  const period = from || to ? `${from ? formatDate(from) : "the beginning"} to ${to ? formatDate(to) : "today"}` : "All time";
  return (
    <article className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <header className="border-b-2 border-ink pb-6">
        <p className="font-semibold text-teal-strong">{brandName} impact report</p>
        <h1 className="mt-2 text-4xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-soft">{subtitle}</p> : null}
        <p className="mt-3 text-sm text-ink-muted">Period: {period}. Generated {formatDate(new Date().toISOString())}.</p>
        {demo ? <p className="mt-3 rounded bg-marigold-wash p-2 text-sm font-semibold">Contains demonstration data. Not real activity.</p> : null}
      </header>
      <section className="mt-8">
        <h2 className="text-2xl font-semibold">Verified results</h2>
        <table className="mt-4 w-full border-collapse text-left">
          <thead><tr className="border-b border-line text-sm text-ink-muted"><th className="py-2">Measure</th><th className="py-2 text-right">Total</th><th className="py-2 pl-6">How it was measured</th></tr></thead>
          <tbody>
            {verified.map((r) => (
              <tr key={`${r.metric}-${r.unit}`} className="border-b border-line align-top">
                <td className="py-3 font-semibold">{label(r.metric)}</td>
                <td className="py-3 text-right font-display text-xl font-bold">{formatNumber(r.total, r.metric === "donation_processed" ? 2 : 1)} <span className="text-sm font-normal text-ink-muted">{r.metric === "donation_processed" ? "" : r.unit}</span></td>
                <td className="py-3 pl-6 text-sm text-ink-soft">{METHOD[r.metric] ?? ""}</td>
              </tr>
            ))}
            {!verified.length ? <tr><td colSpan={3} className="py-4 text-ink-muted">No verified activity in this period.</td></tr> : null}
          </tbody>
        </table>
      </section>
      {other.length ? (
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Self-reported and estimated</h2>
          <p className="mt-1 text-sm text-ink-muted">Reported by the organization and not confirmed in the platform. Not included in verified totals.</p>
          <table className="mt-4 w-full border-collapse text-left">
            <tbody>
              {other.map((r) => (
                <tr key={`${r.metric}-${r.unit}-${r.verification}`} className="border-b border-line">
                  <td className="py-3">{label(r.metric)} ({r.verification.replace("_", "-")})</td>
                  <td className="py-3 text-right font-semibold">{formatNumber(r.total, 1)} {r.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      <footer className="mt-12 border-t border-line pt-4 text-xs text-ink-muted">
        Each figure is counted once per source record (transfer, hour record, event, partnership or payment). Demonstration data is excluded from production reports.
      </footer>
    </article>
  );
}
