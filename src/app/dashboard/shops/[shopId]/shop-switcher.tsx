import Link from "next/link";

type ShopOption = {
  shopId: string;
  role: string;
  shop: { name: string };
};

export function ShopSwitcher({ shopId, shops, compact = false }: { shopId: string; shops: ShopOption[]; compact?: boolean }) {
  const activeShop = shops.find((shop) => shop.shopId === shopId);

  return (
    <details className={`group relative ${compact ? "min-w-0" : "mt-2"}`}>
      <summary aria-label="Switch shop" className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white text-sm font-semibold text-[var(--forest)] hover:bg-[var(--surface)] [&::-webkit-details-marker]:hidden ${compact ? "max-w-full px-3 py-2" : "w-full px-3 py-2.5"}`}>
        <span className="truncate">{activeShop?.shop.name ?? "Current shop"}</span>
        {shops.length > 1 && <span aria-hidden="true" className="shrink-0 text-xs">⌄</span>}
      </summary>
      {shops.length > 1 && <div className={`z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-1 shadow-lg ${compact ? "absolute left-0 top-full min-w-56" : ""}`}>
        {shops.map((shop) => <Link key={shop.shopId} href={`/dashboard/shops/${shop.shopId}`} aria-current={shop.shopId === shopId ? "page" : undefined} className={`block truncate rounded-lg px-3 py-2 text-sm ${shop.shopId === shopId ? "bg-[#eaf3e6] font-semibold text-[var(--forest)]" : "text-[var(--ink)] hover:bg-[var(--surface)]"}`}>
          {shop.shop.name}<span className="ml-2 text-xs capitalize text-[var(--muted)]">{shop.role.replaceAll("_", " ").toLowerCase()}</span>
        </Link>)}
      </div>}
    </details>
  );
}
