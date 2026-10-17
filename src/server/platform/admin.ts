import "server-only";
import { db } from "@/lib/db";
import { requireSuperAdmin, requireShopMembership } from "@/server/auth/session";

const MAX_CENTS = 2_147_483_647;
const clean = (value: string, max: number) => value.trim().slice(0, max);

export async function getPlatformOverview() {
  const actor = await requireSuperAdmin();
  const [plans, shops, payments, users, counts] = await Promise.all([
    db.subscriptionPlan.findMany({ orderBy: [{ status: "asc" }, { monthlyPriceCents: "asc" }], include: { _count: { select: { subscriptions: true } } } }),
    db.shop.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, status: true, createdAt: true, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, interval: true, startsAt: true, endsAt: true, plan: { select: { name: true } } } }, _count: { select: { memberships: true } } } }),
    db.subscriptionPayment.findMany({ where: { status: "PENDING" }, orderBy: { submittedAt: "asc" }, take: 100, include: { subscription: { include: { shop: { select: { name: true } }, plan: { select: { name: true } } } } } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, email: true, globalRole: true, status: true, createdAt: true } }),
    Promise.all([db.shop.count(), db.subscription.count({ where: { status: { in: ["ACTIVE", "TRIAL"] }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] } }), db.subscriptionPayment.aggregate({ where: { status: "APPROVED" }, _sum: { amountCents: true }, _count: true }), db.user.count({ where: { globalRole: "SUPER_ADMIN", status: "ACTIVE" } })]),
  ]);
  return { plans, shops, payments, users, currentUserId: actor.id, stats: { shops: counts[0], entitledSubscriptions: counts[1], approvedPayments: counts[2]._count, approvedRevenueCents: counts[2]._sum.amountCents ?? 0, admins: counts[3] } };
}

export async function getPlatformAuditLog(page = 1, action = "") {
  await requireSuperAdmin();
  const safePage = Number.isSafeInteger(page) ? Math.min(Math.max(page, 1), 10_000) : 1;
  const cleanAction = action.trim().slice(0, 80);
  const where = cleanAction ? { action: { contains: cleanAction, mode: "insensitive" as const } } : undefined;
  const [events, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * 50,
      take: 50,
      select: {
        id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true,
        actor: { select: { name: true, email: true } },
        shop: { select: { name: true } },
      },
    }),
    db.auditLog.count({ where }),
  ]);
  return { events, total, page: safePage, pages: Math.max(1, Math.ceil(total / 50)), action: cleanAction };
}

export async function updatePlatformUserStatus(userId: string, status: "ACTIVE" | "SUSPENDED") {
  const actor = await requireSuperAdmin();
  if (status !== "ACTIVE" && status !== "SUSPENDED") throw new Error("Invalid account status.");
  if (actor.id === userId && status !== "ACTIVE") throw new Error("You cannot suspend your own administrator account.");
  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true, globalRole: true } });
    if (!target) throw new Error("User unavailable.");
    if (target.globalRole === "SUPER_ADMIN" && status === "SUSPENDED") {
      const activeAdmins = await tx.user.count({ where: { globalRole: "SUPER_ADMIN", status: "ACTIVE" } });
      if (activeAdmins <= 1) throw new Error("At least one active Super Admin account must remain.");
    }
    if (target.status === status) return;
    await tx.user.update({ where: { id: userId }, data: { status } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "PLATFORM_USER_STATUS_CHANGED", entityType: "User", entityId: userId, summary: `Account status · ${target.status} → ${status}` } });
  });
}

export async function createPlatformPlan(input: { name: string; monthlyPriceCents: number; yearlyPriceCents: number; trialDays: number; graceDays: number; maxUsers: number | null; maxProducts: number | null; maxInvoicesPerMonth: number | null; features: string }) {
  const actor = await requireSuperAdmin();
  validatePlan(input);
  return db.$transaction(async (tx) => {
    const plan = await tx.subscriptionPlan.create({ data: { ...input, name: clean(input.name, 80), features: clean(input.features, 1000), status: "ACTIVE" } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "PLAN_CREATED", entityType: "SubscriptionPlan", entityId: plan.id, summary: plan.name } });
    return plan;
  });
}

