import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireShopMembership } from "@/server/auth/session";
import { getShopInvoice, listInvoiceOptions, listShopInvoices } from "@/server/shops/invoices";
import { InvoiceForm } from "./invoice-form";

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function InvoicesPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ draft?: string }> }) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  const { membership } = await requireShopMembership(shopId);
  const [invoices, options] = await Promise.all([listShopInvoices(shopId), listInvoiceOptions(shopId)]);
  const candidateDraft = query.draft ? await getShopInvoice(shopId, query.draft) : null;
  const draft = candidateDraft?.status === "DRAFT" ? candidateDraft : undefined;

  return (
    <main className="min-h-screen bg-[#f1f5f2] px-4 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto max-w-5xl">
        <header className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-white bg-white px-5 py-6 shadow-sm sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{membership.shop.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]">Invoices</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Create, review, and keep track of customer invoices.</p>
          </div>
          <span className="rounded-full bg-[#edf6df] px-3 py-1.5 text-xs font-semibold text-[var(--forest)]">INVOICE WORKSPACE</span>
        </header>
        <div className="mt-6 grid gap-8">
          <section className="order-2">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="font-semibold tracking-tight">Recent invoices</h2><p className="mt-1 text-sm text-[var(--muted)]">Your latest activity for this shop</p></div>
              <span className="text-xs text-[var(--muted)]">Up to 100 records</span>
            </div>
            {invoices.length ? (
                <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                      <Link href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`} className="font-semibold text-[var(--forest)] underline">{invoice.invoiceNumber}</Link>
                      <p className="mt-1 text-sm text-[var(--muted)]">{invoice.customer?.name ?? "Walk-in customer"} · {invoice.issuedAt?.toLocaleDateString("en-US") ?? "Not dated"}</p>
                    </div>
                    <div className="text-right"><p className="font-medium">{formatUsd(invoice.totalCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{invoice.status}</p></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-[#cbd8cf] bg-white p-6 text-sm text-[var(--muted)] shadow-sm">No invoices have been created for this shop.</p>
            )}
          </section>
          <section className="order-1">
            <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--forest)]">New document</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{draft ? `Edit draft ${draft.invoiceNumber}` : "Create invoice"}</h2><p className="mt-1 text-sm text-[var(--muted)]">Add a customer and invoice items, then review the total.</p></div>
          <InvoiceForm shopId={shopId} initialRequestId={randomUUID()} customers={options.customers} products={options.products} defaults={options.defaults} draft={draft} />
          </section>
        </div>
        {options.customers.length === 100 || options.products.length === 100 ? <p className="mt-5 text-xs text-[var(--muted)]">Product and customer selectors currently show at most 100 records.</p> : null}
      </div>
    </main>
  );
}
