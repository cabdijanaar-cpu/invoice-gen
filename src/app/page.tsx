import Link from "next/link";

const modules = ["Invoices", "Customers", "Products & stock", "Reports"];

export default function HomePage() {
  return (
    <main className="min-h-screen px-5 py-8 sm:px-10 lg:px-16">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link className="flex items-center gap-3 font-semibold tracking-tight" href="/" aria-label="Invoice Generator home">
          <span className="grid size-10 place-items-center rounded-xl bg-[var(--forest)] text-lg text-white">i</span>
          <span>Invoice<span className="text-[var(--forest)]">Flow</span></span>
        </Link>
        <span className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--muted)]">Multi-store workspace</span>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
        <div>
          <p className="mb-5 inline-flex rounded-full bg-[#edf6df] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--forest)]">One workspace for your business</p>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">Invoices and daily operations, <span className="text-[var(--forest)]">kept in order.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--muted)]">A multi-store platform for creating invoices, following customer balances, and keeping an eye on inventory.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-xl bg-[var(--forest)] px-5 py-3 font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">Sign in <span aria-hidden="true">→</span></Link>
            <Link href="/register" className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 font-medium">Create an account</Link>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)]">English · USD · Built for independent shops</p>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-white p-5 shadow-[0_24px_80px_-48px_rgba(21,61,44,0.4)] sm:p-7" aria-label="Product overview">
          <div className="flex items-start justify-between border-b border-[var(--line)] pb-5">
            <div><p className="text-sm text-[var(--muted)]">Workspace preview</p><h2 className="mt-1 text-xl font-semibold">Your shop, at a glance</h2></div>
            <span className="rounded-lg bg-[#edf6df] px-3 py-1.5 text-xs font-medium text-[var(--forest)]">USD</span>
          </div>
          <div className="grid grid-cols-2 gap-3 py-5">
            {["Invoices", "Customers", "Products & stock", "Reports"].map((item, index) => (
              <div className="rounded-2xl bg-[var(--surface)] p-4" key={item}>
                <div className="mb-5 grid size-9 place-items-center rounded-xl bg-white text-xs font-semibold text-[var(--forest)]">{String(index + 1).padStart(2, "0")}</div>
                <p className="font-medium">{item}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Shop-scoped workspace</p>
              </div>
            ))}
          </div>
          <p className="rounded-xl border border-dashed border-[var(--line)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">Workspace preview only. Business figures will appear after secure sign-in and are backed by your shop’s records.</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] py-6 text-sm text-[var(--muted)]">
        <span>InvoiceFlow</span><nav className="flex gap-5" aria-label="Footer">{modules.map((module) => <span key={module}>{module}</span>)}</nav>
      </footer>
    </main>
  );
}
