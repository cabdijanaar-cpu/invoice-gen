import Link from "next/link";
import { requireShopMembership } from "@/server/auth/session";
import { listInvoiceOptions } from "@/server/shops/invoices";
import { listShopQuotations } from "@/server/shops/quotations";
import { QuotationForm } from "./quotation-form";

function usd(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function QuotationsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { membership } = await requireShopMembership(shopId);
  const [quotations, options] = await Promise.all([listShopQuotations(shopId), listInvoiceOptions(shopId)]);
  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-6xl">
    <Link href={`/dashboard/shops/${shopId}`} className="text-sm font-medium text-[var(--forest)]">← {membership.shop.name}</Link>
    <header className="mt-5 border-b border-[var(--line)] pb-5"><h1 className="text-2xl font-semibold">Quotations</h1><p className="mt-1 text-sm text-[var(--muted)]">Create an estimate, mark it accepted, then convert it to an invoice.</p></header>
    <div className="mt-6 grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
      <section><h2 className="mb-3 font-semibold">Recent quotations <span className="text-sm font-normal text-[var(--muted)]">(up to 100)</span></h2>
        {quotations.length ? <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white">{quotations.map((q) => <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><Link href={`/dashboard/shops/${shopId}/quotations/${q.id}`} className="font-semibold text-[var(--forest)] underline">{q.quotationNumber}</Link><p className="mt-1 text-sm text-[var(--muted)]">{q.customer?.name ?? "Walk-in customer"} · {q.issuedAt.toLocaleDateString("en-US")}{q.expiresAt ? ` · Expires ${q.expiresAt.toLocaleDateString("en-US")}` : ""}</p></div><div className="text-right"><p className="font-medium">{usd(q.totalCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{q.status}</p>{q.convertedInvoiceId && <Link href={`/dashboard/shops/${shopId}/invoices/${q.convertedInvoiceId}`} className="text-xs underline">View invoice</Link>}</div></li>)}</ul> : <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">No quotations yet.</p>}
      </section>
      <QuotationForm shopId={shopId} customers={options.customers} products={options.products} />
    </div>
  </div></main>;
}
