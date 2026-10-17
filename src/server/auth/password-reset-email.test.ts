import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendPasswordResetEmail } from "./password-reset-email";

describe("password reset email delivery", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_DELIVERY_URL", "https://mail.example.test/send");
    vi.stubEnv("EMAIL_DELIVERY_TOKEN", "mail-provider-test-token");
    vi.stubEnv("EMAIL_FROM", "InvoiceFlow <no-reply@example.test>");
    vi.stubEnv("APP_URL", "https://invoiceflow.example.test");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a private reset message to the configured delivery endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendPasswordResetEmail({
      to: "customer@example.test",
      resetUrl: "https://invoiceflow.example.test/reset-password?token=opaque-token",
      expiresInMinutes: 30,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mail.example.test/send");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer mail-provider-test-token");
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: "customer@example.test",
      subject: "Reset your InvoiceFlow password",
      text: expect.stringContaining("opaque-token"),
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("requires HTTPS in production and rejects provider errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://invoiceflow.example.test");
    vi.stubEnv("EMAIL_DELIVERY_URL", "http://mail.example.test/send");

    await expect(sendPasswordResetEmail({ to: "customer@example.test", resetUrl: "https://invoiceflow.example.test/reset-password?token=secret", expiresInMinutes: 30 })).rejects.toThrow("HTTPS");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("EMAIL_DELIVERY_URL", "https://mail.example.test/send");
    await expect(sendPasswordResetEmail({ to: "customer@example.test", resetUrl: "https://invoiceflow.example.test/reset-password?token=secret", expiresInMinutes: 30 })).rejects.toThrow("delivery failed");
  });
});
