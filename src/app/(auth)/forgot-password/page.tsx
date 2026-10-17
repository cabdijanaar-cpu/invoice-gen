"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type PasswordResetActionState } from "../password-reset-actions";

const initialState: PasswordResetActionState = {};

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-7 shadow-sm sm:p-9">
        <Link href="/login" className="text-sm font-semibold text-[var(--forest)]">â† Back to sign in</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Enter the email address on your account. If it matches, we will email a secure reset link.</p>
        <form action={action} className="mt-7 space-y-4">
          <label className="block text-sm font-medium">Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          {state.message && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">{state.message}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-[var(--forest)] px-4 py-3 font-medium text-white disabled:opacity-60">
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      </section>
    </main>
  );
}
