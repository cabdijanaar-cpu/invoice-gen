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
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <Link href="/dashboard" className="text-sm font-medium text-[var(--forest)]">← Your shops</Link>
        <header className="mt-5 border-b border-[var(--line)] pb-5">
          <p className="text-sm text-[var(--muted)]">{membership.shop.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">Invoices</h1>
        </header>
        <div className="mt-6 grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
          <section>
            <h2 className="mb-3 font-semibold">Recent invoices <span className="text-sm font-normal text-[var(--muted)]">(up to 100)</span></h2>
            {invoices.length ? (
              <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white">
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
              <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">No invoices have been created for this shop.</p>
            )}
          </section>
          <section>
            <h2 className="mb-3 font-semibold">{draft ? `Edit draft ${draft.invoiceNumber}` : "Create invoice"}</h2>
          <InvoiceForm shopId={shopId} initialRequestId={randomUUID()} customers={options.customers} products={options.products} defaults={options.defaults} draft={draft} />
          </section>
        </div>
        {options.customers.length === 100 || options.products.length === 100 ? <p className="mt-5 text-xs text-[var(--muted)]">Product and customer selectors currently show at most 100 records.</p> : null}
      </div>
    </main>
  );
}
