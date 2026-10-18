import "server-only";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";

export async function getShopPaymentsOverview(shopId: string, from: Date, to: Date) {
  await requireShopMembership(shopId);
  const paidAt = { gte: from, lt: to };
  const [invoiceTotals, collectedTotals, periodTotals, periodPaymentCount, payments, invoices] = await Promise.all([
    db.invoice.aggregate({ where: { shopId, status: "FINALIZED" }, _sum: { totalCents: true }, _count: { _all: true } }),
    db.customerPayment.aggregate({ where: { shopId, status: "POSTED" }, _sum: { amountCents: true } }),
    db.customerPayment.aggregate({ where: { shopId, status: "POSTED", paidAt }, _sum: { amountCents: true } }),
    db.customerPayment.count({ where: { shopId, paidAt } }),
    db.customerPayment.findMany({
      where: { shopId, paidAt },
      select: { id: true, amountCents: true, method: true, status: true, reference: true, paidAt: true, invoice: { select: { id: true, invoiceNumber: true, customer: { select: { name: true } } } } },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
    db.invoice.findMany({
      where: { shopId, status: "FINALIZED" },
      select: { id: true, invoiceNumber: true, issuedAt: true, totalCents: true, customer: { select: { name: true } }, payments: { where: { shopId, status: "POSTED" }, select: { amountCents: true } } },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  const invoiceTotalCents = invoiceTotals._sum.totalCents ?? 0;
  const collectedCents = collectedTotals._sum.amountCents ?? 0;
  const outstandingCents = Math.max(0, invoiceTotalCents - collectedCents);
  const openInvoices = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt,
    customerName: invoice.customer?.name ?? "Walk-in customer",
    totalCents: invoice.totalCents,
    balanceCents: Math.max(0, invoice.totalCents - invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0)),
  })).filter((invoice) => invoice.balanceCents > 0);

  return {
    invoiceTotalCents,
    collectedCents,
    periodCollectedCents: periodTotals._sum.amountCents ?? 0,
    outstandingCents,
    invoiceCount: invoiceTotals._count._all,
    periodPaymentCount,
    payments,
    openInvoices,
    openInvoiceCount: openInvoices.length,
    hasMorePayments: periodPaymentCount > payments.length,
  };
}
