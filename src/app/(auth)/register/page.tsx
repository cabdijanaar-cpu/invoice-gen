"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-sm font-semibold text-[var(--forest)]">← InvoiceFlow</Link>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight">Create your workspace</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Your account will start as the owner of one shop.</p>
        <form action={action} className="mt-7 space-y-4">
          <label className="block text-sm font-medium">Your name
            <input name="name" autoComplete="name" required minLength={2} maxLength={100} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          <label className="block text-sm font-medium">Shop name
            <input name="shopName" autoComplete="organization" required minLength={2} maxLength={120} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          <label className="block text-sm font-medium">Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
          </label>
          <label className="block text-sm font-medium">Password
            <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
            <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Use at least 12 characters.</span>
          </label>
          {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
          <button disabled={pending} className="w-full rounded-xl bg-[var(--forest)] px-4 py-3 font-medium text-white disabled:opacity-60">
            {pending ? "Creating workspace…" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-sm text-[var(--muted)]">Already registered? <Link className="font-medium text-[var(--forest)]" href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
