import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@invoice/prisma-client";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";
import { assertShopInvoiceCapacity } from "@/server/platform/entitlements";
import { calculateInvoice, type InvoiceCalculationInput } from "@/server/domain/invoices/calculate-invoice";

export type CreateInvoiceInput = {
  draftId?: string;
  customerId?: string;
  dueAt?: Date;
  notes?: string;
  invoiceDiscountCents: number;
  idempotencyKey: string;
  quotationId?: string;
  lines: Array<InvoiceCalculationInput["lines"][number] & {
    productId?: string;
    description: string;
  }>;
};

export type RecordInvoicePaymentInput = {
  amountCents: number;
  method: "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "OTHER";
  reference?: string;
  notes?: string;
  idempotencyKey: string;
};

export async function recordInvoicePayment(shopId: string, invoiceId: string, input: RecordInvoicePaymentInput) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER", "CASHIER"].includes(membership.role)) throw new Error("You do not have permission to record payments in this shop.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 2_147_483_647) throw new Error("Payment amount must be a positive valid amount.");
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) throw new Error("Invalid request key.");
  if (input.reference && input.reference.length > 120) throw new Error("Payment reference is too long.");
  if (input.notes && input.notes.length > 1_000) throw new Error("Payment notes are too long.");

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.customerPayment.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } },
        select: { id: true, invoiceId: true },
      });
      if (existing) {
        if (existing.invoiceId !== invoiceId) throw new Error("Payment request key is already used for another invoice.");
        return { id: existing.id, duplicate: true as const };
      }

      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, shopId, status: "FINALIZED" },
        select: { id: true, totalCents: true, customerId: true, currency: true },
      });
      if (!invoice) throw new Error("Finalized invoice not found in this shop.");
      const aggregate = await tx.customerPayment.aggregate({
        where: { shopId, invoiceId, status: "POSTED" },
        _sum: { amountCents: true },
      });
      const paidCents = aggregate._sum.amountCents ?? 0;
      if (input.amountCents > invoice.totalCents - paidCents) throw new Error("Payment exceeds the invoice balance.");

      const payment = await tx.customerPayment.create({
        data: {
          shopId, invoiceId, customerId: invoice.customerId, recordedById: user.id,
          amountCents: input.amountCents, currency: invoice.currency, method: input.method,
          reference: input.reference || null, notes: input.notes || null,
          idempotencyKey: input.idempotencyKey,
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: {
        actorId: user.id, shopId, action: "INVOICE_PAYMENT_RECORDED", entityType: "CustomerPayment", entityId: payment.id,
        summary: `Recorded ${input.amountCents} cents for invoice ${invoiceId}`,
      } });
      return { id: payment.id, duplicate: false as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.customerPayment.findUnique({ where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } }, select: { id: true, invoiceId: true } });
      if (existing?.invoiceId === invoiceId) return { id: existing.id, duplicate: true as const };
      if (existing) throw new Error("Payment request key is already used for another invoice.");
    }
    throw error;
  }
}

