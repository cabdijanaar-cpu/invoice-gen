import Link from "next/link";
import { requireShopMembership } from "@/server/auth/session";
import { getShopDashboardStats } from "@/server/shops/dashboard";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function ShopDashboardPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const { membership } = await requireShopMembership(shopId);
  const stats = await getShopDashboardStats(shopId);
  const metrics = [
    ["Finalized sales", money(stats.totalSalesCents)],
    ["Payments collected", money(stats.collectedCents)],
    ["Outstanding balance", money(stats.outstandingCents)],
    ["Recorded expenses", money(stats.expenseCents)],
    ["Finalized invoices", String(stats.invoiceCount)],
    ["Low stock products", String(stats.lowStockCount)],
  ];

  return <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="text-sm font-medium text-[var(--forest)] hover:underline">← All shops</Link>
    <header className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-white bg-white px-5 py-6 shadow-sm sm:px-7">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest)]">Shop overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{membership.shop.name}</h1><p className="mt-1 text-sm text-[var(--muted)]">Your business at a glance</p></div>
      <span className="rounded-full bg-[#edf6df] px-3 py-1.5 text-xs font-semibold capitalize text-[var(--forest)]">{membership.role.replaceAll("_", " ").toLowerCase()}</span>
    </header>
    <section aria-label="Shop metrics" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(([label, value], index) => <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm"><p className="text-sm font-medium text-[var(--muted)]">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-tight ${index === 2 || index === 5 ? "text-[var(--forest)]" : "text-[var(--ink)]"}`}>{value}</p></article>)}
    </section>
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="min-h-52 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="font-semibold tracking-tight">Recent finalized invoices</h2>
        {stats.recentInvoices.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Date</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{stats.recentInvoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 pr-3"><Link className="font-medium text-[var(--forest)]" href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></td><td className="py-3 pr-3">{invoice.customer?.name ?? "Archived customer"}</td><td className="py-3 pr-3">{invoice.issuedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(invoice.issuedAt) : "—"}</td><td className="py-3 text-right">{money(invoice.totalCents)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No finalized invoices yet.</p>}
      </section>
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6"><h2 className="font-semibold tracking-tight">Shop operations</h2><p className="mt-1 text-sm text-[var(--muted)]">Tools for running your shop</p><nav className="mt-4 grid gap-2">{[["Customers", "customers"], ["Products & stock", "products"], ["Invoices", "invoices"], ["Quotations", "quotations"], ["Expenses", "expenses"], ["Reports & CSV", "reports"], ["Branding & settings", "settings"], ...(membership.role === "SHOP_OWNER" || membership.canManageUsers ? [["Staff & permissions", "users"]] : []), ...(membership.role === "SHOP_OWNER" ? [["Subscription", "subscription"]] : [])].map(([label, route]) => <Link key={route} href={`/dashboard/shops/${shopId}/${route}`} className="group flex items-center justify-between rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-4 py-3 text-sm font-medium transition hover:border-[#b7cbbd] hover:bg-[#edf6df]"><span>{label}</span><span aria-hidden="true" className="text-[var(--muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--forest)]">→</span></Link>)}</nav></section>
    </div>
    <p className="mt-6 text-xs leading-5 text-[var(--muted)]">Sales include finalized invoices; collected payments and expenses include posted records. Profit is not shown because cost-of-goods and refund policies are not yet implemented.</p>
  </div></main>;
}