export async function updatePlatformPlan(planId: string, input: { name: string; monthlyPriceCents: number; yearlyPriceCents: number; trialDays: number; graceDays: number; maxUsers: number | null; maxProducts: number | null; maxInvoicesPerMonth: number | null; features: string; status: "ACTIVE" | "ARCHIVED" }) {
  const actor = await requireSuperAdmin();
  validatePlan(input);
  return db.$transaction(async (tx) => {
    const changed = await tx.subscriptionPlan.updateMany({ where: { id: planId }, data: { ...input, name: clean(input.name, 80), features: clean(input.features, 1000) } });
    if (!changed.count) throw new Error("Plan unavailable.");
    await tx.auditLog.create({ data: { actorId: actor.id, action: "PLAN_UPDATED", entityType: "SubscriptionPlan", entityId: planId, summary: `${input.name.trim()} · ${input.status}` } });
  });
}

function validatePlan(p: { name: string; monthlyPriceCents: number; yearlyPriceCents: number; trialDays: number; graceDays: number; maxUsers: number | null; maxProducts: number | null; maxInvoicesPerMonth: number | null; features: string }) {
  const positiveLimit = (v: number | null) => v === null || (Number.isSafeInteger(v) && v > 0 && v <= 1_000_000);
  if (p.name.trim().length < 2 || p.name.trim().length > 80 || !Number.isSafeInteger(p.monthlyPriceCents) || p.monthlyPriceCents < 0 || p.monthlyPriceCents > MAX_CENTS || !Number.isSafeInteger(p.yearlyPriceCents) || p.yearlyPriceCents < 0 || p.yearlyPriceCents > MAX_CENTS || !Number.isSafeInteger(p.trialDays) || p.trialDays < 0 || p.trialDays > 365 || !Number.isSafeInteger(p.graceDays) || p.graceDays < 0 || p.graceDays > 90 || !positiveLimit(p.maxUsers) || !positiveLimit(p.maxProducts) || !positiveLimit(p.maxInvoicesPerMonth) || p.features.length > 1000) throw new Error("Invalid subscription plan details.");
}

export async function assignPlatformSubscription(input: { shopId: string; planId: string; interval: "MONTHLY" | "YEARLY"; status: "TRIAL" | "ACTIVE"; startsAt: Date; endsAt: Date | null }) {
  const actor = await requireSuperAdmin();
  if (Number.isNaN(input.startsAt.getTime()) || (input.endsAt && (Number.isNaN(input.endsAt.getTime()) || input.endsAt <= input.startsAt))) throw new Error("Invalid subscription dates.");
  return db.$transaction(async (tx) => {
    const [shop, plan] = await Promise.all([tx.shop.findUnique({ where: { id: input.shopId }, select: { id: true, name: true } }), tx.subscriptionPlan.findFirst({ where: { id: input.planId, status: "ACTIVE" }, select: { id: true, name: true, trialDays: true } })]);
    if (!shop || !plan) throw new Error("Choose an available shop and active plan.");
    let endsAt = input.endsAt;
    if (input.status === "TRIAL") {
      if (plan.trialDays < 1) throw new Error("This plan does not include a trial.");
      const trialEnd = new Date(input.startsAt.getTime() + plan.trialDays * 86_400_000);
      if (endsAt && endsAt > trialEnd) throw new Error("The trial cannot exceed this plan's configured trial length.");
      endsAt ??= trialEnd;
    }
    await tx.subscription.updateMany({ where: { shopId: shop.id, status: { in: ["TRIAL", "ACTIVE", "GRACE"] } }, data: { status: "CANCELLED" } });
    const subscription = await tx.subscription.create({ data: { ...input, endsAt } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "SUBSCRIPTION_ASSIGNED", entityType: "Subscription", entityId: subscription.id, summary: `${shop.name}: ${plan.name} (${input.status})` } });
    return subscription;
  });
}

export async function updatePlatformSubscription(subscriptionId: string, status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED", endsAt: Date | null) {
  const actor = await requireSuperAdmin();
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new Error("Invalid subscription end date.");
  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { plan: { select: { trialDays: true } } } });
    if (!subscription) throw new Error("Subscription unavailable.");
    let startsAt = subscription.startsAt;
    let updatedEnd = endsAt;
    if (status === "TRIAL") {
      if (subscription.plan.trialDays < 1) throw new Error("This plan does not include a trial.");
      startsAt ??= new Date();
      const trialEnd = new Date(startsAt.getTime() + subscription.plan.trialDays * 86_400_000);
      if (updatedEnd && updatedEnd > trialEnd) throw new Error("The trial cannot exceed this plan's configured trial length.");
      updatedEnd ??= trialEnd;
    }
    await tx.subscription.update({ where: { id: subscriptionId }, data: { status, endsAt: updatedEnd, ...(status === "TRIAL" ? { startsAt } : {}) } });
    await tx.auditLog.create({ data: { actorId: actor.id, shopId: subscription.shopId, action: "SUBSCRIPTION_STATUS_CHANGED", entityType: "Subscription", entityId: subscriptionId, summary: `${status}${updatedEnd ? ` through ${updatedEnd.toISOString()}` : " without an end date"}` } });
  });
}