export async function reverseInvoicePayment(shopId: string, invoiceId: string, paymentId: string, reason: string) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER"].includes(membership.role)) throw new Error("Only a shop owner or manager can reverse a payment.");
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) throw new Error("Enter a reversal reason between 5 and 500 characters.");

  return db.$transaction(async (tx) => {
    const payment = await tx.customerPayment.findFirst({
      where: { id: paymentId, invoiceId, shopId, status: "POSTED" },
      select: { id: true, amountCents: true, method: true },
    });
    if (!payment) throw new Error("Posted payment not found in this shop.");
    const changed = await tx.customerPayment.updateMany({
      where: { id: payment.id, invoiceId, shopId, status: "POSTED" },
      data: { status: "REVERSED", reversedAt: new Date(), reversalReason: normalizedReason },
    });
    if (changed.count !== 1) throw new Error("Payment was already reversed. Refresh and try again.");
    if (payment.method !== "REFUND") {
      const refunds = await tx.customerPayment.findMany({ where: { shopId, invoiceId, reference: payment.id, method: "REFUND", status: "POSTED" }, select: { id: true, amountCents: true } });
      if (refunds.length) {
        await tx.customerPayment.updateMany({ where: { shopId, invoiceId, reference: payment.id, method: "REFUND", status: "POSTED" }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: `Original payment reversed: ${normalizedReason}` } });
        for (const refund of refunds) await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "INVOICE_PAYMENT_REVERSED", entityType: "CustomerPayment", entityId: refund.id, summary: `Reversed refund of ${Math.abs(refund.amountCents)} cents for invoice ${invoiceId}` } });
      }
    }
    await tx.auditLog.create({ data: {
      actorId: user.id, shopId, action: "INVOICE_PAYMENT_REVERSED", entityType: "CustomerPayment", entityId: payment.id,
      summary: `Reversed ${Math.abs(payment.amountCents)} cents for invoice ${invoiceId}`,
    } });
    return { id: payment.id, amountCents: payment.amountCents };
  });
}

export async function recordInvoiceRefund(shopId: string, invoiceId: string, paymentId: string, input: { amountCents: number; reason: string; idempotencyKey: string }) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER"].includes(membership.role)) throw new Error("Only a shop owner or manager can record a refund.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 2_147_483_647) throw new Error("Refund amount must be positive.");
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) throw new Error("Invalid request key.");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("Enter a refund reason between 5 and 500 characters.");
  try {
    return await db.$transaction(async (tx) => {
    const existing = await tx.customerPayment.findUnique({ where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } }, select: { id: true, invoiceId: true, reference: true, amountCents: true } });
    if (existing) {
      if (existing.invoiceId !== invoiceId || existing.reference !== paymentId || existing.amountCents !== -input.amountCents) throw new Error("Refund request key is already used for another request.");
      return { id: existing.id, duplicate: true as const };
    }
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, shopId, status: "FINALIZED" }, select: { customerId: true, currency: true } });
    if (!invoice) throw new Error("Finalized invoice not found in this shop.");
    const payment = await tx.customerPayment.findFirst({ where: { id: paymentId, shopId, invoiceId, status: "POSTED", amountCents: { gt: 0 }, method: { not: "REFUND" } }, select: { amountCents: true } });
    if (!payment) throw new Error("Posted payment not found in this shop.");
    const refunds = await tx.customerPayment.aggregate({ where: { shopId, invoiceId, reference: paymentId, method: "REFUND", status: "POSTED" }, _sum: { amountCents: true } });
    const remainingRefundableCents = payment.amountCents + (refunds._sum.amountCents ?? 0);
    if (input.amountCents > remainingRefundableCents) throw new Error("Refund exceeds the remaining refundable payment amount.");
    const refund = await tx.customerPayment.create({ data: {
      shopId, invoiceId, customerId: invoice.customerId, recordedById: user.id, amountCents: -input.amountCents,
      currency: invoice.currency, method: "REFUND", reference: paymentId, notes: reason, idempotencyKey: input.idempotencyKey,
    }, select: { id: true } });
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "INVOICE_PAYMENT_REFUNDED", entityType: "CustomerPayment", entityId: refund.id, summary: `Refunded ${input.amountCents} cents for invoice ${invoiceId}` } });
      return { id: refund.id, duplicate: false as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.customerPayment.findUnique({ where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } }, select: { id: true, invoiceId: true, reference: true, amountCents: true } });
      if (existing?.invoiceId === invoiceId && existing.reference === paymentId && existing.amountCents === -input.amountCents) return { id: existing.id, duplicate: true as const };
      if (existing) throw new Error("Refund request key is already used for another request.");
    }
    throw error;
  }
}

