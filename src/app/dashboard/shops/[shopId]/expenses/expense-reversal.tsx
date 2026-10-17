"use client";
import { useActionState } from "react";
import { reverseExpenseAction, type ExpenseState } from "./actions";
const initial: ExpenseState = {};
export function ExpenseReversal({ shopId, expenseId }: { shopId: string; expenseId: string }) {
  const action = reverseExpenseAction.bind(null, shopId, expenseId);
  const [state, formAction, pending] = useActionState(action, initial);
  return <form action={formAction} className="mt-2 flex flex-wrap gap-2"><label className="sr-only" htmlFor={`reason-${expenseId}`}>Reversal reason</label><input id={`reason-${expenseId}`} required minLength={3} maxLength={300} name="reason" placeholder="Reason for reversal" className="min-w-36 rounded-lg border border-[var(--line)] px-2 py-1 text-xs" /><button disabled={pending} className="text-xs font-medium text-red-800 underline">Reverse</button>{state.error && <span role="alert" className="basis-full text-xs text-red-700">{state.error}</span>}{state.success && <span role="status" className="basis-full text-xs text-[var(--forest)]">{state.success}</span>}</form>;
}
