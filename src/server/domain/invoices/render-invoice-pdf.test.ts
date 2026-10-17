import { describe, expect, it } from "vitest";
import { renderInvoicePdf } from "./render-invoice-pdf";

describe("renderInvoicePdf", () => {
  it("creates a structured downloadable PDF with invoice and total text", () => {
    const pdf = Buffer.from(renderInvoicePdf({
      invoiceNumber: "INV-000001", status: "FINALIZED", issuedAt: new Date("2026-10-16T00:00:00.000Z"), dueAt: null,
      currency: "USD", subtotalCents: 2_500, discountCents: 100, taxCents: 192, totalCents: 2_592, notes: "Thank you",
      customer: { name: "Amina", email: null, phone: null, address: null },
      shop: { name: "Test Shop", settings: null },
      items: [{ description: "Notebook", skuSnapshot: "NB-1", quantityMilli: 2_000, unitPriceCents: 1_250, discountCents: 100, lineTotalCents: 2_592 }],
    })).toString("ascii");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("INV-000001");
    expect(pdf).toContain("TOTAL: USD 25.92");
    expect(pdf).toContain("xref");
    expect(pdf.endsWith("%%EOF")).toBe(true);
  });

  it("splits long invoices into multiple PDF pages", () => {
    const invoice = {
      invoiceNumber: "INV-LONG", status: "FINALIZED", issuedAt: null, dueAt: null, currency: "USD",
      subtotalCents: 10_000, discountCents: 0, taxCents: 0, totalCents: 10_000, notes: null,
      customer: null, shop: { name: "Test Shop", settings: null },
      items: Array.from({ length: 60 }, (_, index) => ({ description: `Item ${index + 1}`, skuSnapshot: null, quantityMilli: 1_000, unitPriceCents: 100, discountCents: 0, lineTotalCents: 100 })),
    };
    const pdf = Buffer.from(renderInvoicePdf(invoice)).toString("ascii");
    expect(pdf).toContain("/Count 4");
    expect(pdf).toContain("Item 60");
  });
});
