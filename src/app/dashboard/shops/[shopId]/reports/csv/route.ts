import { NextRequest, NextResponse } from "next/server";
import { requireShopPermission } from "@/server/auth/session";
import { formatCsvCell } from "@/server/domain/reports/csv";
import { getShopReport, reportRange } from "@/server/shops/reports";
export async function GET(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  try {
    await requireShopPermission(shopId, "canViewReports");
    const q = request.nextUrl.searchParams;
    const range = reportRange(q.get("from") ?? "", q.get("to") ?? "");
    const report = await getShopReport(shopId, range.from, range.to);
    const lines: (string | number | Date | null)[][] = [["section", "date", "reference", "status", "category", "description", "method", "amount_cents", "balance_cents", "quantity_milli", "unit", "count"]];
    for (const invoice of report.invoices) lines.push(["invoice", invoice.issuedAt, invoice.invoiceNumber, invoice.status, null, null, null, invoice.status === "FINALIZED" ? invoice.totalCents : 0, invoice.balanceCents, null, null, null]);
    for (const payment of report.payments) lines.push(["payment", payment.paidAt, payment.invoice.invoiceNumber, payment.status, null, null, payment.method, payment.amountCents, null, null, null, null]);
    for (const expense of report.expenses) lines.push(["expense", expense.incurredAt, expense.id, expense.status, expense.category, expense.description, expense.method, expense.status === "POSTED" ? expense.amountCents : 0, null, null, null, null]);
    for (const movement of report.movements) lines.push(["stock_movement", null, null, null, movement.type, null, null, null, movement.quantityMilli, null, null, movement.count]);
    for (const product of report.products) lines.push(["inventory_stock", null, product.sku, "ACTIVE", null, product.name, null, null, null, product.stockQuantityMilli, product.unit, product.lowStockThresholdMilli]);
    for (const product of report.lowStock) lines.push(["low_stock", null, product.sku, null, null, product.name, null, null, null, product.stockQuantityMilli, product.unit, null]);
    const csv = `\uFEFF${lines.map((row) => row.map(formatCsvCell).join(",")).join("\r\n")}`;
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shop-report-${range.fromText}-${range.toText}.csv"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new NextResponse("Report unavailable", { status: 403 }); }
}
