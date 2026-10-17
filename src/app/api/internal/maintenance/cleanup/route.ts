import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { removeExpiredPasswordResetTokens } from "@/server/auth/password-reset";
import { removeExpiredAuthRateLimits } from "@/server/auth/rate-limit";
import { removeExpiredSessions } from "@/server/auth/session";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || secret.length < 32 || !authorization || authorization.length > 512) return false;

  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256").update(authorization).digest();
  return timingSafeEqual(expected, received) && authorization.startsWith("Bearer ");
}

async function runCleanup(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [sessions, resetTokens, rateLimitBuckets] = await Promise.all([
      removeExpiredSessions(),
      removeExpiredPasswordResetTokens(),
      removeExpiredAuthRateLimits(),
    ]);
    return NextResponse.json(
      { deleted: { sessions, resetTokens, rateLimitBuckets } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Maintenance cleanup failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// Vercel Cron invokes routes with GET and supplies Authorization when CRON_SECRET is configured.
export async function GET(request: NextRequest) {
  return runCleanup(request);
}

export async function POST(request: NextRequest) {
  return runCleanup(request);
}
