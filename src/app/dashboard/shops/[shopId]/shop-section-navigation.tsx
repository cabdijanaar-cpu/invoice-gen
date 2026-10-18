"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const sections = [
  ["Customers", "customers"],
  ["Products & inventory", "products"],
  ["Invoices", "invoices"],
  ["Payments & debts", "payments"],
  ["Quotations", "quotations"],
  ["Expenses", "expenses"],
  ["Reports", "reports"],
  ["Settings", "settings"],
] as const;

export function ShopSectionNavigation({ id, shopId, canManageUsers, canViewReports, canManageSettings, canViewSubscription }: { id: string; shopId: string; canManageUsers: boolean; canViewReports: boolean; canManageSettings: boolean; canViewSubscription: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const overviewPath = `/dashboard/shops/${shopId}`;
  const linkClass = (active: boolean) => `shrink-0 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-[#eaf3e6] text-[var(--forest)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--forest)]"}`;
  const closeMenu = () => setIsOpen(false);
  const links = [
    <Link key="overview" href={overviewPath} onClick={closeMenu} aria-current={pathname === overviewPath ? "page" : undefined} className={linkClass(pathname === overviewPath)}>Overview</Link>,
    ...sections.filter(([, route]) => (route !== "reports" || canViewReports) && (route !== "settings" || canManageSettings)).map(([label, route]) => {
      const path = `${overviewPath}/${route}`;
      const active = pathname === path || pathname.startsWith(`${path}/`);
      return <Link key={route} href={path} onClick={closeMenu} aria-current={active ? "page" : undefined} className={linkClass(active)}>{label}</Link>;
    }),
  ];
  if (canManageUsers) links.push(<Link key="staff" href={`${overviewPath}/users`} onClick={closeMenu} aria-current={pathname.startsWith(`${overviewPath}/users`) ? "page" : undefined} className={linkClass(pathname.startsWith(`${overviewPath}/users`))}>Staff & permissions</Link>);
  if (canViewSubscription) links.push(<Link key="subscription" href={`${overviewPath}/subscription`} onClick={closeMenu} aria-current={pathname.startsWith(`${overviewPath}/subscription`) ? "page" : undefined} className={linkClass(pathname.startsWith(`${overviewPath}/subscription`))}>Subscription</Link>);

  return (
    <div className="relative flex items-center justify-end lg:contents">
      <button type="button" aria-expanded={isOpen} aria-controls={id} onClick={() => setIsOpen((open) => !open)} className="my-2 flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-[var(--forest)] hover:bg-[var(--surface)] lg:hidden">
        <span>Menu</span><span aria-hidden="true">{isOpen ? "−" : "+"}</span>
      </button>
      <nav id={id} aria-label="Shop navigation" className={`${isOpen ? "flex" : "hidden"} absolute right-0 top-full z-30 max-h-[65vh] min-w-56 flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-2 shadow-lg lg:static lg:flex lg:max-h-none lg:min-w-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:px-4 lg:py-3 lg:shadow-none`}>
        {links}
      </nav>
    </div>
  );
}
