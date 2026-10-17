import "server-only";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";

export async function getShopDashboardStats(shopId: string) {
  await requireShopMembership(shopId);
  const [sales, collected, expenses, invoiceCount, products, recentInvoices] = await Promise.all([
    db.invoice.aggregate({ where: { shopId, status: "FINALIZED" }, _sum: { totalCents: true } }),
    db.customerPayment.aggregate({ where: { shopId, status: "POSTED" }, _sum: { amountCents: true } }),
    db.expense.aggregate({ where: { shopId, status: "POSTED" }, _sum: { amountCents: true } }),
    db.invoice.count({ where: { shopId, status: "FINALIZED" } }),
    db.product.findMany({ where: { shopId, status: "ACTIVE" }, select: { stockQuantityMilli: true, lowStockThresholdMilli: true } }),
    db.invoice.findMany({
      where: { shopId, status: "FINALIZED" },
      select: { id: true, invoiceNumber: true, totalCents: true, issuedAt: true, customer: { select: { name: true } } },
      orderBy: { issuedAt: "desc" },
      take: 5,
    }),
  ]);
  const totalSalesCents = sales._sum.totalCents ?? 0;
  const collectedCents = collected._sum.amountCents ?? 0;
  return {
    totalSalesCents,
    collectedCents,
    outstandingCents: Math.max(0, totalSalesCents - collectedCents),
    expenseCents: expenses._sum.amountCents ?? 0,
    invoiceCount,
    lowStockCount: products.filter((product) => product.stockQuantityMilli <= product.lowStockThresholdMilli).length,
    recentInvoices,
  };
}
