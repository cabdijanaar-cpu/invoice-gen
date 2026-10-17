import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopProductMovementHistory } from "@/server/shops/products";

export default async function ProductMovementsPage({ params, searchParams }: { params: Promise<{ shopId: string; productId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { shopId, productId } = await params;
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const result = await getShopProductMovementHistory(shopId, productId, page);
  if (!result) notFound();
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const movements = page > pageCount ? (await getShopProductMovementHistory(shopId, productId, pageCount))?.movements ?? [] : result.movements;
  const activePage = Math.min(page, pageCount);

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-4xl">
    <Link href={`/dashboard/shops/${shopId}/products`} className="text-sm font-medium text-[var(--forest)]">← Products & inventory</Link>
    <header className="mt-5 border-b border-[var(--line)] pb-5"><p className="text-sm text-[var(--muted)]">{result.product.sku || "No SKU"}{result.product.status === "ARCHIVED" ? " · Archived" : ""}</p><h1 className="mt-1 text-2xl font-semibold">{result.product.name} stock history</h1><p className="mt-2 text-sm text-[var(--muted)]">Current stock: {(result.product.stockQuantityMilli / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 })} {result.product.unit} · {result.total} recorded movements</p></header>
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5">
      {movements.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Type / reason</th><th className="py-2 pr-3">Recorded by</th><th className="py-2 text-right">Change</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id} className="border-b last:border-0"><td className="py-3 pr-3">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(movement.createdAt)}</td><td className="py-3 pr-3"><span className="font-medium">{movement.type.replaceAll("_", " ")}</span><span className="block text-xs text-[var(--muted)]">{movement.reason || "No reason recorded"}</span></td><td className="py-3 pr-3">{movement.actor?.name ?? "System"}</td><td className="py-3 text-right">{movement.quantityDeltaMilli > 0 ? "+" : ""}{(movement.quantityDeltaMilli / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 })} {result.product.unit}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--muted)]">No stock movements recorded.</p>}
      {result.total > result.pageSize && <nav aria-label="Stock history pages" className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-4 text-sm"><span className="text-[var(--muted)]">Page {activePage} of {pageCount}</span>{activePage > 1 ? <Link className="font-medium text-[var(--forest)]" href={`?page=${activePage - 1}`}>Previous</Link> : <span />}{activePage < pageCount && <Link className="font-medium text-[var(--forest)]" href={`?page=${activePage + 1}`}>Next</Link>}</nav>}
    </section>
  </div></main>;
}
