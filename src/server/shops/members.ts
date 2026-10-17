import "server-only";
import { db } from "@/lib/db";
import { requireShopPermission } from "@/server/auth/session";
import { assertShopMemberCapacity } from "@/server/platform/entitlements";

export type ShopStaffRole = "MANAGER" | "CASHIER";
export type ShopStaffPermissions = {
  canViewReports: boolean;
  canManageProducts: boolean;
  canManageCustomers: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
  canAdjustInventory: boolean;
};

const validRole = (role: string): role is ShopStaffRole => role === "MANAGER" || role === "CASHIER";

export async function listShopMembers(shopId: string) {
  await requireShopPermission(shopId, "canManageUsers");
  return db.shopMembership.findMany({
    where: { shopId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, role: true, status: true, canViewReports: true, canManageProducts: true,
      canManageCustomers: true, canManageSettings: true, canManageUsers: true,
      canAdjustInventory: true, createdAt: true,
      user: { select: { id: true, name: true, email: true, status: true } },
    },
  });
}

export async function addShopMember(shopId: string, email: string, role: ShopStaffRole) {
  const { user: actor } = await requireShopPermission(shopId, "canManageUsers");
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 || !validRole(role)) {
    throw new Error("Enter a valid account email and staff role.");
  }

  return db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, email: true, status: true } });
    if (!target || target.status !== "ACTIVE" || target.id === actor.id) {
      throw new Error("An active staff account with that email could not be added.");
    }
    const existing = await tx.shopMembership.findUnique({ where: { userId_shopId: { userId: target.id, shopId } } });
    if (existing?.status === "ACTIVE") throw new Error("That account is already an active member of this shop.");
    if (existing?.role === "SHOP_OWNER") throw new Error("The shop owner membership cannot be changed here.");
    await assertShopMemberCapacity(shopId, tx);

    const membership = existing
      ? await tx.shopMembership.update({ where: { id: existing.id }, data: { role, status: "ACTIVE", canViewReports: false, canManageProducts: false, canManageCustomers: false, canManageSettings: false, canManageUsers: false, canAdjustInventory: false } })
      : await tx.shopMembership.create({ data: { userId: target.id, shopId, role } });
    await tx.auditLog.create({ data: { actorId: actor.id, shopId, action: existing ? "SHOP_MEMBER_REACTIVATED" : "SHOP_MEMBER_ADDED", entityType: "ShopMembership", entityId: membership.id, summary: `Staff member · ${role}` } });
    return membership;
  });
}

export async function updateShopMember(
  shopId: string,
  membershipId: string,
  input: { role: ShopStaffRole; status: "ACTIVE" | "SUSPENDED" } & ShopStaffPermissions,
) {
  const { user: actor, membership: actorMembership } = await requireShopPermission(shopId, "canManageUsers");
  if (!validRole(input.role)) throw new Error("Choose a valid staff role.");
  const permissionValues = [input.canViewReports, input.canManageProducts, input.canManageCustomers, input.canManageSettings, input.canManageUsers, input.canAdjustInventory];
  if (permissionValues.some((value) => typeof value !== "boolean") || !["ACTIVE", "SUSPENDED"].includes(input.status)) {
    throw new Error("Invalid staff permissions or status.");
  }
  return db.$transaction(async (tx) => {
    const current = await tx.shopMembership.findFirst({ where: { id: membershipId, shopId }, include: { user: { select: { id: true, email: true } } } });
    if (!current || current.role === "SHOP_OWNER" || current.userId === actor.id) {
      throw new Error("This staff membership cannot be changed.");
    }
    if (actorMembership.role !== "SHOP_OWNER" && !current.canManageUsers && input.canManageUsers) {
      throw new Error("Only the shop owner can grant staff management permission.");
    }
    if (current.status !== "ACTIVE" && input.status === "ACTIVE") await assertShopMemberCapacity(shopId, tx);
    const updated = await tx.shopMembership.update({
      where: { id: current.id },
      data: {
        role: input.role, status: input.status,
        canViewReports: input.canViewReports, canManageProducts: input.canManageProducts,
        canManageCustomers: input.canManageCustomers, canManageSettings: input.canManageSettings,
        canManageUsers: input.canManageUsers, canAdjustInventory: input.canAdjustInventory,
      },
    });
    await tx.auditLog.create({ data: { actorId: actor.id, shopId, action: "SHOP_MEMBER_UPDATED", entityType: "ShopMembership", entityId: current.id, summary: `Staff permissions · ${input.role} · ${input.status}` } });
    return updated;
  });
}
