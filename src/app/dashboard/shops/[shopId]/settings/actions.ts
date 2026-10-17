"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateShopSettings } from "@/server/shops/settings";
export type SettingsState = { error?: string; success?: string };
const schema = z.object({ legalName: z.string().trim().max(160), address: z.string().trim().max(300), phone: z.string().trim().max(32), email: z.union([z.literal(""), z.string().trim().email().max(254)]), website: z.string().trim().max(200), taxId: z.string().trim().max(80), invoicePrefix: z.string().trim().toUpperCase().min(1).max(12), quotationPrefix: z.string().trim().toUpperCase().min(1).max(12), defaultPaymentTerms: z.string().trim().max(500), defaultTaxRate: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/), defaultDiscount: z.string().regex(/^\d{1,3}(?:\.\d{1,2})?$/), primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), footer: z.string().trim().max(500), template: z.enum(["CLASSIC", "MODERN"]) });
export async function updateSettingsAction(shopId: string, _previous: SettingsState, data: FormData): Promise<SettingsState> {
  const keys = ["legalName", "address", "phone", "email", "website", "taxId", "invoicePrefix", "quotationPrefix", "defaultPaymentTerms", "defaultTaxRate", "defaultDiscount", "primaryColor", "footer", "template"];
  const parsed = schema.safeParse(Object.fromEntries(keys.map((key) => [key, data.get(key) ?? ""])));
  if (!parsed.success) return { error: "Check the settings and try again." };
  const bps = (v: string) => { const [whole, fraction = ""] = v.split("."); return Number(whole) * 100 + Number(fraction.padEnd(2, "0")); };
  const d = parsed.data;
  try { await updateShopSettings(shopId, { legalName: d.legalName, address: d.address, phone: d.phone, email: d.email, website: d.website, taxId: d.taxId, invoicePrefix: d.invoicePrefix, quotationPrefix: d.quotationPrefix, defaultPaymentTerms: d.defaultPaymentTerms, defaultTaxRateBps: bps(d.defaultTaxRate), defaultDiscountBps: bps(d.defaultDiscount), primaryColor: d.primaryColor, footer: d.footer, template: d.template }); revalidatePath(`/dashboard/shops/${shopId}`); revalidatePath(`/dashboard/shops/${shopId}/settings`); return { success: "Settings saved." }; }
  catch (e) { const message = e instanceof Error ? e.message : "Settings could not be saved."; return { error: message.includes("permission") ? message : "Settings could not be saved. Check the fields and try again." }; }
}
