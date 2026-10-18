"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["Customers", "customers"],
  ["Products", "products"],
  ["Invoices", "invoices"],
  ["Quotations", "quotations"],
  ["Expenses", "expenses"],
  ["Reports", "reports"],
  ["Settings", "settings"],
] as const;

export function ShopSectionNavigation({ shopId, canManageUsers, canViewSubscription }: { shopId: string; canManageUsers: boolean; canViewSubscription: boolean }) {
  const pathname = usePathname();
  const overviewPath = `/dashboard/shops/${shopId}`;

  return (
    <nav aria-label="Shop navigation" className="flex items-center gap-1 overflow-x-auto py-2 sm:gap-2">
      <Link
        href={overviewPath}
        aria-current={pathname === overviewPath ? "page" : undefined}
        className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${pathname === overviewPath ? "bg-[#dff0bf] text-[var(--forest)]" : "text-[var(--muted)] hover:bg-white hover:text-[var(--forest)]"}`}
      >
        Overview
      </Link>
      {sections.map(([label, route]) => {
        const path = `${overviewPath}/${route}`;
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link
            key={route}
            href={path}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-white text-[var(--forest)] shadow-sm" : "text-[var(--muted)] hover:bg-white hover:text-[var(--forest)]"}`}
          >
            {label}
          </Link>
        );
      })}
      {canManageUsers && <Link href={`${overviewPath}/users`} aria-current={pathname === `${overviewPath}/users` ? "page" : undefined} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${pathname === `${overviewPath}/users` ? "bg-white text-[var(--forest)] shadow-sm" : "text-[var(--muted)] hover:bg-white hover:text-[var(--forest)]"}`}>Staff</Link>}
      {canViewSubscription && <Link href={`${overviewPath}/subscription`} aria-current={pathname === `${overviewPath}/subscription` ? "page" : undefined} className={`shrink-0 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${pathname === `${overviewPath}/subscription` ? "bg-white text-[var(--forest)] shadow-sm" : "text-[var(--muted)] hover:bg-white hover:text-[var(--forest)]"}`}>Subscription</Link>}
    </nav>
  );
}
