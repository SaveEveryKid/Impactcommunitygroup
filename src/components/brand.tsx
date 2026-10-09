import Link from "next/link";
import { brandName } from "@/lib/env";
import { cn } from "@/lib/utils";

/** Five arcs, one per well-being pillar, closing into a single ring. */
export function BrandMark({ className, mono = false }: { className?: string; mono?: boolean }) {
  const colors = mono
    ? ["currentColor", "currentColor", "currentColor", "currentColor", "currentColor"]
    : ["var(--pillar-mental)", "var(--pillar-physical)", "var(--pillar-social)", "var(--pillar-spiritual)", "var(--pillar-financial)"];
  const r = 13;
  const c = 2 * Math.PI * r;
  const seg = c / 5;
  return (
    <svg viewBox="0 0 36 36" className={cn("h-8 w-8", className)} aria-hidden="true">
      <g transform="rotate(-90 18 18)">
        {colors.map((color, i) => (
          <circle
            key={i}
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={`${seg - 2.4} ${c - seg + 2.4}`}
            strokeDashoffset={-i * seg}
            strokeLinecap="round"
          />
        ))}
      </g>
      <circle cx="18" cy="18" r="4" fill={mono ? "currentColor" : "var(--ink)"} />
    </svg>
  );
}

export function BrandLink({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 rounded-md", inverse ? "text-white" : "text-ink")} aria-label={`${brandName} home`}>
      <BrandMark mono={inverse} />
      <span className="font-display text-[1.2rem] font-bold tracking-[-0.02em]">{brandName}</span>
    </Link>
  );
}
