import type { ReactNode } from "react";
import { BadgeCheck, ShieldCheck, type LucideIcon } from "lucide-react";
import { PILLAR_META, VERIFICATION_LABEL, type Pillar } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

export function PageHeader({ title, lede, actions, children }: { title: string; lede?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-paper-raised">
      <Container className="py-10 sm:py-14">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-[2.1rem] font-semibold sm:text-5xl">{title}</h1>
            {lede ? <p className="mt-4 text-lg text-ink-soft">{lede}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {children}
      </Container>
    </header>
  );
}

export function PillarTag({ pillar, size = "sm" }: { pillar: Pillar; size?: "sm" | "md" }) {
  const meta = PILLAR_META[pillar];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-surface font-semibold",
        size === "sm" ? "px-2.5 py-0.5 text-[0.8rem]" : "px-3 py-1 text-sm",
      )}
      style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label.replace(" well-being", "")}
    </span>
  );
}

export function VerificationBadge({ level }: { level: keyof typeof VERIFICATION_LABEL }) {
  if (level === "unverified") return null;
  const Icon = level === "tax_exempt_verified" ? ShieldCheck : BadgeCheck;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-wash px-2.5 py-0.5 text-[0.8rem] font-semibold text-teal-strong">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {VERIFICATION_LABEL[level]}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "teal" | "warn" | "danger" | "marigold"; className?: string }) {
  const tones = {
    neutral: "bg-paper text-ink-soft border-line",
    teal: "bg-teal-wash text-teal-strong border-teal/20",
    warn: "bg-warn-wash text-warn border-warn/20",
    danger: "bg-danger-wash text-danger border-danger/20",
    marigold: "bg-marigold-wash text-[#6e4a00] border-marigold/30",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.8rem] font-semibold", tones[tone], className)}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-paper-raised p-8 sm:p-10">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-teal-wash text-teal-strong">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children ? <div className="max-w-prose text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({ title, lede, action, id }: { title: string; lede?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h2 id={id} className="text-3xl font-semibold sm:text-[2.4rem]">
          {title}
        </h2>
        {lede ? <p className="mt-3 text-lg text-ink-soft">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function NotConnectedNotice() {
  return (
    <div role="status" className="rounded-[var(--radius-md)] border border-warn/30 bg-warn-wash px-4 py-3 text-[0.95rem] text-warn">
      The database isn&apos;t connected yet, so live listings can&apos;t be shown. An administrator needs to add the Supabase settings
      described in the deployment guide.
    </div>
  );
}
