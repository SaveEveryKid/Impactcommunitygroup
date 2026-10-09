import Link from "next/link";
import { Search } from "lucide-react";

type Select = { name: string; label: string; options: { value: string; label: string }[]; value?: string };

/** Plain GET form: works without JavaScript and produces shareable URLs. */
export function FilterBar({
  action,
  q,
  qLabel = "Search",
  selects = [],
  extra,
}: {
  action: string;
  q?: string;
  qLabel?: string;
  selects?: Select[];
  extra?: React.ReactNode;
}) {
  const active = Boolean(q) || selects.some((s) => s.value);
  return (
    <form action={action} method="get" role="search" className="mt-8 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 sm:grid-cols-2 lg:flex lg:items-end">
      <div className="flex flex-col gap-1.5 lg:flex-1">
        <label htmlFor="filter-q" className="text-sm font-semibold">
          {qLabel}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={q}
            className="h-12 w-full rounded-[10px] border border-line-strong bg-surface pl-10 pr-3 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20"
          />
        </div>
      </div>
      {selects.map((s) => (
        <div key={s.name} className="flex flex-col gap-1.5 lg:w-52">
          <label htmlFor={`filter-${s.name}`} className="text-sm font-semibold">
            {s.label}
          </label>
          <select
            id={`filter-${s.name}`}
            name={s.name}
            defaultValue={s.value ?? ""}
            className="h-12 rounded-[10px] border border-line-strong bg-surface px-3 text-base focus:border-teal focus:outline-none focus:ring-3 focus:ring-teal/20"
          >
            <option value="">Any</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {extra}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <button type="submit" className="h-12 flex-1 rounded-full bg-teal px-6 font-semibold text-white hover:bg-teal-strong lg:flex-none">
          Apply filters
        </button>
        {active ? (
          <Link href={action} className="grid h-12 place-items-center rounded-full px-4 font-semibold text-ink-soft hover:bg-ink/5">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function ResultCount({ total, noun }: { total: number; noun: [string, string] }) {
  return (
    <p className="mb-5 text-ink-muted" role="status">
      {total.toLocaleString()} {total === 1 ? noun[0] : noun[1]}
    </p>
  );
}
