"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { parseMoneyToCents } from "@/server/domain/money";
import { parseQuantityToMilli } from "@/server/domain/quantity";
import { adjustShopStock, archiveShopProduct, createShopProduct, updateShopProduct } from "@/server/shops/products";

export type ProductActionState = { error?: string; success?: string; nextRequestId?: string };

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(64),
  barcode: z.string().trim().max(64),
  purchaseCost: z.string(),
  sellingPrice: z.string(),
  initialStock: z.string().max(11),
  lowStockThreshold: z.string().max(11),
  unit: z.string().trim().min(1).max(24),
});

export async function createProductAction(
  shopId: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = productSchema.safeParse({
    name: text(formData, "name"), sku: text(formData, "sku"), barcode: text(formData, "barcode"),
    purchaseCost: text(formData, "purchaseCost"), sellingPrice: text(formData, "sellingPrice"),
    initialStock: text(formData, "initialStock"), lowStockThreshold: text(formData, "lowStockThreshold"), unit: text(formData, "unit"),
  });
  if (!parsed.success) return { error: "Check the product details and try again." };
  const purchaseCostCents = parseMoneyToCents(parsed.data.purchaseCost);
  const sellingPriceCents = parseMoneyToCents(parsed.data.sellingPrice);
  if (purchaseCostCents === null || sellingPriceCents === null) return { error: "Enter valid prices with up to two decimal places." };
  const initialStockMilli = parseQuantityToMilli(parsed.data.initialStock);
  const lowStockThresholdMilli = parseQuantityToMilli(parsed.data.lowStockThreshold);
  if (initialStockMilli === null || lowStockThresholdMilli === null) return { error: "Enter stock quantities with up to three decimal places." };

  try {
    await createShopProduct(shopId, {
      name: parsed.data.name,
      sku: parsed.data.sku.toUpperCase(),
      barcode: parsed.data.barcode,
      purchaseCostCents,
      sellingPriceCents,
      initialStockMilli,
      lowStockThresholdMilli,
      unit: parsed.data.unit,
    });
    return { success: "Product added." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product could not be saved.";
    if (message.includes("permission") || message.includes("already in use")) return { error: message };
    return { error: "Product could not be saved. Please try again." };
  }
}

const adjustmentSchema = z.object({
  delta: z.string().max(12),
  reason: z.string().trim().min(3).max(200),
  idempotencyKey: z.string().uuid(),
  movementType: z.enum(["ADJUSTMENT", "RESTOCK"]),
});

export async function adjustStockAction(
  shopId: string,
  productId: string,
  _previous: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = adjustmentSchema.safeParse({
    delta: text(formData, "delta"),
    reason: text(formData, "reason"),
    idempotencyKey: text(formData, "idempotencyKey"),
    movementType: text(formData, "movementType") || "ADJUSTMENT",
  });
  if (!parsed.success) return { error: "Enter a non-zero quantity adjustment and a reason." };
  const deltaMilli = parseQuantityToMilli(parsed.data.delta, true);
  if (deltaMilli === null || deltaMilli === 0) return { error: "Enter a non-zero quantity with up to three decimal places." };

  try {
    const result = await adjustShopStock(shopId, productId, {
      deltaMilli,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
      movementType: parsed.data.movementType,
    });
    return {
      success: result.duplicate ? "This adjustment was already recorded." : "Stock updated.",
      nextRequestId: randomUUID(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stock could not be updated.";
    if (message.includes("permission") || message.includes("below zero") || message.includes("positive")) return { error: message };
    return { error: "Stock could not be updated. Check the product and try again." };
  }
}

const productEditSchema = z.object({
  name: z.string().trim().min(2).max(120), sku: z.string().trim().max(64), barcode: z.string().trim().max(64),
  purchaseCost: z.string(), sellingPrice: z.string(), lowStockThreshold: z.string().max(11), unit: z.string().trim().min(1).max(24),
});

export type ProductManageState = { error?: string; success?: string };

export async function updateProductAction(shopId: string, productId: string, _previous: ProductManageState, formData: FormData): Promise<ProductManageState> {
  const parsed = productEditSchema.safeParse({
    name: text(formData, "name"), sku: text(formData, "sku"), barcode: text(formData, "barcode"),
    purchaseCost: text(formData, "purchaseCost"), sellingPrice: text(formData, "sellingPrice"),
    lowStockThreshold: text(formData, "lowStockThreshold"), unit: text(formData, "unit"),
  });
  if (!parsed.success) return { error: "Check the product details and try again." };
  const purchaseCostCents = parseMoneyToCents(parsed.data.purchaseCost);
  const sellingPriceCents = parseMoneyToCents(parsed.data.sellingPrice);
  if (purchaseCostCents === null || sellingPriceCents === null) return { error: "Enter valid prices with up to two decimal places." };
  const lowStockThresholdMilli = parseQuantityToMilli(parsed.data.lowStockThreshold);
  if (lowStockThresholdMilli === null) return { error: "Enter a low-stock threshold with up to three decimal places." };
  try {
    await updateShopProduct(shopId, productId, {
      name: parsed.data.name, sku: parsed.data.sku.toUpperCase(), barcode: parsed.data.barcode,
      purchaseCostCents, sellingPriceCents, lowStockThresholdMilli, unit: parsed.data.unit,
    });
    revalidatePath(`/dashboard/shops/${shopId}/products`);
    return { success: "Product details saved." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product could not be updated.";
    return { error: message.includes("permission") || message.includes("SKU or barcode") || message.includes("unit cannot change") ? message : "Product could not be updated. Check its details and try again." };
  }
}

export async function archiveProductAction(shopId: string, productId: string, _previous: ProductManageState, _formData: FormData): Promise<ProductManageState> {
  void _previous;
  void _formData;
  try {
    await archiveShopProduct(shopId, productId);
    revalidatePath(`/dashboard/shops/${shopId}/products`);
    return { success: "Product archived." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product could not be archived.";
    return { error: message.includes("permission") || message.includes("Adjust stock") ? message : "Product could not be archived. Check the product and try again." };
  }
}