export async function voidFinalizedInvoice(shopId: string, invoiceId: string, reason: string) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER"].includes(membership.role)) throw new Error("Only a shop owner or manager can void an invoice.");
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 5 || normalizedReason.length > 500) throw new Error("Enter a void reason between 5 and 500 characters.");

  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, shopId, status: "FINALIZED" }, select: { id: true, invoiceNumber: true } });
    if (!invoice) throw new Error("Finalized invoice not found in this shop.");
    const postedPayments = await tx.customerPayment.count({ where: { shopId, invoiceId, status: "POSTED" } });
    if (postedPayments > 0) throw new Error("Reverse all posted payments before voiding this invoice.");
    const items = await tx.invoiceItem.findMany({ where: { invoiceId }, select: { id: true, productId: true, quantityMilli: true, description: true } });
    const changed = await tx.invoice.updateMany({ where: { id: invoiceId, shopId, status: "FINALIZED" }, data: { status: "VOID", voidedAt: new Date(), voidReason: normalizedReason } });
    if (changed.count !== 1) throw new Error("Invoice status changed. Refresh and try again.");

    for (const [position, item] of items.entries()) {
      if (!item.productId) continue;
      const returned = await tx.product.updateMany({
        where: { id: item.productId, shopId, stockQuantityMilli: { lte: 2_147_483_647 - item.quantityMilli } },
        data: { stockQuantityMilli: { increment: item.quantityMilli }, status: "ACTIVE" },
      });
      if (returned.count !== 1) throw new Error(`Could not restore stock for ${item.description}.`);
      await tx.inventoryMovement.create({ data: {
        shopId, productId: item.productId, actorId: user.id, type: "RETURN", quantityDeltaMilli: item.quantityMilli,
        reason: `Voided invoice ${invoice.invoiceNumber}`, sourceType: "INVOICE_VOID", sourceId: invoiceId,
        idempotencyKey: `invoice-void:${invoiceId}:${position}`,
      } });
    }
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "INVOICE_VOIDED", entityType: "Invoice", entityId: invoiceId, summary: `Voided ${invoice.invoiceNumber}` } });
    return { id: invoiceId };
  });
}

