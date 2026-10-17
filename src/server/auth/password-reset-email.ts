import "server-only";

type ResetEmail = { to: string; resetUrl: string; expiresInMinutes: number };

function getEmailConfig() {
  const endpoint = process.env.EMAIL_DELIVERY_URL;
  const token = process.env.EMAIL_DELIVERY_TOKEN;
  const from = process.env.EMAIL_FROM;
  const appUrl = process.env.APP_URL;
  if (!endpoint || !token || !from || !appUrl) throw new Error("Password reset email delivery is not configured.");

  const endpointUrl = new URL(endpoint);
  const app = new URL(appUrl);
  if (!(["https:", "http:"].includes(endpointUrl.protocol) && ["https:", "http:"].includes(app.protocol))) {
    throw new Error("Password reset URLs must use HTTP or HTTPS.");
  }
  if (process.env.NODE_ENV === "production" && (endpointUrl.protocol !== "https:" || app.protocol !== "https:")) {
    throw new Error("Password reset email delivery requires HTTPS in production.");
  }
  if (endpointUrl.username || endpointUrl.password || app.username || app.password) {
    throw new Error("Email endpoint and application URL must not include credentials.");
  }
  return { endpoint: endpointUrl.toString(), token, from, appUrl: app.origin };
}

export function assertPasswordResetEmailConfigured(): string {
  return getEmailConfig().appUrl;
}

export async function sendPasswordResetEmail({ to, resetUrl, expiresInMinutes }: ResetEmail): Promise<void> {
  const { endpoint, token, from } = getEmailConfig();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your InvoiceFlow password",
      text: `Use this secure link to reset your password: ${resetUrl}\n\nThis link expires in ${expiresInMinutes} minutes. If you did not request a reset, you can ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Password reset email delivery failed.");
}
