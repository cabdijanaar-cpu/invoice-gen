import { describe, expect, it } from "vitest";
import { fillMonthlySalesSeries } from "./monthly-sales";

describe("fillMonthlySalesSeries", () => {
  it("fills months with no sales and keeps the requested UTC month range", () => {
    expect(fillMonthlySalesSeries([
      { month: new Date("2026-08-01T00:00:00.000Z"), salesCents: 12_500n, invoiceCount: 2n },
      { month: new Date("2026-10-01T00:00:00.000Z"), salesCents: 8_000n, invoiceCount: 1n },
    ], new Date("2026-08-14T12:00:00.000Z"), new Date("2026-11-01T00:00:00.000Z"))).toEqual([
      { month: "2026-08", salesCents: 12_500, invoiceCount: 2 },
      { month: "2026-09", salesCents: 0, invoiceCount: 0 },
      { month: "2026-10", salesCents: 8_000, invoiceCount: 1 },
    ]);
  });

  it("returns an empty series for an empty range", () => {
    expect(fillMonthlySalesSeries([], new Date("2026-08-01T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z"))).toEqual([]);
  });
});
