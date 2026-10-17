"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitShopSubscriptionPayment } from "@/server/platform/admin";

export async function submitShopPaymentAction(shopId: string, formData: FormData) {
  const method = String(formData.get("method") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  try {
    await submitShopSubscriptionPayment(shopId, { method, reference, notes });
    revalidatePath(`/dashboard/shops/${shopId}/subscription`);
    redirect(`/dashboard/shops/${shopId}/subscription?message=${encodeURIComponent("Payment submitted for review.")}`);
  } catch {
    redirect(`/dashboard/shops/${shopId}/subscription?error=${encodeURIComponent("Could not submit payment. Check details and any pending submission.")}`);
  }
}
