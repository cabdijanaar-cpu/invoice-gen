export type MonthlySalesRow = { month: Date; salesCents: bigint; invoiceCount: bigint };

export function fillMonthlySalesSeries(rows: MonthlySalesRow[], from: Date, to: Date) {
  const salesByMonth = new Map(rows.map((row) => [row.month.toISOString().slice(0, 7), row]));
  const result: Array<{ month: string; salesCents: number; invoiceCount: number }> = [];
  for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); cursor < to; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    const key = cursor.toISOString().slice(0, 7);
    const row = salesByMonth.get(key);
    result.push({ month: key, salesCents: Number(row?.salesCents ?? 0n), invoiceCount: Number(row?.invoiceCount ?? 0n) });
  }
  return result;
}
