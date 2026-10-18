"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white p-7 shadow-[0_24px_80px_-44px_rgba(21,61,44,0.3)] sm:p-9">
        <Link href="/" className="text-sm font-semibold text-[var(--forest)]">← InvoiceFlow</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Sign in to continue to your shop workspace.</p>
        <form action={action} className="mt-7 space-y-4">
          <label className="block text-sm font-medium">Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          <label className="block text-sm font-medium">Password
            <input name="password" type="password" autoComplete="current-password" required maxLength={256} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-[var(--forest)] px-4 py-3 font-semibold text-white shadow-sm hover:bg-[#20573d] disabled:opacity-60">
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-[var(--muted)]">New to InvoiceFlow? <Link className="font-medium text-[var(--forest)]" href="/register">Create an account</Link></p>
        <p className="mt-3 text-sm text-[var(--muted)]"><Link className="font-medium text-[var(--forest)]" href="/forgot-password">Forgot your password?</Link></p>
      </section>
    </main>
  );
}
