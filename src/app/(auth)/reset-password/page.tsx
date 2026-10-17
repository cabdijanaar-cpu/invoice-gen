import Link from "next/link";
import type { Metadata } from "next";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const resetToken = typeof token === "string" ? token : "";

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-7 shadow-sm sm:p-9">
        <Link href="/login" className="text-sm font-semibold text-[var(--forest)]">â† InvoiceFlow</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Reset links expire after 30 minutes and can only be used once.</p>
        <PasswordForm token={resetToken} />
      </section>
    </main>
  );
}
