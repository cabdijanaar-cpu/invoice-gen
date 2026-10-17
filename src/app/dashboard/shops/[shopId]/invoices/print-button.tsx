"use client";

export function PrintButton() {
  return <button onClick={() => window.print()} className="print:hidden rounded-lg bg-[var(--forest)] px-4 py-2.5 text-sm font-medium text-white">Print invoice</button>;
}
