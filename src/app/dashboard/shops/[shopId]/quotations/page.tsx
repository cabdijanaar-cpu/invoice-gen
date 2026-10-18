import Link from "next/link";
import { requireShopMembership } from "@/server/auth/session";
import { listInvoiceOptions } from "@/server/shops/invoices";
import { listShopQuotations } from "@/server/shops/quotations";
import { QuotationForm } from "./quotation-form";
import { WorkspacePageHeader } from "../workspace-page-header";

function usd(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function QuotationsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { membership } = await requireShopMembership(shopId);
  const [quotations, options] = await Promise.all([listShopQuotations(shopId), listInvoiceOptions(shopId)]);
  return <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <WorkspacePageHeader shopName={membership.shop.name} title="Quotations" description="Prepare an estimate, track its status, and convert accepted quotes to invoices." />
    <div className="mt-6 grid gap-8">
      <section className="order-2"><div className="mb-3 flex items-end justify-between gap-2"><div><h2 className="font-semibold tracking-tight">Recent quotations</h2><p className="mt-1 text-sm text-[var(--muted)]">Your latest estimates</p></div><span className="text-xs text-[var(--muted)]">Up to 100 records</span></div>
        {quotations.length ? <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">{quotations.map((q) => <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"><div><Link href={`/dashboard/shops/${shopId}/quotations/${q.id}`} className="font-semibold text-[var(--forest)] underline">{q.quotationNumber}</Link><p className="mt-1 text-sm text-[var(--muted)]">{q.customer?.name ?? "Walk-in customer"} · {q.issuedAt.toLocaleDateString("en-US")}{q.expiresAt ? ` · Expires ${q.expiresAt.toLocaleDateString("en-US")}` : ""}</p></div><div className="text-right"><p className="font-medium">{usd(q.totalCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{q.status}</p>{q.convertedInvoiceId && <Link href={`/dashboard/shops/${shopId}/invoices/${q.convertedInvoiceId}`} className="text-xs underline">View invoice</Link>}</div></li>)}</ul> : <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)] shadow-sm">No quotations yet.</p>}
      </section>
      <section className="order-1"><div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--forest)]">New document</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Create quotation</h2><p className="mt-1 text-sm text-[var(--muted)]">Set expiry and add the products or services you are quoting.</p></div><QuotationForm shopId={shopId} customers={options.customers} products={options.products} defaults={options.defaults} /></section>
    </div>
  </div></main>;
}
