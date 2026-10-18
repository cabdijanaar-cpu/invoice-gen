"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createShopExpense, reverseShopExpense } from "@/server/shops/expenses";
import { parseMoneyToCents } from "@/server/domain/money";

export type ExpenseState = { error?: string; success?: string };
const schema = z.object({ category: z.string().trim().min(2).max(60), description: z.string().trim().min(2).max(200), amount: z.string(), method: z.string().trim().max(40), reference: z.string().trim().max(100), notes: z.string().trim().max(500), incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function createExpenseAction(shopId: string, _previous: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const parsed = schema.safeParse(Object.fromEntries(["category", "description", "amount", "method", "reference", "notes", "incurredAt"].map((key) => [key, formData.get(key) ?? ""])));
  if (!parsed.success) return { error: "Check the expense details and try again." };
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (!amountCents) return { error: "Enter a positive amount with up to two decimal places." };
  try {
    await createShopExpense(shopId, {
      category: parsed.data.category,
      description: parsed.data.description,
      amountCents,
      method: parsed.data.method || undefined,
      reference: parsed.data.reference || undefined,
      notes: parsed.data.notes || undefined,
      incurredAt: new Date(`${parsed.data.incurredAt}T12:00:00.000Z`),
    });
    revalidatePath(`/dashboard/shops/${shopId}`);
    revalidatePath(`/dashboard/shops/${shopId}/expenses`);
    revalidatePath(`/dashboard/shops/${shopId}/reports`);
    return { success: "Expense recorded." };
  }
  catch (e) { const m = e instanceof Error ? e.message : "Expense could not be recorded."; return { error: m.includes("permission") ? m : "Expense could not be recorded. Check the details and try again." }; }
}
export async function reverseExpenseAction(shopId: string, expenseId: string, _previous: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const reason = String(formData.get("reason") ?? "");
  try { await reverseShopExpense(shopId, expenseId, reason); revalidatePath(`/dashboard/shops/${shopId}/expenses`); revalidatePath(`/dashboard/shops/${shopId}/reports`); return { success: "Expense reversed and retained in history." }; }
  catch (e) { const m = e instanceof Error ? e.message : "Expense could not be reversed."; return { error: m.includes("permission") ? m : "Expense could not be reversed. Check the reason and try again." }; }
}
