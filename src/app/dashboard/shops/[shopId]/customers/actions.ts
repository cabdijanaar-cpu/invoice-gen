"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { archiveShopCustomer, createShopCustomer, findPotentialShopCustomerDuplicates, updateShopCustomer } from "@/server/shops/customers";

export type CustomerActionState = { error?: string; success?: string; possibleDuplicates?: { id: string; name: string; email: string | null; phone: string | null }[] };

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(32),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(1_000),
  confirmPossibleDuplicates: z.boolean().optional(),
});

const readCustomerFields = (formData: FormData) => ({
  name: formData.get("name"), email: formData.get("email"), phone: formData.get("phone"),
  address: formData.get("address"), notes: formData.get("notes"), confirmPossibleDuplicates: formData.get("confirmPossibleDuplicates") === "on",
});

export async function createCustomerAction(
  shopId: string,
  _previous: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = customerSchema.safeParse(readCustomerFields(formData));
  if (!parsed.success) return { error: "Check the customer details and try again." };

  try {
    const possibleDuplicates = await findPotentialShopCustomerDuplicates(shopId, parsed.data);
    if (possibleDuplicates.length && !parsed.data.confirmPossibleDuplicates) return { possibleDuplicates };
    await createShopCustomer(shopId, {
      name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone,
      address: parsed.data.address, notes: parsed.data.notes,
    });
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: "Customer added." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer could not be saved.";
    if (message.includes("permission")) return { error: message };
    if (message.includes("already exists")) return { error: message };
    return { error: "Customer could not be saved. Please try again." };
  }
}

export async function updateCustomerAction(shopId: string, customerId: string, _previous: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = customerSchema.safeParse(readCustomerFields(formData));
  if (!parsed.success) return { error: "Check the customer details and try again." };
  try {
    await updateShopCustomer(shopId, customerId, parsed.data);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: "Customer details saved." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer could not be updated.";
    return { error: message.includes("permission") || message.includes("already exists") ? message : "Customer could not be updated. Check the details and try again." };
  }
}

export async function archiveCustomerAction(shopId: string, customerId: string, _previous: CustomerActionState, _formData: FormData): Promise<CustomerActionState> {
  void _previous;
  void _formData;
  try {
    await archiveShopCustomer(shopId, customerId);
    revalidatePath(`/dashboard/shops/${shopId}/customers`);
    return { success: "Customer archived. Their financial history remains available." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer could not be archived.";
    return { error: message.includes("permission") ? message : "Customer could not be archived. Refresh the page and try again." };
  }
}
