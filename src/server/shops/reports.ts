import "server-only";
import { db } from "@/lib/db";
import { requireShopPermission } from "@/server/auth/session";

export function reportRange(fromText: string, toText: string) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromText) ? new Date(`${fromText}T00:00:00.000Z`) : new Date(NaN);
  const toInclusive = /^\d{4}-\d{2}-\d{2}$/.test(toText) ? new Date(`${toText}T00:00:00.000Z`) : new Date(NaN);
  if (Number.isNaN(from.getTime()) || Number.isNaN(toInclusive.getTime()) || from > toInclusive || toInclusive.getTime() - from.getTime() > 366 * 86_400_000) throw new Error("Invalid report dates. Choose a range of up to one year.");
  return { from, to: new Date(toInclusive.getTime() + 86_400_000), fromText, toText };
}

export async function getShopReport(shopId: string, from: Date, to: Date) {
  await requireShopPermission(shopId, "canViewReports");
  const dateFilter = { gte: from, lt: to };
  const [invoices, payments, expenses, products, movementGroups] = await Promise.all([
    db.invoice.findMany({ where: { shopId, issuedAt: dateFilter, status: { in: ["FINALIZED", "VOID"] } }, select: { id: true, invoiceNumber: true, status: true, issuedAt: true, totalCents: true } }),
    db.customerPayment.findMany({ where: { shopId, paidAt: dateFilter }, select: { id: true, invoiceId: true, amountCents: true, method: true, status: true, paidAt: true, invoice: { select: { invoiceNumber: true } } }, orderBy: { paidAt: "asc" } }),
    db.expense.findMany({ where: { shopId, incurredAt: dateFilter }, select: { id: true, category: true, description: true, amountCents: true, method: true, status: true, incurredAt: true } }),
    db.product.findMany({ where: { shopId, status: "ACTIVE" }, select: { id: true, name: true, sku: true, stockQuantityMilli: true, lowStockThresholdMilli: true, purchaseCostCents: true, sellingPriceCents: true, unit: true } }),
    db.inventoryMovement.groupBy({ by: ["type"], where: { shopId, createdAt: dateFilter }, _sum: { quantityDeltaMilli: true }, _count: true }),
  ]);
  const balancePayments = invoices.length ? await db.customerPayment.findMany({ where: { shopId, invoiceId: { in: invoices.filter((i) => i.status === "FINALIZED").map((i) => i.id) }, status: "POSTED" }, select: { invoiceId: true, amountCents: true } }) : [];
  const sales = invoices.filter((i) => i.status === "FINALIZED");
  const paidByInvoice = new Map<string, number>();
  for (const payment of balancePayments) {
    if (payment.invoiceId) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + payment.amountCents);
  }
  const invoicesWithBalances = invoices.map((invoice) => ({
    ...invoice,
    balanceCents: invoice.status === "FINALIZED" ? Math.max(0, invoice.totalCents - (paidByInvoice.get(invoice.id) ?? 0)) : 0,
  }));
  const postedPayments = payments.filter((p) => p.status === "POSTED");
  const postedExpenses = expenses.filter((e) => e.status === "POSTED");
  const lowStock = products.filter((p) => p.stockQuantityMilli <= p.lowStockThresholdMilli);
  return {
    salesCents: sales.reduce((n, i) => n + i.totalCents, 0), voidedSalesCents: invoices.filter((i) => i.status === "VOID").reduce((n, i) => n + i.totalCents, 0),
    collectedCents: postedPayments.reduce((n, p) => n + p.amountCents, 0), refundCents: postedPayments.filter((p) => p.amountCents < 0).reduce((n, p) => n + p.amountCents, 0),
    invoiceCount: sales.length, outstandingCents: invoicesWithBalances.reduce((n, i) => n + i.balanceCents, 0),
    expenseCents: postedExpenses.reduce((n, e) => n + e.amountCents, 0), expenseCount: postedExpenses.length,
    lowStock, products, movements: movementGroups.map((m) => ({ type: m.type, quantityMilli: m._sum.quantityDeltaMilli ?? 0, count: m._count })), invoices: invoicesWithBalances, payments, expenses,
  };
}
