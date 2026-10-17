import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const cleanup = vi.hoisted(() => ({
  sessions: vi.fn(),
  resetTokens: vi.fn(),
  rateLimitBuckets: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ removeExpiredSessions: cleanup.sessions }));
vi.mock("@/server/auth/password-reset", () => ({ removeExpiredPasswordResetTokens: cleanup.resetTokens }));
vi.mock("@/server/auth/rate-limit", () => ({ removeExpiredAuthRateLimits: cleanup.rateLimitBuckets }));

import { GET, POST } from "./route";

function request(authorization?: string) {
  return new NextRequest("https://invoiceflow.example.test/api/internal/maintenance/cleanup", {
    method: "POST",
    headers: authorization ? { authorization } : undefined,
  });
}

describe("maintenance cleanup route", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("rejects requests when the cron secret is missing or incorrect", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-enough-test-secret-value-123456");

    const missing = await POST(request());
    const incorrect = await POST(request("Bearer incorrect-secret"));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(cleanup.sessions).not.toHaveBeenCalled();
    expect(cleanup.resetTokens).not.toHaveBeenCalled();
    expect(cleanup.rateLimitBuckets).not.toHaveBeenCalled();
  });

  it("runs only the expired-record cleanups for a valid bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-enough-test-secret-value-123456");
    cleanup.sessions.mockResolvedValue(2);
    cleanup.resetTokens.mockResolvedValue(3);
    cleanup.rateLimitBuckets.mockResolvedValue(4);

    const response = await POST(request("Bearer a-long-enough-test-secret-value-123456"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: { sessions: 2, resetTokens: 3, rateLimitBuckets: 4 } });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cleanup.sessions).toHaveBeenCalledOnce();
    expect(cleanup.resetTokens).toHaveBeenCalledOnce();
    expect(cleanup.rateLimitBuckets).toHaveBeenCalledOnce();
  });

  it("allows the authenticated GET request used by Vercel Cron", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-enough-test-secret-value-123456");
    cleanup.sessions.mockResolvedValue(0);
    cleanup.resetTokens.mockResolvedValue(0);
    cleanup.rateLimitBuckets.mockResolvedValue(0);

    const response = await GET(request("Bearer a-long-enough-test-secret-value-123456"));

    expect(response.status).toBe(200);
    expect(cleanup.sessions).toHaveBeenCalledOnce();
    expect(cleanup.resetTokens).toHaveBeenCalledOnce();
    expect(cleanup.rateLimitBuckets).toHaveBeenCalledOnce();
  });
});
