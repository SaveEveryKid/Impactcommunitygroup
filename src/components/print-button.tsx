"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-full bg-teal px-5 font-semibold text-white hover:bg-teal-strong print:hidden">
      <Printer className="h-4 w-4" aria-hidden="true" /> Print or save as PDF
    </button>
  );
}
