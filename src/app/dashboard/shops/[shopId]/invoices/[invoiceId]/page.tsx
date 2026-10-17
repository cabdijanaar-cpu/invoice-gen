import Link from "next/link";
import Image from "next/image";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { getShopInvoice } from "@/server/shops/invoices";
import { requireShopMembership } from "@/server/auth/session";
import { PrintButton } from "../print-button";
import { PaymentForm } from "./payment-form";
import { ReversePaymentForm } from "./reverse-payment-form";
import { VoidInvoiceForm } from "./void-invoice-form";
import { RefundPaymentForm } from "./refund-payment-form";

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ shopId: string; invoiceId: string }> }) {
  const { shopId, invoiceId } = await params;
  const [{ membership }, invoice] = await Promise.all([requireShopMembership(shopId), getShopInvoice(shopId, invoiceId)]);
  if (!invoice) notFound();
  const paidCents = invoice.payments.reduce((sum, payment) => sum + (payment.status === "POSTED" ? payment.amountCents : 0), 0);
  const balanceCents = invoice.status === "VOID" ? 0 : Math.max(0, invoice.totalCents - paidCents);

  return (
    <main className="min-h-screen bg-[var(--surface)] px-5 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/dashboard/shops/${shopId}/invoices`} className="text-sm font-medium text-[var(--forest)]">← Invoices</Link>
          <div className="flex items-center gap-3">{invoice.status === "DRAFT" && <Link href={`/dashboard/shops/${shopId}/invoices?draft=${invoiceId}`} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium">Edit draft</Link>}<a href={`/dashboard/shops/${shopId}/invoices/${invoiceId}/pdf`} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium">Download PDF</a><a target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Invoice ${invoice.invoiceNumber} · Total ${formatUsd(invoice.totalCents)} · Balance due ${formatUsd(balanceCents)}`)}`} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium">Share WhatsApp</a><PrintButton /></div>
        </div>
        <article className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:shadow-none">
          <header className="flex flex-wrap justify-between gap-8 border-b border-[var(--line)] pb-7">
            <div>
              {invoice.shop.settings?.logoKey && <Image src={`/dashboard/shops/${shopId}/settings/logo`} alt="" width={160} height={64} unoptimized className="mb-3 h-16 w-auto max-w-40 object-contain" />}
              <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: invoice.shop.settings?.primaryColor || "var(--forest)" }}>{invoice.shop.settings?.legalName || invoice.shop.name}</p>
              {invoice.shop.settings?.address && <p className="mt-2 text-sm text-[var(--muted)]">{invoice.shop.settings.address}</p>}
              {invoice.shop.settings?.phone && <p className="text-sm text-[var(--muted)]">{invoice.shop.settings.phone}</p>}
              {invoice.shop.settings?.email && <p className="text-sm text-[var(--muted)]">{invoice.shop.settings.email}</p>}
              {invoice.shop.settings?.website && <p className="text-sm text-[var(--muted)]">{invoice.shop.settings.website}</p>}
            </div>
            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-semibold tracking-tight">INVOICE</h1>
              <p className="mt-2 font-medium">{invoice.invoiceNumber}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Issued {invoice.issuedAt?.toLocaleDateString("en-US")}</p>
              {invoice.dueAt && <p className="text-sm text-[var(--muted)]">Due {invoice.dueAt.toLocaleDateString("en-US")}</p>}
            </div>
          </header>

          <section className="grid gap-5 py-7 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Bill to</p>
              <p className="mt-2 font-medium">{invoice.customer?.name ?? "Walk-in customer"}</p>
              {invoice.customer?.address && <p className="text-sm text-[var(--muted)]">{invoice.customer.address}</p>}
              {invoice.customer?.email && <p className="text-sm text-[var(--muted)]">{invoice.customer.email}</p>}
              {invoice.customer?.phone && <p className="text-sm text-[var(--muted)]">{invoice.customer.phone}</p>}
            </div>
            <div className="sm:text-right"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</p><p className="mt-2 font-medium">{invoice.status}</p>{invoice.voidedAt && <p className="mt-1 text-xs text-red-800">Voided {invoice.voidedAt.toLocaleString("en-US")}: {invoice.voidReason}</p>}</div>
          </section>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-[var(--line)] text-xs uppercase tracking-wide text-[var(--muted)]"><th className="py-3 pr-3">Description</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3 text-right">Discount</th><th className="pl-3 py-3 text-right">Total</th></tr></thead>
              <tbody>{invoice.items.map((item, index) => <tr key={index} className="border-b border-[var(--line)]"><td className="py-4 pr-3"><p className="font-medium">{item.description}</p>{item.skuSnapshot && <p className="mt-1 text-xs text-[var(--muted)]">{item.skuSnapshot}</p>}</td><td className="px-3 py-4 text-right">{(item.quantityMilli / 1_000).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td><td className="px-3 py-4 text-right">{formatUsd(item.unitPriceCents)}</td><td className="px-3 py-4 text-right">{formatUsd(item.discountCents)}</td><td className="pl-3 py-4 text-right font-medium">{formatUsd(item.lineTotalCents)}</td></tr>)}</tbody>
            </table>
          </div>

          <section className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-[var(--muted)]">Subtotal</span><span>{formatUsd(invoice.subtotalCents)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Discount</span><span>−{formatUsd(invoice.discountCents)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Tax</span><span>{formatUsd(invoice.taxCents)}</span></div>
            <div className="flex justify-between border-t border-[var(--line)] pt-3 text-base font-semibold"><span>Total</span><span>{formatUsd(invoice.totalCents)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--muted)]">Paid</span><span>{formatUsd(paidCents)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance due</span><span>{formatUsd(balanceCents)}</span></div>
            <p className="text-right text-xs text-[var(--muted)]">All amounts in {invoice.currency}</p>
          </section>
          {invoice.shop.settings?.footer && <p className="mt-8 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">{invoice.shop.settings.footer}</p>}
          <section className="mt-8 border-t border-[var(--line)] pt-6 print:hidden">
            <h2 className="text-lg font-semibold">Payments</h2>
            {invoice.payments.length ? <ul className="mt-3 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
              {invoice.payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <span>{payment.paidAt.toLocaleString("en-US")} · {payment.method === "REFUND" ? "Refund" : payment.method.replaceAll("_", " ")}{payment.method !== "REFUND" && payment.reference ? ` · ${payment.reference}` : ""}{payment.status === "REVERSED" ? <span className="ml-2 font-semibold text-red-800">REVERSED</span> : null}{payment.notes ? <span className="block text-xs text-[var(--muted)]">{payment.notes}</span> : null}{payment.reversalReason ? <span className="block text-xs text-red-800">Reason: {payment.reversalReason}{payment.reversedAt ? ` · ${payment.reversedAt.toLocaleString("en-US")}` : ""}</span> : null}
                  {payment.status === "POSTED" && (membership.role === "SHOP_OWNER" || membership.role === "MANAGER") ? <><ReversePaymentForm shopId={shopId} invoiceId={invoiceId} paymentId={payment.id} />{payment.amountCents > 0 && payment.method !== "REFUND" && invoice.status === "FINALIZED" ? <RefundPaymentForm shopId={shopId} invoiceId={invoiceId} paymentId={payment.id} initialRequestId={randomUUID()} /> : null}</> : null}</span>
                <strong className="text-right">{formatUsd(payment.amountCents)}{payment.status === "POSTED" && <Link href={`/dashboard/shops/${shopId}/invoices/${invoiceId}/payments/${payment.id}/receipt`} className="mt-1 block text-xs font-normal text-[var(--forest)] underline">{payment.method === "REFUND" ? "Refund receipt" : "Receipt"}</Link>}</strong>
              </li>)}
            </ul> : <p className="mt-2 text-sm text-[var(--muted)]">No payments recorded yet.</p>}
            {invoice.status === "FINALIZED" && balanceCents > 0 ? <PaymentForm shopId={shopId} invoiceId={invoiceId} balanceCents={balanceCents} initialRequestId={randomUUID()} /> : null}
          </section>
          {invoice.notes && <p className="mt-8 border-t border-[var(--line)] pt-5 text-sm text-[var(--muted)]">{invoice.notes}</p>}
          {invoice.status === "FINALIZED" && (membership.role === "SHOP_OWNER" || membership.role === "MANAGER") ? <VoidInvoiceForm shopId={shopId} invoiceId={invoiceId} /> : null}
        </article>
      </div>
    </main>
  );
}
