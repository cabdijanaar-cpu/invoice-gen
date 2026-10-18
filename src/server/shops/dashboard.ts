import "server-only";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";
import { fillMonthlySalesSeries, type MonthlySalesRow } from "@/server/domain/dashboard/monthly-sales";
import { reportRange } from "./reports";

export async function getShopDashboardStats(shopId: string, fromText?: string, toText?: string) {
  await requireShopMembership(shopId);
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  const range = reportRange(fromText ?? defaultFrom, toText ?? defaultTo);
  const [sales, collected, expenses, invoiceCount, products, recentInvoices, monthlySales] = await Promise.all([
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
    db.$queryRaw<MonthlySalesRow[]>`
      SELECT date_trunc('month', "issuedAt") AS "month",
        COALESCE(SUM("totalCents"), 0)::bigint AS "salesCents",
        COUNT(*)::bigint AS "invoiceCount"
      FROM "Invoice"
      WHERE "shopId" = ${shopId}
        AND "status" = 'FINALIZED'
        AND "issuedAt" >= ${range.from}
        AND "issuedAt" < ${range.to}
      GROUP BY date_trunc('month', "issuedAt")
      ORDER BY "month" ASC
    `,
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
    monthlySales: fillMonthlySalesSeries(monthlySales, range.from, range.to),
  };
}
