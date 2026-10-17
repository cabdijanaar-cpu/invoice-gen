import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireShopMembership } from "@/server/auth/session";
import { listShopProducts } from "@/server/shops/products";
import { ProductForm } from "./product-form";
import { StockAdjustment } from "./stock-adjustment";
import { ProductManagement } from "./product-management";

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { shopId } = await params;
  const query = await searchParams;
  const search = (query.q ?? "").slice(0, 100);
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { membership } = await requireShopMembership(shopId);
  const result = await listShopProducts(shopId, search, page);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const products = page > pageCount ? (await listShopProducts(shopId, search, pageCount)).products : result.products;
  const activePage = Math.min(page, pageCount);
  const canManage = membership.role === "SHOP_OWNER" || membership.canManageProducts;
  const canAdjust = membership.role === "SHOP_OWNER" || membership.canAdjustInventory;

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex gap-4 text-sm font-medium text-[var(--forest)]"><Link href="/dashboard">← Your shops</Link><Link href={`/dashboard/shops/${shopId}/customers`}>Customers</Link><Link href={`/dashboard/shops/${shopId}/invoices`}>Invoices</Link></div>
        <header className="mt-5 border-b border-[var(--line)] pb-5">
          <p className="text-sm text-[var(--muted)]">{membership.shop.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">Products & inventory</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{result.total} products found</p>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          {canManage ? <ProductForm shopId={shopId} /> : <p className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">You can view inventory but do not have permission to add products.</p>}
          <section>
            <h2 className="mb-3 font-semibold">Product list</h2>
            <form className="mb-3 flex gap-2" role="search">
              <label className="sr-only" htmlFor="product-search">Search products</label>
              <input id="product-search" name="q" defaultValue={search} placeholder="Search name, SKU, or barcode" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm" />
              <button className="rounded-xl bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Search</button>
            </form>
            {products.length ? (
              <ul className="space-y-3">
                {products.map((product) => {
                  const low = product.stockQuantityMilli <= product.lowStockThresholdMilli;
                  return (
                    <li key={product.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{product.name}</h3>
                          <p className="mt-1 text-xs text-[var(--muted)]">{product.sku || "No SKU"}{product.barcode ? ` · ${product.barcode}` : ""}</p>
                        </div>
                        <p className="font-medium">{formatUsd(product.sellingPriceCents)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
                        <span className={`text-sm ${low ? "font-medium text-amber-800" : "text-[var(--muted)]"}`}>
                          Stock: {(product.stockQuantityMilli / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 })} {product.unit}{low ? " · Low stock" : ""}
                        </span>
                        {canAdjust && <StockAdjustment shopId={shopId} productId={product.id} initialRequestId={randomUUID()} />}
                      </div>
                      {product.movements.length > 0 && <details className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
                        <summary className="cursor-pointer font-medium">Recent stock movements</summary>
                        <ul className="mt-2 space-y-1 text-[var(--muted)]">
                          {product.movements.map((movement) => <li key={movement.id} className="flex flex-wrap justify-between gap-2"><span>{movement.type.replaceAll("_", " ")} · {movement.reason || "No reason recorded"}</span><span>{movement.quantityDeltaMilli > 0 ? "+" : ""}{(movement.quantityDeltaMilli / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 })} {product.unit} · {movement.createdAt.toLocaleDateString("en-US")}</span></li>)}
                        </ul>
                      </details>}
                      <Link href={`/dashboard/shops/${shopId}/products/${product.id}/movements`} className="mt-3 inline-block text-sm font-medium text-[var(--forest)] hover:underline">View full stock history</Link>
                      {canManage && <ProductManagement shopId={shopId} product={product} />}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">{search ? "No products match your search." : "No products have been added to this shop."}</p>
            )}
            {result.total > result.pageSize && <nav aria-label="Product pages" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Page {activePage} of {pageCount}</span>
              {activePage > 1 ? <Link className="font-medium text-[var(--forest)]" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(activePage - 1) })}`}>Previous</Link> : <span />}
              {activePage < pageCount && <Link className="font-medium text-[var(--forest)]" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(activePage + 1) })}`}>Next</Link>}
            </nav>}
          </section>
        </div>
      </div>
    </main>
  );
}
