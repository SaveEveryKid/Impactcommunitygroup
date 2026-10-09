import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";

export function AuthCard({ title, lede, children, footer }: { title: string; lede?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col px-4 py-12 sm:py-16">
      <BrandMark className="h-10 w-10" />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">{title}</h1>
      {lede ? <p className="mt-3 text-ink-soft">{lede}</p> : null}
      <div className="mt-8 rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-[var(--shadow-raised)] sm:p-8">{children}</div>
      {footer ? <div className="mt-6 text-center text-[0.95rem] text-ink-soft">{footer}</div> : null}
    </div>
  );
}
