import "server-only";
import type { Prisma } from "@invoice/prisma-client";
import { db } from "@/lib/db";

export async function getShopEntitlement(shopId: string, client: Prisma.TransactionClient | typeof db = db) {
  const subscription = await client.subscription.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" }, include: { plan: true } });
  if (!subscription) return null; // Shops created before billing is configured remain grandfathered until assigned a plan.
  const now = new Date();
  const graceEnd = subscription.endsAt ? new Date(subscription.endsAt.getTime() + subscription.plan.graceDays * 86_400_000) : null;
  const statusAllowed = ["ACTIVE", "TRIAL", "GRACE"].includes(subscription.status);
  const hasStarted = !subscription.startsAt || subscription.startsAt <= now;
  const hasAccess = statusAllowed && hasStarted && (!subscription.endsAt || subscription.endsAt > now || (!!graceEnd && graceEnd > now));
  return { subscription, plan: subscription.plan, hasAccess, graceEnd };
}

export async function assertShopProductCapacity(shopId: string, tx: Prisma.TransactionClient) {
  const entitlement = await getShopEntitlement(shopId, tx);
  if (!entitlement) return;
  if (!entitlement.hasAccess) throw new Error("This shop's subscription is not active.");
  if (entitlement.plan.maxProducts !== null && await tx.product.count({ where: { shopId, status: "ACTIVE" } }) >= entitlement.plan.maxProducts) throw new Error("This shop has reached its plan's active product limit.");
}

export async function assertShopInvoiceCapacity(shopId: string, tx: Prisma.TransactionClient, current: Date) {
  const entitlement = await getShopEntitlement(shopId, tx);
  if (!entitlement) return;
  if (!entitlement.hasAccess) throw new Error("This shop's subscription is not active.");
  const limit = entitlement.plan.maxInvoicesPerMonth;
  if (limit === null) return;
  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  const end = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
  if (await tx.invoice.count({ where: { shopId, status: { in: ["FINALIZED", "VOID"] }, issuedAt: { gte: start, lt: end } } }) >= limit) throw new Error("This shop has reached its plan's monthly invoice limit.");
}

export async function assertShopMemberCapacity(shopId: string, tx: Prisma.TransactionClient) {
  const entitlement = await getShopEntitlement(shopId, tx);
  if (!entitlement) return;
  if (!entitlement.hasAccess) throw new Error("This shop's subscription is not active.");
  const limit = entitlement.plan.maxUsers;
  if (limit === null) return;
  if (await tx.shopMembership.count({ where: { shopId, status: "ACTIVE" } }) >= limit) {
    throw new Error("This shop has reached its plan's active member limit.");
  }
}
