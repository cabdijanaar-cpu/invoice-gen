import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { requireUser } from "@/server/auth/session";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white bg-white px-5 py-6 shadow-sm sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest)]">InvoiceFlow workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome, {user.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Choose a shop to continue your work.</p>
          </div>
          <div className="flex items-center gap-3">{user.globalRole === "SUPER_ADMIN" && <Link href="/admin" className="rounded-xl bg-[var(--forest)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm">Platform admin</Link>}<form action={logoutAction}><button className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--forest)] shadow-sm">Sign out</button></form></div>
        </header>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">Your shops</h2><p className="mt-1 text-sm text-[var(--muted)]">Open a workspace or jump straight into a task.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)] shadow-sm">{user.memberships.length} {user.memberships.length === 1 ? "shop" : "shops"}</span></div>
          {user.memberships.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {user.memberships.map((membership) => (
                <li className="rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" key={membership.id}>
                  <Link href={`/dashboard/shops/${membership.shopId}`} className="text-lg font-semibold tracking-tight text-[var(--forest)]">{membership.shop.name}</Link>
                  <p className="mt-1 text-sm capitalize text-[var(--muted)]">{membership.role.replaceAll("_", " ").toLowerCase()} workspace</p>
                  <nav className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/dashboard/shops/${membership.shopId}/customers`} className="inline-flex rounded-lg bg-[#edf6df] px-3 py-2 text-sm font-medium text-[var(--forest)]">Customers</Link>
                    <Link href={`/dashboard/shops/${membership.shopId}/products`} className="inline-flex rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium">Products &amp; stock</Link>
                    <Link href={`/dashboard/shops/${membership.shopId}/invoices`} className="inline-flex rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium">Invoices</Link>
                  </nav>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-white p-6 text-sm text-[var(--muted)]">No active shops are linked to this account.</p>
          )}
        </section>

        <p className="mt-8 rounded-xl bg-[#edf6df] px-4 py-3 text-sm leading-6 text-[var(--forest)]">Shop dashboards show finalized sales, posted payments, expenses, outstanding balances, and low stock from the database. Customers, products, stock adjustments, and invoice workflows are available within each shop.</p>
      </div>
    </main>
  );
}
