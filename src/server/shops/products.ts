import "server-only";
import { Prisma } from "@invoice/prisma-client";
import { db } from "@/lib/db";
import { requireShopMembership, requireShopPermission } from "@/server/auth/session";
import { assertShopProductCapacity } from "@/server/platform/entitlements";

export async function listShopProducts(shopId: string, query = "", page = 1) {
  await requireShopMembership(shopId);
  const q = query.trim().slice(0, 100);
  const where = {
    shopId,
    status: "ACTIVE",
    ...(q ? { OR: [
      { name: { contains: q } },
      { sku: { contains: q } },
      { barcode: { contains: q } },
    ] } : {}),
  };
  const pageSize = 20;
  const safePage = Number.isSafeInteger(page) ? Math.min(Math.max(1, page), 1_000_000) : 1;
  const [products, total] = await db.$transaction([
    db.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        purchaseCostCents: true,
        sellingPriceCents: true,
        stockQuantityMilli: true,
        lowStockThresholdMilli: true,
        unit: true,
        movements: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, type: true, quantityDeltaMilli: true, reason: true, createdAt: true } },
      },
      orderBy: { name: "asc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);
  return { products, total, pageSize };
}

export async function getShopProductMovementHistory(shopId: string, productId: string, page = 1) {
  await requireShopMembership(shopId);
  const product = await db.product.findFirst({ where: { id: productId, shopId }, select: { id: true, name: true, sku: true, stockQuantityMilli: true, unit: true, status: true } });
  if (!product) return null;
  const pageSize = 50;
  const safePage = Number.isSafeInteger(page) ? Math.min(Math.max(1, page), 1_000_000) : 1;
  const where = { shopId, productId };
  const [movements, total] = await db.$transaction([
    db.inventoryMovement.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (safePage - 1) * pageSize, take: pageSize, select: { id: true, type: true, quantityDeltaMilli: true, reason: true, createdAt: true, actor: { select: { name: true } } } }),
    db.inventoryMovement.count({ where }),
  ]);
  return { product, movements, total, pageSize };
}

export async function createShopProduct(
  shopId: string,
  input: {
    name: string;
    sku?: string;
    barcode?: string;
    purchaseCostCents: number;
    sellingPriceCents: number;
    initialStockMilli: number;
    lowStockThresholdMilli: number;
    unit: string;
  },
) {
  const { user } = await requireShopPermission(shopId, "canManageProducts");
  if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("Invalid product name.");
  if (![input.purchaseCostCents, input.sellingPriceCents].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647)) {
    throw new Error("Product price is outside the supported range.");
  }
  if ((input.sku?.length ?? 0) > 64 || (input.barcode?.length ?? 0) > 64 || input.unit.trim().length < 1 || input.unit.trim().length > 24) {
    throw new Error("Invalid SKU, barcode, or unit.");
  }
  if (!Number.isSafeInteger(input.initialStockMilli) || input.initialStockMilli < 0 || input.initialStockMilli > 1_000_000_000) {
    throw new Error("Opening stock is outside the allowed range.");
  }
  if (!Number.isSafeInteger(input.lowStockThresholdMilli) || input.lowStockThresholdMilli < 0 || input.lowStockThresholdMilli > 1_000_000_000) {
    throw new Error("Low-stock threshold is outside the allowed range.");
  }
  const initialStockMilli = input.initialStockMilli;

  try {
    return await db.$transaction(async (tx) => {
      await assertShopProductCapacity(shopId, tx);
      const product = await tx.product.create({
        data: {
          shopId,
          name: input.name,
          sku: input.sku || null,
          barcode: input.barcode || null,
          purchaseCostCents: input.purchaseCostCents,
          sellingPriceCents: input.sellingPriceCents,
          stockQuantityMilli: initialStockMilli,
          lowStockThresholdMilli: input.lowStockThresholdMilli,
          unit: input.unit,
        },
        select: { id: true, name: true },
      });
    if (input.initialStockMilli > 0) {
      await tx.inventoryMovement.create({
        data: {
          shopId,
          productId: product.id,
          actorId: user.id,
          type: "OPENING",
          quantityDeltaMilli: initialStockMilli,
          reason: "Opening stock",
          idempotencyKey: `opening:${product.id}`,
        },
      });
      }
      return product;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("That SKU or barcode is already in use in this shop.");
    }
    throw error;
  }
}

