"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoneyToCents } from "@/server/domain/money";
import { convertAcceptedQuotation, createShopQuotation, transitionShopQuotation } from "@/server/shops/quotations";

export type QuotationActionState = { error?: string; success?: string; quotationId?: string; invoiceId?: string };
const lineSchema = z.object({
  productId: z.string().max(64), description: z.string().trim().max(200),
  quantityMilli: z.number().int().min(1).max(2_147_483_647),
  unitPriceCents: z.number().int().min(0).max(2_147_483_647),
  lineDiscountCents: z.number().int().min(0).max(2_147_483_647),
  taxRateBps: z.number().int().min(0).max(100_000),
});

export async function createQuotationAction(shopId: string, _previous: QuotationActionState, formData: FormData): Promise<QuotationActionState> {
  const parsed = z.object({ customerId: z.string().max(64), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")), notes: z.string().max(2_000), discount: z.string(), linesJson: z.string().max(100_000) }).safeParse({
    customerId: formData.get("customerId"), expiresAt: formData.get("expiresAt"), notes: formData.get("notes"), discount: formData.get("discount"), linesJson: formData.get("linesJson"),
  });
  if (!parsed.success) return { error: "Check the quotation details and try again." };
  const invoiceDiscountCents = parseMoneyToCents(parsed.data.discount);
  if (invoiceDiscountCents === null) return { error: "Enter a valid discount." };
  let decoded: unknown;
  try { decoded = JSON.parse(parsed.data.linesJson); } catch { return { error: "Quotation items are invalid." }; }
  const lines = z.array(lineSchema).min(1).max(100).safeParse(decoded);
  if (!lines.success || lines.data.some((line) => !line.productId && line.description.length < 2)) return { error: "Check each quotation item and try again." };
  let expiresAt: Date | undefined;
  if (parsed.data.expiresAt) {
    expiresAt = new Date(`${parsed.data.expiresAt}T00:00:00.000Z`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== parsed.data.expiresAt) return { error: "Enter a valid expiry date." };
  }
  try {
    const quotation = await createShopQuotation(shopId, { customerId: parsed.data.customerId || undefined, expiresAt, notes: parsed.data.notes, invoiceDiscountCents, lines: lines.data.map((line) => ({ ...line, productId: line.productId || undefined })) });
    revalidatePath(`/dashboard/shops/${shopId}/quotations`);
    return { success: "Quotation saved as a draft.", quotationId: quotation.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quotation could not be saved.";
    return { error: message.includes("permission") || message.includes("not found") || message.includes("discount") || message.includes("Quotation") ? message : "Quotation could not be saved. Check the details and try again." };
  }
}

export async function transitionQuotationAction(shopId: string, quotationId: string, nextStatus: "SENT" | "ACCEPTED" | "CANCELLED", _previous: QuotationActionState, _formData: FormData): Promise<QuotationActionState> {
  void _previous;
  void _formData;
  try {
    const result = await transitionShopQuotation(shopId, quotationId, nextStatus);
    revalidatePath(`/dashboard/shops/${shopId}/quotations`);
    revalidatePath(`/dashboard/shops/${shopId}/quotations/${quotationId}`);
    return { success: result.status === "EXPIRED" ? "Quotation expired." : `Quotation marked ${result.status.toLowerCase()}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quotation could not be updated.";
    return { error: message.includes("permission") || message.includes("not found") || message.includes("expired") || message.includes("allowed") ? message : "Quotation could not be updated." };
  }
}

export async function convertQuotationAction(shopId: string, quotationId: string, _previous: QuotationActionState, _formData: FormData): Promise<QuotationActionState> {
  void _previous;
  void _formData;
  try {
    const result = await convertAcceptedQuotation(shopId, quotationId);
    revalidatePath(`/dashboard/shops/${shopId}/quotations`);
    revalidatePath(`/dashboard/shops/${shopId}/quotations/${quotationId}`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}/products`);
    return { success: "Quotation converted to invoice.", invoiceId: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quotation could not be converted.";
    return { error: message.includes("permission") || message.includes("not found") || message.includes("accepted") || message.includes("expired") || message.includes("stock") ? message : "Quotation could not be converted. Check product stock and try again." };
  }
}
