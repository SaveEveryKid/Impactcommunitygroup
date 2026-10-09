"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const RANK = { member: 1, coordinator: 2, admin: 3, owner: 4 } as const;
type Role = keyof typeof RANK;

const TABS: { seg: string; label: string; min: Role }[] = [
  { seg: "", label: "Overview", min: "member" },
  { seg: "resources", label: "Resources", min: "member" },
  { seg: "transfers", label: "Transfers", min: "member" },
  { seg: "volunteers", label: "Volunteers", min: "member" },
  { seg: "events", label: "Events", min: "member" },
  { seg: "posts", label: "Updates", min: "coordinator" },
  { seg: "partnerships", label: "Partnerships", min: "member" },
  { seg: "impact", label: "Impact", min: "member" },
  { seg: "donations", label: "Donations", min: "admin" },
  { seg: "team", label: "Team", min: "member" },
  { seg: "profile", label: "Profile", min: "admin" },
  { seg: "verification", label: "Verification", min: "admin" },
];

export function OrgTabs({ orgId, role }: { orgId: string; role: Role }) {
  const pathname = usePathname();
  const base = `/dashboard/org/${orgId}`;
  return (
    <nav aria-label="Organization sections" className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {TABS.filter((t) => RANK[role] >= RANK[t.min]).map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          const active = t.seg ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={t.seg}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block border-b-[3px] px-3 pb-3 pt-2 text-[0.95rem] font-semibold whitespace-nowrap",
                  active ? "border-teal text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
