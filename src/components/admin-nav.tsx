"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: [string, string, boolean][] = [
  ["/admin", "Overview", false],
  ["/admin/verifications", "Verification", true],
  ["/admin/organizations", "Organizations", true],
  ["/admin/reports", "Reports", false],
  ["/admin/inbox", "Contact inbox", false],
  ["/admin/payments", "Campaigns and payments", true],
  ["/admin/impact", "Impact", false],
  ["/admin/users", "Users", true],
  ["/admin/content", "Site content", true],
  ["/admin/settings", "Settings", true],
  ["/admin/audit", "Audit log", false],
];

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();
  const isAdmin = role === "admin" || role === "super_admin";
  return (
    <nav aria-label="Admin sections" className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {ITEMS.filter(([, , adminOnly]) => isAdmin || !adminOnly).map(([href, label]) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={`block border-b-[3px] px-3 pb-3 pt-2 text-[0.95rem] font-semibold whitespace-nowrap ${active ? "border-marigold text-white" : "border-transparent text-white/65 hover:text-white"}`}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
