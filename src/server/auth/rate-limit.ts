import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

function getHashedKey(action: "login" | "register" | "password-reset", identifier: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32 || (process.env.NODE_ENV === "production" && secret.startsWith("development-only-"))) {
    throw new Error("AUTH_SECRET must be configured with a strong value.");
  }
  return createHmac("sha256", secret).update(`${action}:${identifier}`).digest("hex");
}

export async function consumeAuthAttempt(action: "login" | "register" | "password-reset", identifier: string, now = new Date()): Promise<boolean> {
  const windowStartedAt = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);
  const key = getHashedKey(action, identifier);

  const bucket = await db.authRateLimit.upsert({
    where: { key_windowStartedAt: { key, windowStartedAt } },
    create: { key, windowStartedAt, attempts: 1 },
    update: { attempts: { increment: 1 } },
    select: { attempts: true },
  });

  return bucket.attempts <= MAX_ATTEMPTS_PER_WINDOW;
}

/** Call from a scheduled maintenance task; this module does not create a scheduler. */
export async function removeExpiredAuthRateLimits(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const result = await db.authRateLimit.deleteMany({ where: { windowStartedAt: { lt: cutoff } } });
  return result.count;
}
