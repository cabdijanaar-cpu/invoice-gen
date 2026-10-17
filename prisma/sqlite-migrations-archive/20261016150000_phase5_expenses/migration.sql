ALTER TABLE "Expense" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Expense" ADD COLUMN "reversedAt" DATETIME;
ALTER TABLE "Expense" ADD COLUMN "reversalReason" TEXT;
CREATE UNIQUE INDEX "Expense_shopId_idempotencyKey_key" ON "Expense"("shopId", "idempotencyKey");