export async function listShopInvoices(shopId: string) {
  await requireShopMembership(shopId);
  return db.invoice.findMany({
    where: { shopId },
    select: {
      id: true,
      customerId: true,
      invoiceNumber: true,
      status: true,
      voidReason: true,
      voidedAt: true,
      issuedAt: true,
      dueAt: true,
      totalCents: true,
      payments: {
        where: { status: "POSTED" },
        select: { id: true, amountCents: true, method: true, reference: true, notes: true, paidAt: true },
        orderBy: { paidAt: "desc" },
      },
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listInvoiceOptions(shopId: string) {
  await requireShopMembership(shopId);
  const [customers, products, settings] = await Promise.all([
    db.customer.findMany({
      where: { shopId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    db.product.findMany({
      where: { shopId, status: "ACTIVE" },
      select: { id: true, name: true, sku: true, sellingPriceCents: true, stockQuantityMilli: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    db.shopSettings.findUnique({ where: { shopId }, select: { defaultTaxRateBps: true, defaultDiscountBps: true, defaultPaymentTerms: true } }),
  ]);
  return { customers, products, defaults: settings ?? { defaultTaxRateBps: 0, defaultDiscountBps: 0, defaultPaymentTerms: null } };
}

export async function createFinalizedInvoice(shopId: string, input: CreateInvoiceInput) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER", "CASHIER"].includes(membership.role)) {
    throw new Error("You do not have permission to create invoices in this shop.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) throw new Error("Invalid request key.");
  if (input.notes && input.notes.length > 2_000) throw new Error("Invoice notes are too long.");

  const calculation = calculateInvoice({
    lines: input.lines,
    invoiceDiscountCents: input.invoiceDiscountCents,
  });
  const productIds = [...new Set(input.lines.flatMap((line) => line.productId ? [line.productId] : []))];

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } },
        select: { id: true, invoiceNumber: true },
      });
      if (existing) return { ...existing, duplicate: true as const };

      if (input.quotationId) {
        const source = await tx.quotation.findFirst({ where: { id: input.quotationId, shopId }, select: { status: true, convertedInvoiceId: true, expiresAt: true } });
        if (!source) throw new Error("Quotation not found in this shop.");
        if (source.convertedInvoiceId) {
          const converted = await tx.invoice.findFirst({ where: { id: source.convertedInvoiceId, shopId }, select: { id: true, invoiceNumber: true } });
          if (converted) return { ...converted, duplicate: true as const };
        }
        if (source.status !== "ACCEPTED") throw new Error("Only accepted quotations can be converted.");
        if (source.expiresAt && source.expiresAt < new Date()) throw new Error("Quotation has expired.");
      }

      if (input.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: input.customerId, shopId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!customer) throw new Error("Customer not found in this shop.");
      }

      const products = productIds.length
        ? await tx.product.findMany({
            where: { id: { in: productIds }, shopId, status: "ACTIVE" },
            select: { id: true, name: true, sku: true, purchaseCostCents: true },
          })
        : [];
      const productsById = new Map(products.map((product) => [product.id, product]));
      if (productsById.size !== productIds.length) throw new Error("One or more products are unavailable in this shop.");

      const issuedAt = new Date();
      await assertShopInvoiceCapacity(shopId, tx, issuedAt);
      let invoiceId: string = randomUUID();
      let invoiceNumber: string;
      if (input.draftId) {
        const draft = await tx.invoice.findFirst({ where: { id: input.draftId, shopId, status: "DRAFT" }, select: { id: true, invoiceNumber: true } });
        if (!draft) throw new Error("Invoice draft not found in this shop.");
        invoiceId = draft.id;
        invoiceNumber = draft.invoiceNumber;
        const finalized = await tx.invoice.updateMany({ where: { id: draft.id, shopId, status: "DRAFT" }, data: {
          customerId: input.customerId ?? null, idempotencyKey: input.idempotencyKey, status: "FINALIZED", issuedAt,
          dueAt: input.dueAt ?? null, subtotalCents: calculation.subtotalCents, discountCents: calculation.discountCents,
          taxCents: calculation.taxCents, totalCents: calculation.totalCents, notes: input.notes || null, finalizedAt: issuedAt,
        } });
        if (finalized.count !== 1) throw new Error("Invoice draft changed. Refresh and try again.");
        await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      } else {
        const settings = await tx.shopSettings.findUnique({ where: { shopId }, select: { id: true, invoicePrefix: true, nextInvoiceNumber: true } });
        if (!settings) throw new Error("Invoice settings are not configured for this shop.");
        const reserved = await tx.shopSettings.updateMany({ where: { id: settings.id, nextInvoiceNumber: settings.nextInvoiceNumber }, data: { nextInvoiceNumber: { increment: 1 } } });
        if (reserved.count !== 1) throw new Error("Invoice numbering changed. Please submit the invoice again.");
        invoiceNumber = `${settings.invoicePrefix}-${String(settings.nextInvoiceNumber).padStart(6, "0")}`;
        await tx.invoice.create({ data: {
          id: invoiceId, shopId, customerId: input.customerId ?? null, createdById: user.id, invoiceNumber,
          idempotencyKey: input.idempotencyKey, status: "FINALIZED", issuedAt, dueAt: input.dueAt ?? null,
          currency: "USD", subtotalCents: calculation.subtotalCents, discountCents: calculation.discountCents,
          taxCents: calculation.taxCents, totalCents: calculation.totalCents, notes: input.notes || null, finalizedAt: issuedAt,
        } });
      }
      const invoice = { id: invoiceId, invoiceNumber };

      for (const [index, inputLine] of input.lines.entries()) {
        const calculatedLine = calculation.lines[index];
        const product = inputLine.productId ? productsById.get(inputLine.productId) : undefined;
        if (product) {
          const updated = await tx.product.updateMany({
            where: {
              id: product.id,
              shopId,
              status: "ACTIVE",
              stockQuantityMilli: { gte: inputLine.quantityMilli },
            },
            data: { stockQuantityMilli: { decrement: inputLine.quantityMilli } },
          });
          if (updated.count !== 1) throw new Error(`Not enough stock for ${product.name}.`);

          await tx.inventoryMovement.create({
            data: {
              shopId,
              productId: product.id,
              actorId: user.id,
              type: "SALE",
              quantityDeltaMilli: -inputLine.quantityMilli,
              reason: `Invoice ${invoiceNumber}`,
              sourceType: "INVOICE",
              sourceId: invoiceId,
              idempotencyKey: `invoice:${invoiceId}:${index}`,
            },
          });
        }

        await tx.invoiceItem.create({
          data: {
            invoiceId,
            position: index,
            productId: product?.id ?? null,
            description: product?.name ?? inputLine.description,
            skuSnapshot: product?.sku ?? null,
            quantityMilli: inputLine.quantityMilli,
            unitPriceCents: inputLine.unitPriceCents,
            discountCents: calculatedLine.lineDiscountCents + calculatedLine.invoiceDiscountCents,
            taxRateBps: calculatedLine.taxRateBps,
            lineTotalCents: calculatedLine.totalCents,
            costSnapshotCents: product?.purchaseCostCents ?? null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          shopId,
          action: "INVOICE_FINALIZED",
          entityType: "Invoice",
          entityId: invoice.id,
          summary: `Created ${invoiceNumber}`,
        },
      });
      if (input.quotationId) {
        const linked = await tx.quotation.updateMany({
          where: { id: input.quotationId, shopId, status: "ACCEPTED", convertedInvoiceId: null },
          data: { status: "CONVERTED", convertedInvoiceId: invoice.id },
        });
        if (linked.count !== 1) throw new Error("Quotation has already been converted. Refresh to see its invoice.");
        await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "QUOTATION_CONVERTED", entityType: "Quotation", entityId: input.quotationId, summary: `Converted ${invoiceNumber}` } });
      }
      return { ...invoice, duplicate: false as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.invoice.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } },
        select: { id: true, invoiceNumber: true },
      });
      if (existing) return { ...existing, duplicate: true as const };
    }
    throw error;
  }
}

