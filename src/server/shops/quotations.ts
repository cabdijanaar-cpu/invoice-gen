import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";
import { calculateInvoice, type InvoiceCalculationInput } from "@/server/domain/invoices/calculate-invoice";
import { createFinalizedInvoice } from "@/server/shops/invoices";

export type QuotationInput = {
  customerId?: string;
  expiresAt?: Date;
  notes?: string;
  invoiceDiscountCents: number;
  lines: Array<InvoiceCalculationInput["lines"][number] & { productId?: string; description: string }>;
};

export async function listShopQuotations(shopId: string) {
  await requireShopMembership(shopId);
  const quotations = await db.quotation.findMany({
    where: { shopId },
    select: { id: true, quotationNumber: true, status: true, issuedAt: true, expiresAt: true, totalCents: true, convertedInvoiceId: true, customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  const now = new Date();
  return quotations.map((quotation) => quotation.status === "SENT" && quotation.expiresAt && quotation.expiresAt < now ? { ...quotation, status: "EXPIRED" } : quotation);
}

export async function getShopQuotation(shopId: string, quotationId: string) {
  await requireShopMembership(shopId);
  return db.quotation.findFirst({ where: { id: quotationId, shopId }, select: {
    id: true, quotationNumber: true, status: true, issuedAt: true, expiresAt: true, currency: true,
    subtotalCents: true, discountCents: true, taxCents: true, totalCents: true, notes: true, convertedInvoiceId: true,
    customer: { select: { id: true, name: true, email: true, phone: true, address: true } },
    items: { select: { productId: true, description: true, skuSnapshot: true, quantityMilli: true, unitPriceCents: true, discountCents: true, taxRateBps: true, lineTotalCents: true }, orderBy: { position: "asc" } },
  } });
}

export async function createShopQuotation(shopId: string, input: QuotationInput) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER", "CASHIER"].includes(membership.role)) throw new Error("You do not have permission to create quotations in this shop.");
  if (input.notes && input.notes.length > 2_000) throw new Error("Quotation notes are too long.");
  const calculation = calculateInvoice({ lines: input.lines, invoiceDiscountCents: input.invoiceDiscountCents });
  const productIds = [...new Set(input.lines.flatMap((line) => line.productId ? [line.productId] : []))];

  return db.$transaction(async (tx) => {
    if (input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId, status: "ACTIVE" }, select: { id: true } });
      if (!customer) throw new Error("Customer not found in this shop.");
    }
    const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds }, shopId, status: "ACTIVE" }, select: { id: true, name: true, sku: true } }) : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) throw new Error("One or more products are unavailable in this shop.");
    const settings = await tx.shopSettings.findUnique({ where: { shopId }, select: { id: true, quotationPrefix: true, nextQuotationNumber: true } });
    if (!settings) throw new Error("Quotation settings are not configured for this shop.");
    const reserved = await tx.shopSettings.updateMany({ where: { id: settings.id, nextQuotationNumber: settings.nextQuotationNumber }, data: { nextQuotationNumber: { increment: 1 } } });
    if (reserved.count !== 1) throw new Error("Quotation numbering changed. Please try again.");
    const quotationNumber = `${settings.quotationPrefix}-${String(settings.nextQuotationNumber).padStart(6, "0")}`;
    const quotationId = randomUUID();
    const quotation = await tx.quotation.create({ data: {
      id: quotationId, shopId, customerId: input.customerId ?? null, quotationNumber, status: "DRAFT",
      expiresAt: input.expiresAt ?? null, currency: "USD", subtotalCents: calculation.subtotalCents,
      discountCents: calculation.discountCents, taxCents: calculation.taxCents, totalCents: calculation.totalCents,
      notes: input.notes || null,
    }, select: { id: true, quotationNumber: true } });
    for (const [position, line] of input.lines.entries()) {
      const product = line.productId ? productMap.get(line.productId) : undefined;
      const computed = calculation.lines[position];
      await tx.quotationItem.create({ data: {
        quotationId, position, productId: product?.id ?? null, description: product?.name ?? line.description,
        skuSnapshot: product?.sku ?? null, quantityMilli: line.quantityMilli, unitPriceCents: line.unitPriceCents,
        discountCents: computed.lineDiscountCents + computed.invoiceDiscountCents, taxRateBps: computed.taxRateBps,
        lineTotalCents: computed.totalCents,
      } });
    }
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "QUOTATION_CREATED", entityType: "Quotation", entityId: quotationId, summary: `Created ${quotationNumber}` } });
    return quotation;
  });
}

