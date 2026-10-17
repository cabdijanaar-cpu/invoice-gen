import Link from "next/link";
import { notFound } from "next/navigation";
import { getShopInvoice } from "@/server/shops/invoices";
import { PrintButton } from "../../../../print-button";

function usd(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function PaymentReceiptPage({ params }: { params: Promise<{ shopId: string; invoiceId: string; paymentId: string }> }) {
  const { shopId, invoiceId, paymentId } = await params;
  const invoice = await getShopInvoice(shopId, invoiceId);
  const payment = invoice?.payments.find((item) => item.id === paymentId);
  if (!invoice || !payment) notFound();
  return <main className="min-h-screen bg-[var(--surface)] px-5 py-8 print:bg-white print:p-0"><div className="mx-auto max-w-xl">
    <div className="mb-5 flex items-center justify-between print:hidden"><Link href={`/dashboard/shops/${shopId}/invoices/${invoiceId}`} className="text-sm text-[var(--forest)]">← Invoice {invoice.invoiceNumber}</Link><PrintButton /></div>
    <article className="rounded-2xl border border-[var(--line)] bg-white p-8 print:rounded-none print:border-0">
      <p className="text-sm font-semibold uppercase tracking-widest text-[var(--forest)]">{invoice.shop.settings?.legalName || invoice.shop.name}</p>
      <h1 className="mt-7 text-2xl font-semibold">{payment.method === "REFUND" ? "REFUND RECEIPT" : "PAYMENT RECEIPT"}</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">{payment.paidAt.toLocaleString("en-US")}</p>
      <dl className="mt-7 space-y-3 border-y border-[var(--line)] py-5 text-sm"><div className="flex justify-between gap-3"><dt>Invoice</dt><dd>{invoice.invoiceNumber}</dd></div><div className="flex justify-between gap-3"><dt>Customer</dt><dd>{invoice.customer?.name ?? "Walk-in customer"}</dd></div><div className="flex justify-between gap-3"><dt>Method</dt><dd>{payment.method.replaceAll("_", " ")}</dd></div><div className="flex justify-between gap-3"><dt>Status</dt><dd>{payment.status}</dd></div>{payment.reference && payment.method !== "REFUND" && <div className="flex justify-between gap-3"><dt>Reference</dt><dd>{payment.reference}</dd></div>}{payment.notes && <div><dt className="text-[var(--muted)]">Notes</dt><dd className="mt-1">{payment.notes}</dd></div>}<div className="flex justify-between gap-3 border-t border-[var(--line)] pt-4 text-lg font-semibold"><dt>{payment.method === "REFUND" ? "Refund amount" : "Amount received"}</dt><dd>{usd(Math.abs(payment.amountCents))}</dd></div></dl>
      <p className="mt-6 text-sm text-[var(--muted)]">Invoice total {usd(invoice.totalCents)} · Balance due {usd(invoice.status === "VOID" ? 0 : Math.max(0, invoice.totalCents - invoice.payments.reduce((sum, row) => sum + (row.status === "POSTED" ? row.amountCents : 0), 0)))}</p>
    </article>
  </div></main>;
}