export async function updatePlatformShopStatus(shopId: string, status: "ACTIVE" | "SUSPENDED") {
  const actor = await requireSuperAdmin();
  return db.$transaction(async (tx) => {
    const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true, status: true } });
    if (!shop) throw new Error("Shop unavailable.");
    if (shop.status === status) return;
    await tx.shop.update({ where: { id: shopId }, data: { status } });
    await tx.auditLog.create({ data: {
      actorId: actor.id,
      shopId,
      action: "SHOP_STATUS_CHANGED",
      entityType: "Shop",
      entityId: shopId,
      summary: `${shop.status} → ${status}`,
    } });
  });
}

export async function reviewPlatformPayment(paymentId: string, decision: "APPROVED" | "REJECTED", note: string) {
  const actor = await requireSuperAdmin();
  const cleanNote = clean(note, 300);
  return db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId }, include: { subscription: true } });
    if (!payment || payment.status !== "PENDING") throw new Error("Payment has already been reviewed or is unavailable.");
    if (decision === "APPROVED" && (!Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0 || payment.amountCents > MAX_CENTS)) throw new Error("Payment amount is invalid.");
    const updated = await tx.subscriptionPayment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: decision, reviewedAt: new Date(), reviewedById: actor.id, notes: cleanNote || payment.notes } });
    if (updated.count !== 1) throw new Error("Payment has already been reviewed.");
    if (decision === "APPROVED") {
      const now = new Date();
      const base = payment.subscription.endsAt && payment.subscription.endsAt > now ? payment.subscription.endsAt : now;
      const end = new Date(base);
      if (payment.subscription.interval === "YEARLY") end.setUTCFullYear(end.getUTCFullYear() + 1); else end.setUTCMonth(end.getUTCMonth() + 1);
      await tx.subscription.update({ where: { id: payment.subscriptionId }, data: { status: "ACTIVE", startsAt: payment.subscription.startsAt ?? now, endsAt: end } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, shopId: payment.subscription.shopId, action: `SUBSCRIPTION_PAYMENT_${decision}`, entityType: "SubscriptionPayment", entityId: payment.id, summary: `${payment.amountCents} cents${cleanNote ? ` · ${cleanNote}` : ""}` } });
    return { id: payment.id, status: decision };
  });
}

export async function submitShopSubscriptionPayment(shopId: string, input: { method: string; reference: string; notes: string }) {
  await requireShopMembership(shopId, ["SHOP_OWNER"], { skipSubscriptionCheck: true });
  const method = input.method.trim();
  if (!["CASH", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].includes(method) || input.reference.length > 100 || input.notes.length > 300) throw new Error("Invalid payment submission.");
  return db.$transaction(async (tx) => {
    const subscription = await tx.subscription.findFirst({ where: { shopId, status: { in: ["TRIAL", "ACTIVE", "GRACE", "EXPIRED", "SUSPENDED"] } }, orderBy: { createdAt: "desc" }, include: { plan: true } });
    if (!subscription) throw new Error("This shop does not have a subscription to renew.");
    const pending = await tx.subscriptionPayment.findFirst({ where: { subscriptionId: subscription.id, status: "PENDING" }, select: { id: true } });
    if (pending) throw new Error("A payment submission is already awaiting review.");
    const amountCents = subscription.interval === "YEARLY" ? subscription.plan.yearlyPriceCents : subscription.plan.monthlyPriceCents;
    if (amountCents <= 0) throw new Error("This plan does not require a payment submission.");
    return tx.subscriptionPayment.create({ data: { subscriptionId: subscription.id, amountCents, method, reference: clean(input.reference, 100) || null, notes: clean(input.notes, 300) || null } });
  });
}

export async function getShopSubscription(shopId: string) {
  await requireShopMembership(shopId, ["SHOP_OWNER"], { skipSubscriptionCheck: true });
  return db.subscription.findFirst({ where: { shopId }, orderBy: { createdAt: "desc" }, include: { plan: true, payments: { orderBy: { submittedAt: "desc" }, take: 20 } } });
}
