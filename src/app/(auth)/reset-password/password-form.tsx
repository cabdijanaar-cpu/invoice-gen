"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type PasswordResetActionState } from "../password-reset-actions";

const initialState: PasswordResetActionState = {};

export function PasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);
  if (!token) {
    return <p className="mt-6 text-sm text-red-800">This reset link is invalid or expired. <Link className="font-medium text-[var(--forest)]" href="/forgot-password">Request another link</Link>.</p>;
  }

  return (
    <form action={action} className="mt-7 space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium">New password
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3.5 py-3 outline-none focus:border-[var(--forest)]" />
        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Use at least 12 characters.</span>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state.message && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">{state.message} <Link className="font-semibold underline" href="/login">Sign in</Link></p>}
      <button disabled={pending || Boolean(state.message)} className="w-full rounded-xl bg-[var(--forest)] px-4 py-3 font-medium text-white disabled:opacity-60">
        {pending ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
