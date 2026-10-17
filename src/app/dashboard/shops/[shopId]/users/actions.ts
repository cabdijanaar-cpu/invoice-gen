"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addShopMember, updateShopMember } from "@/server/shops/members";

const roleSchema = z.enum(["MANAGER", "CASHIER"]);
const formString = (form: FormData, key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
const permission = (form: FormData, key: string) => form.get(key) === "on";
const route = (shopId: string, message: string, error = false): never => redirect(`/dashboard/shops/${shopId}/users?${error ? "error" : "message"}=${encodeURIComponent(message)}`);

export async function addShopMemberAction(shopId: string, form: FormData) {
  try {
    const email = z.string().trim().email().max(254).parse(formString(form, "email")).toLowerCase();
    const role = roleSchema.parse(formString(form, "role"));
    await addShopMember(shopId, email, role);
  } catch (error) {
    const message = error instanceof Error && !(error instanceof z.ZodError) ? error.message : "Enter a valid email and role.";
    revalidatePath(`/dashboard/shops/${shopId}/users`);
    route(shopId, message, true);
  }
  revalidatePath(`/dashboard/shops/${shopId}/users`);
  revalidatePath("/dashboard");
  route(shopId, "Staff member added.");
}

export async function updateShopMemberAction(shopId: string, membershipId: string, form: FormData) {
  try {
    const role = roleSchema.parse(formString(form, "role"));
    const status = z.enum(["ACTIVE", "SUSPENDED"]).parse(formString(form, "status"));
    await updateShopMember(shopId, membershipId, {
      role, status,
      canViewReports: permission(form, "canViewReports"),
      canManageProducts: permission(form, "canManageProducts"),
      canManageCustomers: permission(form, "canManageCustomers"),
      canManageSettings: permission(form, "canManageSettings"),
      canManageUsers: permission(form, "canManageUsers"),
      canAdjustInventory: permission(form, "canAdjustInventory"),
    });
  } catch (error) {
    const message = error instanceof Error && !(error instanceof z.ZodError) ? error.message : "Check the staff permissions and try again.";
    revalidatePath(`/dashboard/shops/${shopId}/users`);
    route(shopId, message, true);
  }
  revalidatePath(`/dashboard/shops/${shopId}/users`);
  revalidatePath("/dashboard");
  route(shopId, "Staff permissions updated.");
}
