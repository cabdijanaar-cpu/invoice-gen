"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoneyToCents } from "@/server/domain/money";
import { createFinalizedInvoice, recordInvoicePayment, recordInvoiceRefund, reverseInvoicePayment, saveShopInvoiceDraft, voidFinalizedInvoice } from "@/server/shops/invoices";

export type InvoiceActionState = {
  error?: string;
  success?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  nextRequestId?: string;
};

const payloadSchema = z.object({
  customerId: z.string().max(64),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
  notes: z.string().max(2_000),
  invoiceDiscount: z.string(),
  idempotencyKey: z.string().uuid(),
  draftId: z.string().max(64),
  linesJson: z.string().max(100_000),
});

const lineSchema = z.object({
  productId: z.string().max(64),
  description: z.string().trim().max(200),
  quantityMilli: z.number().int().min(1).max(2_147_483_647),
  unitPriceCents: z.number().int().min(0).max(2_147_483_647),
  lineDiscountCents: z.number().int().min(0).max(2_147_483_647),
  taxRateBps: z.number().int().min(0).max(100_000),
});

export async function createInvoiceAction(
  shopId: string,
  _previous: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const raw = payloadSchema.safeParse({
    customerId: formData.get("customerId"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
    invoiceDiscount: formData.get("invoiceDiscount"),
    idempotencyKey: formData.get("idempotencyKey"),
    linesJson: formData.get("linesJson"),
    draftId: formData.get("draftId") ?? "",
  });
  if (!raw.success) return { error: "Check the invoice details and try again." };

  const invoiceDiscountCents = parseMoneyToCents(raw.data.invoiceDiscount);
  if (invoiceDiscountCents === null) return { error: "Enter a valid invoice discount." };

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.data.linesJson);
  } catch {
    return { error: "Invoice lines are invalid." };
  }
  const lines = z.array(lineSchema).min(1).max(100).safeParse(decoded);
  if (!lines.success) return { error: "Check each invoice line and try again." };
  if (lines.data.some((line) => !line.productId && line.description.length < 2)) {
    return { error: "Custom invoice lines need a description." };
  }

  let dueAt: Date | undefined;
  if (raw.data.dueDate) {
    dueAt = new Date(`${raw.data.dueDate}T00:00:00.000Z`);
    if (Number.isNaN(dueAt.getTime()) || dueAt.toISOString().slice(0, 10) !== raw.data.dueDate) {
      return { error: "Enter a valid due date." };
    }
  }

  try {
    const invoice = await createFinalizedInvoice(shopId, {
      customerId: raw.data.customerId || undefined,
      dueAt,
      notes: raw.data.notes,
      invoiceDiscountCents,
      idempotencyKey: raw.data.idempotencyKey,
      draftId: raw.data.draftId || undefined,
      lines: lines.data.map((line) => ({
        ...line,
        productId: line.productId || undefined,
      })),
    });
    return {
      success: invoice.duplicate ? "This invoice was already created." : "Invoice finalized.",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      nextRequestId: randomUUID(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice could not be created.";
    if (message.includes("permission") || message.includes("stock") || message.includes("discount") || message.includes("Customer not found")) {
      return { error: message };
    }
    return { error: "Invoice could not be finalized. Check the details and try again." };
  }
}

export async function saveInvoiceDraftAction(shopId: string, _previous: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const raw = payloadSchema.safeParse({ customerId: formData.get("customerId"), dueDate: formData.get("dueDate"), notes: formData.get("notes"), invoiceDiscount: formData.get("invoiceDiscount"), idempotencyKey: formData.get("idempotencyKey"), draftId: formData.get("draftId") ?? "", linesJson: formData.get("linesJson") });
  if (!raw.success) return { error: "Check the draft details and try again." };
  const invoiceDiscountCents = parseMoneyToCents(raw.data.invoiceDiscount);
  if (invoiceDiscountCents === null) return { error: "Enter a valid invoice discount." };
  let decoded: unknown;
  try { decoded = JSON.parse(raw.data.linesJson); } catch { return { error: "Invoice lines are invalid." }; }
  const lines = z.array(lineSchema).min(1).max(100).safeParse(decoded);
  if (!lines.success || lines.data.some((line) => !line.productId && line.description.length < 2)) return { error: "Check each invoice line and try again." };
  let dueAt: Date | undefined;
  if (raw.data.dueDate) {
    dueAt = new Date(`${raw.data.dueDate}T00:00:00.000Z`);
    if (Number.isNaN(dueAt.getTime()) || dueAt.toISOString().slice(0, 10) !== raw.data.dueDate) return { error: "Enter a valid due date." };
  }
  try {
    const draft = await saveShopInvoiceDraft(shopId, {
      customerId: raw.data.customerId || undefined, dueAt, notes: raw.data.notes,
      invoiceDiscountCents, lines: lines.data.map((line) => ({ ...line, productId: line.productId || undefined })),
    }, raw.data.draftId || undefined);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices/${draft.id}`);
    return { success: "Invoice draft saved.", invoiceId: draft.id, invoiceNumber: draft.invoiceNumber, nextRequestId: randomUUID() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft could not be saved.";
    return { error: message.includes("permission") || message.includes("stock") || message.includes("discount") || message.includes("not found") ? message : "Draft could not be saved. Check the details and try again." };
  }
}

export type PaymentActionState = { error?: string; success?: string; nextRequestId?: string };

export async function recordInvoicePaymentAction(shopId: string, invoiceId: string, _previous: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const parsed = z.object({
    amount: z.string().max(20),
    method: z.enum(["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"]),
    reference: z.string().trim().max(120),
    notes: z.string().trim().max(1_000),
    idempotencyKey: z.string().uuid(),
  }).safeParse({
    amount: formData.get("amount"), method: formData.get("method"), reference: formData.get("reference"),
    notes: formData.get("notes"), idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) return { error: "Check the payment details and try again." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (!amountCents) return { error: "Enter a payment amount greater than zero." };
  try {
    const result = await recordInvoicePayment(shopId, invoiceId, { ...parsed.data, amountCents });
    revalidatePath(`/dashboard/shops/${shopId}/invoices/${invoiceId}`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}`);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: result.duplicate ? "This payment was already recorded." : "Payment recorded.", nextRequestId: randomUUID() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment could not be recorded.";
    return { error: message.includes("permission") || message.includes("balance") || message.includes("invoice") ? message : "Payment could not be recorded. Check the details and try again." };
  }
}

