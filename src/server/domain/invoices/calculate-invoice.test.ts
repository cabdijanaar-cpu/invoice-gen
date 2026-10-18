import { describe, expect, it } from "vitest";
import { calculateDefaultInvoiceDiscountCents, calculateInvoice } from "./calculate-invoice";

describe("calculateInvoice", () => {
  it("calculates the default percentage discount after line discounts with half-up rounding", () => {
    expect(calculateDefaultInvoiceDiscountCents(
      [{ quantityMilli: 1_000, unitPriceCents: 999, lineDiscountCents: 100 }],
      1_000,
    )).toBe(90);
  });

  it("rejects a default percentage above 100%", () => {
    expect(() => calculateDefaultInvoiceDiscountCents(
      [{ quantityMilli: 1_000, unitPriceCents: 100 }],
      10_001,
    )).toThrow("Default discount rate cannot exceed 10000 basis points.");
  });

  it("calculates fractional quantities, line discounts, and tax in integer cents", () => {
    const result = calculateInvoice({
      lines: [{ quantityMilli: 1_500, unitPriceCents: 1_000, lineDiscountCents: 100, taxRateBps: 1_000 }],
    });

    expect(result).toMatchObject({
      subtotalCents: 1_500,
      lineDiscountCents: 100,
      invoiceDiscountCents: 0,
      discountCents: 100,
      taxCents: 140,
      totalCents: 1_540,
    });
    expect(result.lines[0]).toMatchObject({
      grossCents: 1_500,
      taxableCents: 1_400,
      taxCents: 140,
      totalCents: 1_540,
    });
  });

  it("allocates invoice discounts proportionally and resolves leftover cents deterministically", () => {
    const result = calculateInvoice({
      lines: [
        { quantityMilli: 1_000, unitPriceCents: 100, taxRateBps: 1_000 },
        { quantityMilli: 1_000, unitPriceCents: 200, taxRateBps: 1_000 },
      ],
      invoiceDiscountCents: 1,
    });

    expect(result.lines.map((line) => line.invoiceDiscountCents)).toEqual([0, 1]);
    expect(result).toMatchObject({ subtotalCents: 300, taxCents: 30, totalCents: 329 });
  });

  it("rounds exact half-cent tax upward", () => {
    const result = calculateInvoice({
      lines: [{ quantityMilli: 1_000, unitPriceCents: 1, taxRateBps: 5_000 }],
    });

    expect(result.taxCents).toBe(1);
    expect(result.totalCents).toBe(2);
  });

  it("rejects a discount larger than the eligible line amount", () => {
    expect(() => calculateInvoice({
      lines: [{ quantityMilli: 1_000, unitPriceCents: 100, lineDiscountCents: 101 }],
    })).toThrow("A line discount cannot exceed its line amount.");
  });

  it("rejects invalid quantities, rates, and an empty invoice", () => {
    expect(() => calculateInvoice({ lines: [] })).toThrow("An invoice needs at least one line.");
    expect(() => calculateInvoice({ lines: [{ quantityMilli: 0, unitPriceCents: 100 }] })).toThrow(/Quantity/);
    expect(() => calculateInvoice({ lines: [{ quantityMilli: 1_000, unitPriceCents: 100, taxRateBps: 100_001 }] })).toThrow(/Tax rate/);
  });
});
