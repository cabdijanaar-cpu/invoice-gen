import Link from "next/link";
import { requireShopMembership } from "@/server/auth/session";
import { getShopDashboardStats } from "@/server/shops/dashboard";
import { reportRange } from "@/server/shops/reports";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ShopDashboardPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const { shopId } = await params;
  const query = await searchParams;
  const { membership } = await requireShopMembership(shopId);
  const isOwner = membership.role === "SHOP_OWNER";
  const canManageCustomers = isOwner || membership.canManageCustomers;
  const canManageProducts = isOwner || membership.canManageProducts;
  const canManageSettings = isOwner || membership.canManageSettings;
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const range = reportRange(query.from ?? defaultFrom, query.to ?? defaultTo);
  const stats = await getShopDashboardStats(shopId, range.fromText, range.toText);
  const metrics = [
    ["Finalized sales", money(stats.totalSalesCents)],
    ["Payments collected", money(stats.collectedCents)],
    ["Outstanding balance", money(stats.outstandingCents)],
    ["Recorded expenses", money(stats.expenseCents)],
    ["Finalized invoices", String(stats.invoiceCount)],
    ["Low stock products", String(stats.lowStockCount)],
  ];
  const maxSales = Math.max(0, ...stats.monthlySales.map((month) => month.salesCents));
  const formatMonth = (month: string) => new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00.000Z`));

  return <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="text-sm font-medium text-[var(--forest)] hover:underline">← All shops</Link>
    <header className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-white bg-white px-5 py-6 shadow-sm sm:px-7">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest)]">Shop overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{membership.shop.name}</h1><p className="mt-1 text-sm text-[var(--muted)]">Your business at a glance</p></div>
      <span className="rounded-full bg-[#edf6df] px-3 py-1.5 text-xs font-semibold capitalize text-[var(--forest)]">{membership.role.replaceAll("_", " ").toLowerCase()}</span>
    </header>
    <section aria-label="Shop metrics" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(([label, value], index) => <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"><p className="text-sm font-medium text-[var(--muted)]">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-tight ${index === 2 || index === 5 ? "text-[var(--forest)]" : "text-[var(--ink)]"}`}>{value}</p></article>)}
    </section>
    <section aria-labelledby="sales-trend-title" className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 id="sales-trend-title" className="font-semibold tracking-tight">Sales trend</h2><p className="mt-1 text-sm text-[var(--muted)]">Finalized invoice sales by month for this shop.</p></div>
        <form className="flex flex-wrap items-end gap-2" aria-label="Filter sales trend by date">
          <label className="text-xs font-medium text-[var(--muted)]">From<input aria-label="From date" type="date" name="from" defaultValue={range.fromText} className="mt-1 block rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]" /></label>
          <label className="text-xs font-medium text-[var(--muted)]">To<input aria-label="To date" type="date" name="to" defaultValue={range.toText} className="mt-1 block rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]" /></label>
          <button className="rounded-lg bg-[var(--forest)] px-3 py-2 text-sm font-medium text-white">Apply</button>
        </form>
      </div>
      {stats.monthlySales.length ? <div className="mt-6 overflow-x-auto pb-1"><div className="grid min-w-[620px] grid-flow-col auto-cols-fr items-end gap-3" role="list" aria-label="Monthly finalized sales">
        {stats.monthlySales.map((month) => <div key={month.month} role="listitem" aria-label={`${formatMonth(month.month)}: ${money(month.salesCents)}, ${month.invoiceCount} invoices`} className="flex min-w-0 flex-col items-center gap-2 text-center">
          <span className="text-xs font-medium text-[var(--ink)]">{money(month.salesCents)}</span>
          <div aria-hidden="true" className="flex h-32 w-full items-end justify-center rounded-t-lg bg-[var(--surface)]"><div className="w-1/2 rounded-t-md bg-[var(--forest)]" style={{ height: maxSales ? `${Math.max(3, (month.salesCents / maxSales) * 112)}px` : "0px" }} /></div>
          <span className="text-xs text-[var(--muted)]">{formatMonth(month.month)}</span>
        </div>)}
      </div></div> : <p className="mt-5 rounded-xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">No finalized invoice sales in this period.</p>}
    </section>
    <section aria-label="Quick actions" className="mt-6 grid gap-3 sm:grid-cols-3">
      {[["Create invoice", "invoices"], ...(canManageCustomers ? [["Add customer", "customers"]] : []), ...(canManageProducts ? [["Manage products", "products"]] : [])].map(([label, route]) => <Link key={route} href={`/dashboard/shops/${shopId}/${route}`} className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--forest)] shadow-sm hover:bg-[#edf6df]">{label} <span aria-hidden="true">→</span></Link>)}
    </section>
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="min-h-52 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold tracking-tight">Recent finalized invoices</h2>
        {stats.recentInvoices.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Date</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{stats.recentInvoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 pr-3"><Link className="font-medium text-[var(--forest)]" href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></td><td className="py-3 pr-3">{invoice.customer?.name ?? "Archived customer"}</td><td className="py-3 pr-3">{invoice.issuedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(invoice.issuedAt) : "—"}</td><td className="py-3 text-right">{money(invoice.totalCents)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No finalized invoices yet.</p>}
      </section>
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6"><h2 className="font-semibold tracking-tight">Shop operations</h2><p className="mt-1 text-sm text-[var(--muted)]">Tools for running your shop</p><nav className="mt-4 grid gap-2">{[["Customers", "customers"], ["Products & stock", "products"], ["Invoices", "invoices"], ["Payments & debts", "payments"], ["Quotations", "quotations"], ["Expenses", "expenses"], ...(isOwner || membership.canViewReports ? [["Reports & CSV", "reports"]] : []), ...(canManageSettings ? [["Branding & settings", "settings"]] : []), ...(isOwner || membership.canManageUsers ? [["Staff & permissions", "users"]] : []), ...(isOwner ? [["Subscription", "subscription"]] : [])].map(([label, route]) => <Link key={route} href={`/dashboard/shops/${shopId}/${route}`} className="group flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-4 py-3 text-sm font-medium transition hover:border-[#b7cbbd] hover:bg-[#edf6df]"><span>{label}</span><span aria-hidden="true" className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]">→</span></Link>)}</nav></section>
    </div>
    <p className="mt-6 text-xs leading-5 text-[var(--muted)]">Sales include finalized invoices; collected payments and expenses include posted records. Profit is not shown because cost-of-goods and refund policies are not yet implemented.</p>
  </div></main>;
}
