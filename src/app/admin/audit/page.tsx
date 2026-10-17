import Link from "next/link";
import { getPlatformAuditLog } from "@/server/platform/admin";

type SearchParams = { page?: string; action?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const requestedPage = Number(query.page ?? "1");
  const data = await getPlatformAuditLog(requestedPage, query.action ?? "");
  const linkFor = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });
    if (data.action) params.set("action", data.action);
    return `/admin/audit?${params.toString()}`;
  };

  return <main className="min-h-screen px-5 py-8 sm:px-10"><div className="mx-auto max-w-7xl">
    <header className="border-b border-[var(--line)] pb-5">
      <Link href="/admin" className="text-sm text-[var(--forest)]">← Platform administration</Link>
      <h1 className="mt-3 text-3xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Read-only record of platform and shop changes.</p>
    </header>
    <form className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
      <label className="text-sm">Filter by action<input name="action" maxLength={80} defaultValue={data.action} placeholder="e.g. SHOP_STATUS_CHANGED" className="mt-1 block w-72 max-w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
      <button className="rounded-lg bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Filter</button>
      <span className="text-sm text-[var(--muted)]">{data.total} events</span>
    </form>
    <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      {data.events.length ? <ol className="divide-y divide-[var(--line)]">{data.events.map((event) => <li key={event.id} className="grid gap-2 px-4 py-4 sm:grid-cols-[12rem_1fr] sm:px-5">
        <time className="text-sm text-[var(--muted)]" dateTime={event.createdAt.toISOString()}>{event.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</time>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="text-sm">{event.action}</strong><span className="text-xs text-[var(--muted)]">{event.entityType}{event.entityId ? ` · ${event.entityId}` : ""}</span></div>
          <p className="mt-1 break-words text-sm">{event.summary || "No summary recorded."}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{event.actor ? `${event.actor.name} (${event.actor.email})` : "System or deleted account"}{event.shop ? ` · ${event.shop.name}` : " · Platform"}</p>
        </div>
      </li>)}</ol> : <p className="p-6 text-sm text-[var(--muted)]">No audit events match this filter.</p>}
    </section>
    <nav aria-label="Audit log pages" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-[var(--muted)]">Page {data.page} of {data.pages}</span>
      <div className="flex gap-2">{data.page > 1 && <Link className="rounded-lg border border-[var(--line)] px-3 py-2" href={linkFor(data.page - 1)}>Previous</Link>}{data.page < data.pages && <Link className="rounded-lg border border-[var(--line)] px-3 py-2" href={linkFor(data.page + 1)}>Next</Link>}</div>
    </nav>
  </div></main>;
}
