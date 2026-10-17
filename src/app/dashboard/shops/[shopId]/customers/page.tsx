import Link from "next/link";
import { CustomerForm } from "./customer-form";
import { listShopCustomers } from "@/server/shops/customers";
import { requireShopMembership } from "@/server/auth/session";
import { CustomerManagement } from "./customer-management";

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ q?: string; page?: string }> }) {
  const { shopId } = await params;
  const query = await searchParams;
  const search = (query.q ?? "").slice(0, 100);
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { membership } = await requireShopMembership(shopId);
  const result = await listShopCustomers(shopId, search, page);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const customers = page > pageCount ? (await listShopCustomers(shopId, search, pageCount)).customers : result.customers;
  const activePage = Math.min(page, pageCount);
  const canManage = membership.role === "SHOP_OWNER" || membership.canManageCustomers;

  return (
    <main className="min-h-screen px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex gap-4 text-sm font-medium text-[var(--forest)]"><Link href="/dashboard">← Your shops</Link><Link href={`/dashboard/shops/${shopId}/invoices`}>Invoices</Link><Link href={`/dashboard/shops/${shopId}/products`}>Products</Link></div>
        <header className="mt-5 border-b border-[var(--line)] pb-5">
          <p className="text-sm text-[var(--muted)]">{membership.shop.name}</p>
          <h1 className="mt-1 text-2xl font-semibold">Customers</h1>
        </header>
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          {canManage ? <CustomerForm shopId={shopId} /> : <p className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">You can view customers but do not have permission to add them.</p>}
          <section>
            <h2 className="mb-3 font-semibold">Customer list <span className="text-sm font-normal text-[var(--muted)]">({result.total} found)</span></h2>
            <form className="mb-3 flex gap-2" role="search">
              <label className="sr-only" htmlFor="customer-search">Search customers</label>
              <input id="customer-search" name="q" defaultValue={search} placeholder="Search name, email, or phone" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm" />
              <button className="rounded-xl bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Search</button>
            </form>
            {customers.length ? (
              <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white">
                {customers.map((customer) => (
                  <li key={customer.id} className="flex flex-wrap justify-between gap-2 px-4 py-4">
                    <div><Link href={`/dashboard/shops/${shopId}/customers/${customer.id}`} className="font-medium text-[var(--forest)] hover:underline">{customer.name}</Link><p className="mt-1 text-sm text-[var(--muted)]">{customer.email || "No email"}{customer.phone ? ` · ${customer.phone}` : ""}</p></div>
                    <time className="text-xs text-[var(--muted)]">{customer.createdAt.toLocaleDateString("en-US")}</time>
                    {canManage && <CustomerManagement shopId={shopId} customer={customer} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">{search ? "No customers match your search." : "No customers have been added to this shop."}</p>
            )}
            {result.total > result.pageSize && <nav aria-label="Customer pages" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">Page {activePage} of {pageCount}</span>
              {activePage > 1 ? <Link className="font-medium text-[var(--forest)]" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(activePage - 1) })}`}>Previous</Link> : <span />}
              {activePage < pageCount && <Link className="font-medium text-[var(--forest)]" href={`?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(activePage + 1) })}`}>Next</Link>}
            </nav>}
          </section>
        </div>
      </div>
    </main>
  );
}