export async function reverseInvoicePaymentAction(shopId: string, invoiceId: string, paymentId: string, _previous: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const parsed = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: "Enter a reason of at least 5 characters." };
  try {
    await reverseInvoicePayment(shopId, invoiceId, paymentId, parsed.data.reason);
    revalidatePath(`/dashboard/shops/${shopId}/invoices/${invoiceId}`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}`);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: "Payment reversed and invoice balance updated." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment could not be reversed.";
    return { error: message.includes("Only a shop") || message.includes("permission") || message.includes("not found") || message.includes("already reversed") ? message : "Payment could not be reversed. Check the request and try again." };
  }
}

export async function recordInvoiceRefundAction(shopId: string, invoiceId: string, paymentId: string, _previous: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const parsed = z.object({ amount: z.string().max(20), reason: z.string().trim().min(5).max(500), idempotencyKey: z.string().uuid() }).safeParse({ amount: formData.get("amount"), reason: formData.get("reason"), idempotencyKey: formData.get("idempotencyKey") });
  if (!parsed.success) return { error: "Enter a valid refund amount and reason." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (!amountCents) return { error: "Enter a refund amount greater than zero." };
  try {
    const result = await recordInvoiceRefund(shopId, invoiceId, paymentId, { amountCents, reason: parsed.data.reason, idempotencyKey: parsed.data.idempotencyKey });
    revalidatePath(`/dashboard/shops/${shopId}/invoices/${invoiceId}`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}`);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: result.duplicate ? "This refund was already recorded." : "Refund recorded; invoice balance updated.", nextRequestId: randomUUID() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refund could not be recorded.";
    return { error: message.includes("Only a shop") || message.includes("permission") || message.includes("exceeds") || message.includes("not found") ? message : "Refund could not be recorded. Check the details and try again." };
  }
}

export async function voidInvoiceAction(shopId: string, invoiceId: string, _previous: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const parsed = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse({ reason: formData.get("reason") });
  if (!parsed.success) return { error: "Enter a reason of at least 5 characters." };
  try {
    await voidFinalizedInvoice(shopId, invoiceId, parsed.data.reason);
    revalidatePath(`/dashboard/shops/${shopId}/invoices/${invoiceId}`);
    revalidatePath(`/dashboard/shops/${shopId}/invoices`);
    revalidatePath(`/dashboard/shops/${shopId}/products`);
    revalidatePath(`/dashboard/shops/${shopId}`);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: "Invoice voided and stock returned." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invoice could not be voided.";
    return { error: message.includes("Only a shop") || message.includes("permission") || message.includes("not found") || message.includes("Reverse all") ? message : "Invoice could not be voided. Check the request and try again." };
  }
}
