import "server-only";
import { db } from "@/lib/db";
import { requireShopPermission } from "@/server/auth/session";

export async function getShopSettings(shopId: string) {
  await requireShopPermission(shopId, "canManageSettings");
  const [shop, settings] = await Promise.all([db.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true } }), db.shopSettings.findUnique({ where: { shopId } })]);
  if (!shop || !settings) throw new Error("Shop settings are unavailable.");
  return { ...shop, settings };
}

export async function updateShopSettings(shopId: string, input: { legalName: string; address: string; phone: string; email: string; website: string; taxId: string; invoicePrefix: string; quotationPrefix: string; defaultPaymentTerms: string; defaultTaxRateBps: number; defaultDiscountBps: number; primaryColor: string; footer: string; template: string }) {
  const { user } = await requireShopPermission(shopId, "canManageSettings");
  if (input.legalName.length > 160 || input.address.length > 300 || input.phone.length > 32 || input.email.length > 254 || input.website.length > 200 || input.taxId.length > 80 || !/^[A-Z0-9_-]{1,12}$/.test(input.invoicePrefix) || !/^[A-Z0-9_-]{1,12}$/.test(input.quotationPrefix) || input.defaultPaymentTerms.length > 500 || input.footer.length > 500 || input.defaultTaxRateBps < 0 || input.defaultTaxRateBps > 10000 || input.defaultDiscountBps < 0 || input.defaultDiscountBps > 10000 || !/^#[0-9A-Fa-f]{6}$/.test(input.primaryColor) || !["CLASSIC", "MODERN"].includes(input.template)) throw new Error("Invalid shop settings.");
  await db.$transaction(async (tx) => {
    await tx.shopSettings.update({ where: { shopId }, data: { legalName: input.legalName || null, address: input.address || null, phone: input.phone || null, email: input.email || null, website: input.website || null, taxId: input.taxId || null, invoicePrefix: input.invoicePrefix, quotationPrefix: input.quotationPrefix, defaultPaymentTerms: input.defaultPaymentTerms || null, defaultTaxRateBps: input.defaultTaxRateBps, defaultDiscountBps: input.defaultDiscountBps, primaryColor: input.primaryColor, footer: input.footer || null, template: input.template } });
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "SHOP_SETTINGS_UPDATED", entityType: "ShopSettings", summary: "Shop invoice and branding settings updated" } });
  });
}
