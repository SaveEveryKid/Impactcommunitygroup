import { IMPACT_METRIC_LABEL } from "@/lib/constants";
import { impactValue, type ImpactRow } from "@/lib/queries";
import { formatNumber } from "@/lib/utils";

const HEADLINE = ["organizations_registered", "volunteer_hours", "resource_transfer_completed", "event_attendance"] as const;

export function ImpactStrip({ rows, connected, tone = "dark" }: { rows: ImpactRow[]; connected: boolean; tone?: "dark" | "light" }) {
  const values = HEADLINE.map((m) => ({ metric: m, value: impactValue(rows, m) }));
  const allZero = values.every((v) => v.value === 0);
  const muted = tone === "dark" ? "text-white/65" : "text-ink-muted";
  const border = tone === "dark" ? "border-white/15" : "border-line";

  return (
    <div className="mt-10">
      <dl className={`grid grid-cols-2 border-t ${border} lg:grid-cols-4`}>
        {values.map((v) => (
          <div key={v.metric} className={`border-b ${border} py-6 pr-4`}>
            <dt className={`text-[0.95rem] ${muted}`}>{IMPACT_METRIC_LABEL[v.metric].label}</dt>
            <dd className="mt-1 font-display text-4xl font-bold sm:text-5xl" style={{ color: v.value ? "var(--marigold)" : undefined }}>
              {connected ? formatNumber(v.value) : "—"}
            </dd>
          </div>
        ))}
      </dl>
      {!connected ? (
        <p className={`mt-4 text-[0.95rem] ${muted}`}>Impact figures will appear once the platform database is connected.</p>
      ) : allZero ? (
        <p className={`mt-4 text-[0.95rem] ${muted}`}>
          The network is new, so these start at zero. They grow only as real, confirmed activity happens.
        </p>
      ) : null}
    </div>
  );
}
