"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

export function UserMenu({ name, isStaff }: { name: string; isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-1.5 rounded-full pl-1 pr-2.5 hover:bg-ink/5"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[0.8rem] font-bold text-white">{initials}</span>
        <span className="sr-only">Account menu for {name}</span>
        <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 w-60 rounded-[var(--radius-md)] border border-line bg-surface p-1.5 shadow-[var(--shadow-raised)]">
          <p className="px-3 py-2 text-sm text-ink-muted">Signed in as {name}</p>
          {[
            ["/dashboard", "Dashboard"],
            ["/inbox", "Messages"],
            ["/settings", "Account settings"],
            ...(isStaff ? [["/admin", "Platform admin"]] : []),
          ].map(([href, label]) => (
            <Link key={href} role="menuitem" href={href} onClick={() => setOpen(false)} className="block rounded-[8px] px-3 py-2.5 font-semibold hover:bg-paper">
              {label}
            </Link>
          ))}
          <form action={signOut}>
            <button role="menuitem" type="submit" className="block w-full rounded-[8px] px-3 py-2.5 text-left font-semibold text-danger hover:bg-danger-wash">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
