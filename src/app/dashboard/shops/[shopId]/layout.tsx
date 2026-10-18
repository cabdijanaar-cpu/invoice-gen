import { ShopSectionNavigation } from "./shop-section-navigation";
import { requireShopMembership } from "@/server/auth/session";

export default async function ShopWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { membership } = await requireShopMembership(shopId);

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color:var(--surface)]/90 px-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto max-w-6xl">
          <ShopSectionNavigation shopId={shopId} canManageUsers={membership.role === "SHOP_OWNER" || membership.canManageUsers} canViewSubscription={membership.role === "SHOP_OWNER"} />
        </div>
      </div>
      {children}
    </>
  );
}
