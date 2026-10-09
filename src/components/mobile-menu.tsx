"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function MobileMenu({ items, signedIn }: { items: { href: string; label: string }[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-ink/5"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
      </button>
      {open ? (
        <div
          id="mobile-menu"
          ref={panelRef}
          className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t border-line bg-paper px-4 pb-[calc(2rem+var(--safe-bottom))] pt-4"
        >
          <nav aria-label="Mobile">
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                    className="flex min-h-14 items-center border-b border-line font-display text-xl font-semibold aria-[current=page]:text-teal"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/support" className="flex min-h-14 items-center border-b border-line font-display text-xl font-semibold">
                  Support the mission
                </Link>
              </li>
            </ul>
          </nav>
          <div className="mt-6 flex flex-col gap-3">
            {signedIn ? (
              <>
                <Link href="/dashboard" className={buttonClass("primary", "lg")}>
                  Go to dashboard
                </Link>
                <Link href="/inbox" className={buttonClass("secondary", "lg")}>
                  Messages
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup" className={buttonClass("primary", "lg")}>
                  Join the network
                </Link>
                <Link href="/login" className={buttonClass("secondary", "lg")}>
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
