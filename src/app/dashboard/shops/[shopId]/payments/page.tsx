import Link from "next/link";
import { WorkspacePageHeader } from "../workspace-page-header";
import { getShopPaymentsOverview } from "@/server/shops/payments";
import { reportRange } from "@/server/shops/reports";
import { requireShopMembership } from "@/server/auth/session";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ shopId }, query] = await Promise.all([params, searchParams]);
  const { membership } = await requireShopMembership(shopId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const defaultFrom = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  const range = reportRange(query.from ?? defaultFrom, query.to ?? today);
  const overview = await getShopPaymentsOverview(shopId, range.from, range.to);

  return <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <WorkspacePageHeader shopName={membership.shop.name} title="Payments & debts" description="Review recorded collections and follow up on outstanding invoice balances." action={<Link href={`/dashboard/shops/${shopId}/invoices`} className="rounded-xl bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Create invoice</Link>} />
    <section aria-label="Payment and debt totals" className="mt-5 grid gap-3 sm:grid-cols-3">
      {[["Collected in period", money(overview.periodCollectedCents)], ["Outstanding balance", money(overview.outstandingCents)], ["Finalized invoices", String(overview.invoiceCount)]].map(([label, value]) => <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p></article>)}
    </section>
    <form aria-label="Filter payments by date" className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
      <label className="text-sm">From<input type="date" name="from" defaultValue={range.fromText} className="mt-1 block rounded-lg border border-[var(--line)] px-2 py-1.5" /></label>
      <label className="text-sm">To<input type="date" name="to" defaultValue={range.toText} className="mt-1 block rounded-lg border border-[var(--line)] px-2 py-1.5" /></label>
      <button className="rounded-lg bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Apply</button>
      <span className="text-xs text-[var(--muted)]">Up to one year per search.</span>
    </form>
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
      <section aria-labelledby="open-debts-title" className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 id="open-debts-title" className="font-semibold">Outstanding invoices</h2><p className="mt-1 text-sm text-[var(--muted)]">{overview.openInvoiceCount} open balances in the latest 100 finalized invoices.</p></div><span className="rounded-full bg-[#edf6df] px-3 py-1 text-xs font-semibold text-[var(--forest)]">{money(overview.outstandingCents)}</span></div>
        {overview.openInvoices.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-[var(--muted)]"><th className="py-2 pr-3">Invoice / customer</th><th className="py-2 pr-3">Date</th><th className="py-2 text-right">Due</th></tr></thead><tbody>{overview.openInvoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 pr-3"><Link href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`} className="font-medium text-[var(--forest)] hover:underline">{invoice.invoiceNumber}</Link><span className="block text-xs text-[var(--muted)]">{invoice.customerName}</span></td><td className="py-3 pr-3">{invoice.issuedAt?.toLocaleDateString("en-US") ?? "—"}</td><td className="py-3 text-right font-semibold">{money(invoice.balanceCents)}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">No outstanding invoices in the latest 100 records.</p>}
      </section>
      <section aria-labelledby="payment-history-title" className="rounded-2xl border border-[var(--line)] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><h2 id="payment-history-title" className="font-semibold">Payment history</h2><p className="mt-1 text-sm text-[var(--muted)]">{overview.periodPaymentCount} records in the selected period.</p></div>{(membership.role === "SHOP_OWNER" || membership.canViewReports) && <Link href={`/dashboard/shops/${shopId}/reports?from=${range.fromText}&to=${range.toText}`} className="text-sm font-medium text-[var(--forest)] underline">Reports</Link>}</div>
        {overview.payments.length ? <ul className="mt-4 divide-y divide-[var(--line)]">{overview.payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="font-medium">{payment.invoice ? <Link href={`/dashboard/shops/${shopId}/invoices/${payment.invoice.id}`} className="text-[var(--forest)] hover:underline">{payment.invoice.invoiceNumber}</Link> : "Unallocated payment"}<span className="font-normal text-[var(--muted)]"> · {payment.invoice?.customer?.name ?? "Customer not recorded"}</span></p><p className="mt-1 text-xs text-[var(--muted)]">{payment.paidAt.toLocaleDateString("en-US")} · {payment.method.replaceAll("_", " ")}{payment.reference ? ` · ${payment.reference}` : ""}</p></div><div className="text-right"><p className={`font-semibold ${payment.amountCents < 0 ? "text-amber-800" : "text-[var(--ink)]"}`}>{money(payment.amountCents)}</p><p className="mt-1 text-xs text-[var(--muted)]">{payment.status}</p></div></li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">No payment records in this period.</p>}
        {overview.hasMorePayments && <p className="mt-3 text-xs text-[var(--muted)]">Showing the latest 100 records. Narrow the date range to see fewer transactions.</p>}
      </section>
    </div>
    <p className="mt-5 text-xs leading-5 text-[var(--muted)]">Payment history includes posted refunds and reversed records. Balance summary is for this shop across all finalized invoices.</p>
  </div></main>;
}
