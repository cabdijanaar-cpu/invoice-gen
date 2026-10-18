import Link from "next/link";
import { requireShopMembership } from "@/server/auth/session";
import { ShopSectionNavigation } from "./shop-section-navigation";
import { ShopSwitcher } from "./shop-switcher";

export default async function ShopWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { user, membership } = await requireShopMembership(shopId);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[var(--line)] bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href={`/dashboard/shops/${shopId}`} className="flex h-[76px] items-center gap-3 border-b border-[var(--line)] px-6" aria-label="InvoiceFlow shop overview">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-[var(--forest)] text-sm font-bold text-white">IF</span>
          <span className="text-lg font-semibold tracking-tight text-[var(--ink)]">InvoiceFlow</span>
        </Link>
        <div className="px-4 pt-5">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Workspace</p>
          <ShopSwitcher shopId={shopId} shops={user.memberships} />
        </div>
        <ShopSectionNavigation id="shop-navigation-desktop" shopId={shopId} canManageUsers={membership.role === "SHOP_OWNER" || membership.canManageUsers} canViewReports={membership.role === "SHOP_OWNER" || membership.canViewReports} canManageSettings={membership.role === "SHOP_OWNER" || membership.canManageSettings} canViewSubscription={membership.role === "SHOP_OWNER"} />
        <div className="mt-auto border-t border-[var(--line)] p-4">
          <p className="truncate px-2 text-sm font-medium">{user.name || user.email}</p>
          <p className="px-2 pt-1 text-xs capitalize text-[var(--muted)]">{membership.role.replaceAll("_", " ").toLowerCase()}</p>
          <Link href="/dashboard" className="mt-3 flex rounded-xl px-2 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--forest)]">← All shops</Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex min-h-[60px] max-w-6xl items-center justify-between gap-3 lg:min-h-[68px]">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--forest)] text-xs font-bold text-white">IF</span>
              <span className="truncate text-sm font-semibold">{membership.shop.name}</span>
            </div>
            <p className="hidden text-sm text-[var(--muted)] lg:block">Shop workspace <span className="px-1">/</span> <span className="font-medium text-[var(--ink)]">{membership.shop.name}</span></p>
            <Link href="/dashboard" className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-[var(--forest)] hover:bg-[var(--surface)] lg:hidden">All shops</Link>
            <p className="hidden text-xs font-medium capitalize text-[var(--muted)] sm:block lg:hidden">{membership.role.replaceAll("_", " ").toLowerCase()}</p>
          </div>
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 lg:hidden">
            <ShopSwitcher shopId={shopId} shops={user.memberships} compact />
            <ShopSectionNavigation id="shop-navigation-mobile" shopId={shopId} canManageUsers={membership.role === "SHOP_OWNER" || membership.canManageUsers} canViewReports={membership.role === "SHOP_OWNER" || membership.canViewReports} canManageSettings={membership.role === "SHOP_OWNER" || membership.canManageSettings} canViewSubscription={membership.role === "SHOP_OWNER"} />
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
