import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopCustomerHistory } from "@/server/shops/customers";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function CustomerHistoryPage({ params }: { params: Promise<{ shopId: string; customerId: string }> }) {
  const { shopId, customerId } = await params;
  const customer = await getShopCustomerHistory(shopId, customerId);
  if (!customer) notFound();

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href={`/dashboard/shops/${shopId}/customers`} className="text-sm font-medium text-[var(--forest)]">← Customers</Link>
        <header className="mt-5 border-b border-[var(--line)] pb-5">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{customer.name}</h1>{customer.status === "ARCHIVED" && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">Archived</span>}</div>
          <p className="mt-1 text-sm text-[var(--muted)]">{customer.email || "No email"}{customer.phone ? ` · ${customer.phone}` : ""}</p>
        </header>
        <section aria-label="Customer totals" className="mt-6 grid gap-3 sm:grid-cols-3">
          {[["Finalized invoices", money(customer.totalInvoicedCents)], ["Payments collected", money(customer.totalCollectedCents)], ["Outstanding balance", money(customer.balanceCents)]].map(([label, value]) => <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}
        </section>
        <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-semibold">Invoice and payment history</h2>
          {customer.invoices.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Date</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 text-right">Paid</th></tr></thead><tbody>{customer.invoices.map((invoice) => {
            const paidCents = invoice.payments.reduce((sum, payment) => sum + (payment.status === "POSTED" ? payment.amountCents : 0), 0);
            return <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 pr-3"><Link href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`} className="font-medium text-[var(--forest)]">{invoice.invoiceNumber}</Link></td><td className="py-3 pr-3">{invoice.issuedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(invoice.issuedAt) : "—"}</td><td className="py-3 pr-3 text-right">{money(invoice.totalCents)}</td><td className="py-3 text-right">{money(paidCents)}</td></tr>;
          })}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No finalized invoices for this customer.</p>}
        </section>
        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5">
          <h2 className="font-semibold">Payment history</h2>
          {customer.payments.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Method / reference</th><th className="py-2 pr-3">Status / reason</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{customer.payments.map((payment) => <tr key={payment.id} className="border-b last:border-0"><td className="py-3 pr-3">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(payment.paidAt)}</td><td className="py-3 pr-3">{payment.invoiceNumber}</td><td className="py-3 pr-3">{payment.method.replaceAll("_", " ")}{payment.reference ? <span className="block text-xs text-[var(--muted)]">{payment.reference}</span> : null}</td><td className="py-3 pr-3">{payment.status}{payment.reversalReason ? <span className="block max-w-xs text-xs text-red-800">{payment.reversalReason}{payment.reversedAt ? ` · ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(payment.reversedAt)}` : ""}</span> : null}</td><td className="py-3 text-right">{money(payment.amountCents)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No payments recorded for this customer.</p>}
        </section>
      </div>
    </main>
  );
}