export async function updateShopProduct(
  shopId: string,
  productId: string,
  input: { name: string; sku?: string; barcode?: string; purchaseCostCents: number; sellingPriceCents: number; lowStockThresholdMilli: number; unit: string },
) {
  const { user } = await requireShopPermission(shopId, "canManageProducts");
  if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("Invalid product name.");
  if (![input.purchaseCostCents, input.sellingPriceCents].every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647)) throw new Error("Product price is outside the supported range.");
  if ((input.sku?.length ?? 0) > 64 || (input.barcode?.length ?? 0) > 64 || input.unit.trim().length < 1 || input.unit.trim().length > 24) throw new Error("Invalid SKU, barcode, or unit.");
  if (!Number.isSafeInteger(input.lowStockThresholdMilli) || input.lowStockThresholdMilli < 0 || input.lowStockThresholdMilli > 1_000_000_000) throw new Error("Low-stock threshold is outside the allowed range.");
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.product.findFirst({ where: { id: productId, shopId, status: "ACTIVE" }, select: { unit: true } });
      if (!current) throw new Error("Product not found in this shop.");
      if (current.unit !== input.unit.trim() && await tx.inventoryMovement.count({ where: { shopId, productId } }) > 0) {
        throw new Error("Product unit cannot change after stock history exists.");
      }
      const changed = await tx.product.updateMany({
        where: { id: productId, shopId, status: "ACTIVE" },
        data: {
          name: input.name.trim(), sku: input.sku || null, barcode: input.barcode || null,
          purchaseCostCents: input.purchaseCostCents, sellingPriceCents: input.sellingPriceCents,
          lowStockThresholdMilli: input.lowStockThresholdMilli, unit: input.unit.trim(),
        },
      });
      if (changed.count !== 1) throw new Error("Product not found in this shop.");
      await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "PRODUCT_UPDATED", entityType: "Product", entityId: productId, summary: "Product details updated" } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("That SKU or barcode is already in use in this shop.");
    throw error;
  }
}

export async function archiveShopProduct(shopId: string, productId: string) {
  const { user } = await requireShopPermission(shopId, "canManageProducts");
  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, shopId, status: "ACTIVE" }, select: { id: true, stockQuantityMilli: true } });
    if (!product) throw new Error("Product not found in this shop.");
    if (product.stockQuantityMilli !== 0) throw new Error("Adjust stock to zero before archiving this product.");
    const archived = await tx.product.updateMany({ where: { id: productId, shopId, status: "ACTIVE", stockQuantityMilli: 0 }, data: { status: "ARCHIVED" } });
    if (archived.count !== 1) throw new Error("Adjust stock to zero before archiving this product.");
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "PRODUCT_ARCHIVED", entityType: "Product", entityId: productId, summary: "Product archived" } });
  });
}

export async function adjustShopStock(
  shopId: string,
  productId: string,
  input: { deltaMilli: number; reason: string; idempotencyKey: string; movementType?: "ADJUSTMENT" | "RESTOCK" },
) {
  const { user } = await requireShopPermission(shopId, "canAdjustInventory");
  if (!Number.isSafeInteger(input.deltaMilli) || input.deltaMilli === 0 || Math.abs(input.deltaMilli) > 1_000_000_000) {
    throw new Error("Stock adjustment is outside the allowed range.");
  }
  if (input.reason.trim().length < 3 || input.reason.trim().length > 200 || !/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) {
    throw new Error("A valid adjustment reason and request key are required.");
  }
  const deltaMilli = input.deltaMilli;
  if (input.movementType === "RESTOCK" && deltaMilli < 0) throw new Error("Restock quantity must be positive.");

  try {
    return await db.$transaction(async (tx) => {
      const alreadyApplied = await tx.inventoryMovement.findUnique({
        where: { shopId_idempotencyKey: { shopId, idempotencyKey: input.idempotencyKey } },
        select: { id: true },
      });
      if (alreadyApplied) return { duplicate: true as const };

      const product = await tx.product.findFirst({
        where: { id: productId, shopId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!product) throw new Error("Product not found in this shop.");

      const quantity = Math.abs(deltaMilli);
      const changed = await tx.product.updateMany({
        where: {
          id: productId,
          shopId,
          status: "ACTIVE",
          ...(deltaMilli < 0
            ? { stockQuantityMilli: { gte: quantity } }
            : { stockQuantityMilli: { lte: 2_147_483_647 - quantity } }),
        },
        data: deltaMilli < 0
          ? { stockQuantityMilli: { decrement: quantity } }
          : { stockQuantityMilli: { increment: quantity } },
      });
      if (changed.count !== 1) {
        throw new Error(deltaMilli < 0 ? "Stock cannot be reduced below zero." : "Stock limit exceeded.");
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          shopId,
          productId,
          actorId: user.id,
          type: input.movementType === "RESTOCK" ? "RESTOCK" : deltaMilli > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          quantityDeltaMilli: deltaMilli,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          shopId,
          action: input.movementType === "RESTOCK" ? "INVENTORY_RESTOCKED" : "INVENTORY_ADJUSTED",
          entityType: "InventoryMovement",
          entityId: movement.id,
          summary: `${movement.type} · ${deltaMilli > 0 ? "+" : ""}${deltaMilli} milli · ${input.reason.trim()}`,
        },
      });
      return { duplicate: false as const };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true as const };
    }
    throw error;
  }
}
