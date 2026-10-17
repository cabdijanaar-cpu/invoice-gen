import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getShopEntitlement } from "@/server/platform/entitlements";

const COOKIE_NAME = "invoice_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  auditAction: "AUTH_SESSION_CREATED" | "AUTH_LOGIN_SUCCESS" = "AUTH_SESSION_CREATED",
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1_000);
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(COOKIE_NAME)?.value;
  await db.$transaction(async (tx) => {
    if (previousToken) await tx.session.deleteMany({ where: { tokenHash: hashToken(previousToken) } });
    await tx.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
    await tx.auditLog.create({ data: { actorId: userId, action: auditAction, entityType: "Session", summary: "Authentication session started" } });
  });
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    try {
      const session = await db.session.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
      if (session) {
        await db.session.deleteMany({ where: { id: session.id } });
        await db.auditLog.create({ data: { actorId: session.userId, action: "AUTH_LOGOUT", entityType: "Session", summary: "Authentication session ended" } });
      }
    } finally {
      cookieStore.delete(COOKIE_NAME);
    }
  }
}

/** Call from a scheduled maintenance task; this module does not create a scheduler. */
export async function removeExpiredSessions(now = new Date()): Promise<number> {
  const result = await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return result.count;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          globalRole: true,
          status: true,
          memberships: {
            where: { status: "ACTIVE", shop: { status: "ACTIVE" } },
            select: {
              id: true,
              shopId: true,
              role: true,
              canViewReports: true,
              canManageProducts: true,
              canManageCustomers: true,
              canManageSettings: true,
              canManageUsers: true,
              canAdjustInventory: true,
              shop: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
    await db.session.deleteMany({ where: { id: session.id } });
    cookieStore.delete(COOKIE_NAME);
    return null;
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireShopMembership(shopId: string, roles?: string[], options?: { skipSubscriptionCheck?: boolean }) {
  const user = await requireUser();
  const membership = user.memberships.find((candidate) => candidate.shopId === shopId);
  if (!membership || (roles && !roles.includes(membership.role))) {
    throw new Error("You do not have permission to access this shop.");
  }
  if (!options?.skipSubscriptionCheck) {
    const entitlement = await getShopEntitlement(shopId);
    if (entitlement && !entitlement.hasAccess) throw new Error("This shop's subscription is inactive or expired. Contact the shop owner.");
  }
  return { user, membership };
}

export async function requireShopPermission(
  shopId: string,
  permission: "canManageProducts" | "canManageCustomers" | "canManageSettings" | "canManageUsers" | "canAdjustInventory" | "canViewReports",
) {
  const { user, membership } = await requireShopMembership(shopId);
  if (membership.role !== "SHOP_OWNER" && !membership[permission]) {
    throw new Error("You do not have permission to perform this action.");
  }
  return { user, membership };
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.globalRole !== "SUPER_ADMIN") throw new Error("You do not have permission to access this page.");
  return user;
}
