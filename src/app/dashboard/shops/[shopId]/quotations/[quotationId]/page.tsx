import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopQuotation } from "@/server/shops/quotations";
import { QuotationControls } from "../quotation-controls";

function usd(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function QuotationDetailPage({ params }: { params: Promise<{ shopId: string; quotationId: string }> }) {
  const { shopId, quotationId } = await params;
  const q = await getShopQuotation(shopId, quotationId);
  if (!q) notFound();
  return <main className="min-h-screen px-5 py-8"><div className="mx-auto max-w-4xl">
    <Link href={`/dashboard/shops/${shopId}/quotations`} className="text-sm font-medium text-[var(--forest)]">← Quotations</Link>
    <article className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-6 sm:p-10">
      <header className="flex flex-wrap justify-between gap-4 border-b border-[var(--line)] pb-5"><div><p className="text-xs uppercase tracking-wide text-[var(--muted)]">Quotation</p><h1 className="mt-1 text-2xl font-semibold">{q.quotationNumber}</h1><p className="mt-2 text-sm text-[var(--muted)]">{q.customer?.name ?? "Walk-in customer"}</p></div><div className="text-right"><p className="font-semibold">{q.status}</p><p className="mt-1 text-sm text-[var(--muted)]">Created {q.issuedAt.toLocaleDateString("en-US")}{q.expiresAt ? ` · Expires ${q.expiresAt.toLocaleDateString("en-US")}` : ""}</p></div></header>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-[var(--muted)]"><th className="py-3">Description</th><th className="py-3 text-right">Qty</th><th className="py-3 text-right">Unit price</th><th className="py-3 text-right">Discount</th><th className="py-3 text-right">Total</th></tr></thead><tbody>{q.items.map((item, i) => <tr key={i} className="border-b"><td className="py-3">{item.description}{item.skuSnapshot && <span className="block text-xs text-[var(--muted)]">{item.skuSnapshot}</span>}</td><td className="py-3 text-right">{(item.quantityMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td><td className="py-3 text-right">{usd(item.unitPriceCents)}</td><td className="py-3 text-right">{usd(item.discountCents)}</td><td className="py-3 text-right">{usd(item.lineTotalCents)}</td></tr>)}</tbody></table></div>
      <section className="ml-auto mt-5 max-w-xs space-y-2 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{usd(q.subtotalCents)}</span></p><p className="flex justify-between"><span>Discount</span><span>{usd(q.discountCents)}</span></p><p className="flex justify-between"><span>Tax</span><span>{usd(q.taxCents)}</span></p><p className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{usd(q.totalCents)}</span></p></section>
      {q.notes && <p className="mt-6 border-t pt-4 text-sm text-[var(--muted)]">{q.notes}</p>}
      {q.convertedInvoiceId && <p className="mt-5 rounded-lg bg-[#edf6df] p-3 text-sm">Converted to invoice <Link className="font-medium underline" href={`/dashboard/shops/${shopId}/invoices/${q.convertedInvoiceId}`}>view invoice</Link></p>}
      <QuotationControls shopId={shopId} quotationId={q.id} status={q.status} />
    </article>
  </div></main>;
}