export async function saveShopInvoiceDraft(shopId: string, input: Omit<CreateInvoiceInput, "idempotencyKey">, draftId?: string) {
  const { user, membership } = await requireShopMembership(shopId);
  if (!["SHOP_OWNER", "MANAGER", "CASHIER"].includes(membership.role)) throw new Error("You do not have permission to save invoices in this shop.");
  if (input.notes && input.notes.length > 2_000) throw new Error("Invoice notes are too long.");
  const calculation = calculateInvoice({ lines: input.lines, invoiceDiscountCents: input.invoiceDiscountCents });
  const productIds = [...new Set(input.lines.flatMap((line) => line.productId ? [line.productId] : []))];
  return db.$transaction(async (tx) => {
    if (input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, shopId, status: "ACTIVE" }, select: { id: true } });
      if (!customer) throw new Error("Customer not found in this shop.");
    }
    const products = productIds.length ? await tx.product.findMany({ where: { id: { in: productIds }, shopId, status: "ACTIVE" }, select: { id: true, name: true, sku: true, purchaseCostCents: true } }) : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    if (productMap.size !== productIds.length) throw new Error("One or more products are unavailable in this shop.");
    let invoiceId = draftId;
    let invoiceNumber: string;
    if (draftId) {
      const draft = await tx.invoice.findFirst({ where: { id: draftId, shopId, status: "DRAFT" }, select: { invoiceNumber: true } });
      if (!draft) throw new Error("Invoice draft not found in this shop.");
      invoiceNumber = draft.invoiceNumber;
      await tx.invoice.update({ where: { id: draftId }, data: {
        customerId: input.customerId ?? null, dueAt: input.dueAt ?? null, notes: input.notes || null,
        subtotalCents: calculation.subtotalCents, discountCents: calculation.discountCents,
        taxCents: calculation.taxCents, totalCents: calculation.totalCents,
      } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: draftId } });
    } else {
      const settings = await tx.shopSettings.findUnique({ where: { shopId }, select: { id: true, invoicePrefix: true, nextInvoiceNumber: true } });
      if (!settings) throw new Error("Invoice settings are not configured for this shop.");
      const reserved = await tx.shopSettings.updateMany({ where: { id: settings.id, nextInvoiceNumber: settings.nextInvoiceNumber }, data: { nextInvoiceNumber: { increment: 1 } } });
      if (reserved.count !== 1) throw new Error("Invoice numbering changed. Please try again.");
      invoiceNumber = `${settings.invoicePrefix}-${String(settings.nextInvoiceNumber).padStart(6, "0")}`;
      invoiceId = randomUUID();
      await tx.invoice.create({ data: {
        id: invoiceId, shopId, customerId: input.customerId ?? null, createdById: user.id, invoiceNumber,
        status: "DRAFT", dueAt: input.dueAt ?? null, currency: "USD", subtotalCents: calculation.subtotalCents,
        discountCents: calculation.discountCents, taxCents: calculation.taxCents, totalCents: calculation.totalCents,
        notes: input.notes || null,
      } });
    }
    for (const [position, line] of input.lines.entries()) {
      const product = line.productId ? productMap.get(line.productId) : undefined;
      const computed = calculation.lines[position];
      await tx.invoiceItem.create({ data: {
        invoiceId: invoiceId!, position, productId: product?.id ?? null,
        description: product?.name ?? line.description, skuSnapshot: product?.sku ?? null,
        quantityMilli: line.quantityMilli, unitPriceCents: line.unitPriceCents,
        discountCents: computed.lineDiscountCents + computed.invoiceDiscountCents,
        taxRateBps: computed.taxRateBps, lineTotalCents: computed.totalCents, costSnapshotCents: product?.purchaseCostCents ?? null,
      } });
    }
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: draftId ? "INVOICE_DRAFT_UPDATED" : "INVOICE_DRAFT_CREATED", entityType: "Invoice", entityId: invoiceId!, summary: `${draftId ? "Updated" : "Saved"} draft ${invoiceNumber}` } });
    return { id: invoiceId!, invoiceNumber };
  });
}

export async function getShopInvoice(shopId: string, invoiceId: string) {
  await requireShopMembership(shopId);
  return db.invoice.findFirst({
    where: { id: invoiceId, shopId },
    select: {
      id: true,
      customerId: true,
      invoiceNumber: true,
      status: true,
      voidReason: true,
      voidedAt: true,
      issuedAt: true,
      dueAt: true,
      currency: true,
      subtotalCents: true,
      discountCents: true,
      taxCents: true,
      totalCents: true,
      payments: {
        select: { id: true, amountCents: true, method: true, reference: true, notes: true, paidAt: true, status: true, reversedAt: true, reversalReason: true },
        orderBy: { paidAt: "desc" },
      },
      notes: true,
      customer: { select: { id: true, name: true, email: true, phone: true, address: true } },
      shop: { select: { name: true, settings: { select: { legalName: true, address: true, phone: true, email: true, website: true, logoKey: true, footer: true, primaryColor: true, template: true } } } },
      items: {
        select: {
          productId: true,
          description: true,
          skuSnapshot: true,
          quantityMilli: true,
          unitPriceCents: true,
          discountCents: true,
          taxRateBps: true,
          lineTotalCents: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });
}