export async function transitionShopQuotation(shopId: string, quotationId: string, nextStatus: "SENT" | "ACCEPTED" | "CANCELLED") {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER", "CASHIER"].includes(membership.role)) throw new Error("You do not have permission to update quotations in this shop.");
  return db.$transaction(async (tx) => {
    const quotation = await tx.quotation.findFirst({ where: { id: quotationId, shopId }, select: { id: true, quotationNumber: true, status: true, expiresAt: true } });
    if (!quotation) throw new Error("Quotation not found in this shop.");
    const allowed = (quotation.status === "DRAFT" && nextStatus === "SENT") || (quotation.status === "SENT" && ["ACCEPTED", "CANCELLED"].includes(nextStatus));
    if (!allowed) throw new Error("This quotation status change is not allowed.");
    if (nextStatus === "ACCEPTED" && quotation.expiresAt && quotation.expiresAt < new Date()) {
      await tx.quotation.updateMany({ where: { id: quotation.id, shopId, status: "SENT" }, data: { status: "EXPIRED" } });
      await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "QUOTATION_EXPIRED", entityType: "Quotation", entityId: quotationId, summary: `${quotation.quotationNumber} expired` } });
      return { status: "EXPIRED" as const };
    }
    const updated = await tx.quotation.updateMany({ where: { id: quotation.id, shopId, status: quotation.status }, data: { status: nextStatus } });
    if (updated.count !== 1) throw new Error("Quotation changed. Refresh and try again.");
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: `QUOTATION_${nextStatus}`, entityType: "Quotation", entityId: quotationId, summary: `${quotation.quotationNumber} marked ${nextStatus.toLowerCase()}` } });
    return { status: nextStatus };
  });
}

export async function convertAcceptedQuotation(shopId: string, quotationId: string) {
  const quotation = await getShopQuotation(shopId, quotationId);
  if (!quotation) throw new Error("Quotation not found in this shop.");
  if (quotation.convertedInvoiceId) return { id: quotation.convertedInvoiceId, duplicate: true as const };
  if (quotation.status !== "ACCEPTED") throw new Error("Only accepted quotations can be converted.");
  if (quotation.expiresAt && quotation.expiresAt < new Date()) {
    const { user } = await requireShopMembership(shopId);
    await db.$transaction(async (tx) => {
      const expired = await tx.quotation.updateMany({ where: { id: quotationId, shopId, status: "ACCEPTED", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
      if (expired.count === 1) {
        await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "QUOTATION_EXPIRED", entityType: "Quotation", entityId: quotationId, summary: `${quotation.quotationNumber} expired before conversion` } });
      }
    });
    throw new Error("Quotation has expired.");
  }
  return createFinalizedInvoice(shopId, {
    customerId: quotation.customer?.id,
    notes: quotation.notes ?? undefined,
    invoiceDiscountCents: 0,
    idempotencyKey: randomUUID(),
    quotationId: quotation.id,
    lines: quotation.items.map((item) => ({
      productId: item.productId ?? undefined, description: item.description, quantityMilli: item.quantityMilli,
      unitPriceCents: item.unitPriceCents, lineDiscountCents: item.discountCents, taxRateBps: item.taxRateBps,
    })),
  });
}
