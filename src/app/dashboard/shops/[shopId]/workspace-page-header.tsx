import type { ReactNode } from "react";

export function WorkspacePageHeader({ shopName, title, description, badge, action }: { shopName: string; title: string; description: string; badge?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[var(--forest)]">{shopName}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>
      {(badge || action) && <div className="flex shrink-0 flex-wrap items-center gap-3">
        {badge && <span className="rounded-full bg-[#edf6df] px-3 py-1.5 text-xs font-semibold text-[var(--forest)]">{badge}</span>}
        {action}
      </div>}
    </header>
  );
}
