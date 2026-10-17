"use client";
import { useActionState } from "react";
import { createExpenseAction, type ExpenseState } from "./actions";
const initial: ExpenseState = {};
export function ExpenseForm({ shopId, today }: { shopId: string; today: string }) {
  const action = createExpenseAction.bind(null, shopId);
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5">
    <h2 className="font-semibold">Record an expense</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Category<input required name="category" maxLength={60} placeholder="Rent, utilities…" className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
      <label className="text-sm">Date<input required type="date" name="incurredAt" defaultValue={today} className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
    </div>
    <label className="block text-sm">Description<input required name="description" maxLength={200} className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Amount (USD)<input required inputMode="decimal" name="amount" placeholder="0.00" className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
      <label className="text-sm">Payment method<input name="method" maxLength={40} placeholder="Cash, transfer…" className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
    </div>
    <label className="block text-sm">Reference<input name="reference" maxLength={100} className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
    <label className="block text-sm">Notes<textarea name="notes" maxLength={500} rows={2} className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2" /></label>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.success && <p role="status" className="text-sm text-[var(--forest)]">{state.success}</p>}
    <button disabled={pending} className="rounded-xl bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save expense"}</button>
  </form>;
}
