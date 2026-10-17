import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "./password";
import { assertPasswordResetEmailConfigured, sendPasswordResetEmail } from "./password-reset-email";

const RESET_LIFETIME_MS = 30 * 60 * 1_000;
const RESET_LIFETIME_MINUTES = RESET_LIFETIME_MS / 60_000;
const USED_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Call from a scheduled maintenance task; this module does not create a scheduler. */
export async function removeExpiredPasswordResetTokens(now = new Date()): Promise<number> {
  const usedBefore = new Date(now.getTime() - USED_TOKEN_RETENTION_MS);
  const result = await db.passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { usedAt: { lte: usedBefore } }] },
  });
  return result.count;
}

export async function requestPasswordReset(email: string): Promise<void> {
  const appUrl = assertPasswordResetEmailConfigured();
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_LIFETIME_MS);
  const resetUrl = new URL(`/reset-password?token=${encodeURIComponent(token)}`, appUrl).toString();

  await db.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "AUTH_PASSWORD_RESET_REQUESTED", entityType: "User", entityId: user.id, summary: "Password reset requested" } });
  });

  try {
    await sendPasswordResetEmail({ to: user.email, resetUrl, expiresInMinutes: RESET_LIFETIME_MINUTES });
  } catch (error) {
    await db.passwordResetToken.deleteMany({ where: { tokenHash } });
    throw error;
  }
}

export async function completePasswordReset(token: string, password: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const reset = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  const now = new Date();
  if (!reset || reset.usedAt || reset.expiresAt <= now) return false;

  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: reset.id, userId: reset.userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
    await tx.auditLog.create({ data: { actorId: reset.userId, action: "AUTH_PASSWORD_RESET_COMPLETED", entityType: "User", entityId: reset.userId, summary: "Password reset completed; existing sessions revoked" } });
    return true;
  });
}
