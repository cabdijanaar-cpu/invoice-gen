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

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-6xl">
    <Link href="/dashboard" className="text-sm text-[var(--forest)]">All shops</Link>
    <header className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
      <div><p className="text-sm text-[var(--muted)]">Shop dashboard</p><h1 className="mt-1 text-3xl font-semibold">{membership.shop.name}</h1></div>
      <span className="rounded-full bg-[#edf6df] px-3 py-1 text-sm text-[var(--forest)]">{membership.role.replaceAll("_", " ")}</span>
    </header>
    <section aria-label="Shop metrics" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(([label, value]) => <article key={label} className="rounded-2xl border border-[var(--line)] bg-white p-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></article>)}
    </section>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5">
        <h2 className="font-semibold">Recent finalized invoices</h2>
        {stats.recentInvoices.length ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-[var(--muted)]"><th className="py-2 pr-3">Invoice</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">Date</th><th className="py-2 text-right">Total</th></tr></thead><tbody>{stats.recentInvoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0"><td className="py-3 pr-3"><Link className="font-medium text-[var(--forest)]" href={`/dashboard/shops/${shopId}/invoices/${invoice.id}`}>{invoice.invoiceNumber}</Link></td><td className="py-3 pr-3">{invoice.customer?.name ?? "Archived customer"}</td><td className="py-3 pr-3">{invoice.issuedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(invoice.issuedAt) : "—"}</td><td className="py-3 text-right">{money(invoice.totalCents)}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[var(--muted)]">No finalized invoices yet.</p>}
      </section>
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5"><h2 className="font-semibold">Shop operations</h2><nav className="mt-4 grid gap-2">{[["Customers", "customers"], ["Products & stock", "products"], ["Invoices", "invoices"], ["Quotations", "quotations"], ["Expenses", "expenses"], ["Reports & CSV", "reports"], ["Branding & settings", "settings"], ...(membership.role === "SHOP_OWNER" || membership.canManageUsers ? [["Staff & permissions", "users"]] : []), ...(membership.role === "SHOP_OWNER" ? [["Subscription", "subscription"]] : [])].map(([label, route]) => <Link key={route} href={`/dashboard/shops/${shopId}/${route}`} className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium hover:bg-[#f7f9f6]">{label} · Open</Link>)}</nav></section>
    </div>
    <p className="mt-6 text-xs leading-5 text-[var(--muted)]">Sales include finalized invoices; collected payments and expenses include posted records. Profit is not shown because cost-of-goods and refund policies are not yet implemented.</p>
  </div></main>;
}
