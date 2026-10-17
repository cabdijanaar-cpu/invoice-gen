import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";

type ExpenseInput = { category: string; description: string; amountCents: number; method?: string; reference?: string; notes?: string; incurredAt: Date };
const MAX = 2_147_483_647;

export async function createShopExpense(shopId: string, input: ExpenseInput) {
  const { user, membership } = await requireShopMembership(shopId);
  if (membership.role === "CASHIER") throw new Error("You do not have permission to record expenses.");
  if (input.category.length < 2 || input.category.length > 60 || input.description.length < 2 || input.description.length > 200 || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > MAX || Number.isNaN(input.incurredAt.getTime())) throw new Error("Invalid expense details.");
  return db.$transaction(async (tx) => {
    const expense = await tx.expense.create({ data: { shopId, recordedById: user.id, ...input, idempotencyKey: randomUUID(), status: "POSTED" } });
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "EXPENSE_RECORDED", entityType: "Expense", entityId: expense.id, summary: `${input.category}: ${input.amountCents} cents` } });
    return expense;
  });
}

export async function reverseShopExpense(shopId: string, expenseId: string, reason: string) {
  const { user } = await requireShopMembership(shopId, ["SHOP_OWNER", "MANAGER"]);
  const cleanReason = reason.trim();
  if (cleanReason.length < 3 || cleanReason.length > 300) throw new Error("A reversal reason is required.");
  return db.$transaction(async (tx) => {
    const changed = await tx.expense.updateMany({ where: { id: expenseId, shopId, status: "POSTED" }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: cleanReason } });
    if (changed.count !== 1) throw new Error("This expense is already reversed or unavailable.");
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "EXPENSE_REVERSED", entityType: "Expense", entityId: expenseId, summary: cleanReason } });
  });
}

export async function listShopExpenses(shopId: string, from: Date, to: Date) {
  await requireShopMembership(shopId);
  return db.expense.findMany({ where: { shopId, incurredAt: { gte: from, lt: to } }, orderBy: [{ incurredAt: "desc" }, { id: "desc" }], take: 250, select: { id: true, category: true, description: true, amountCents: true, method: true, reference: true, notes: true, status: true, incurredAt: true, reversedAt: true, reversalReason: true } });
}
