"use client";

import { useActionState } from "react";
import { reverseInvoicePaymentAction, type PaymentActionState } from "../actions";

export function ReversePaymentForm({ shopId, invoiceId, paymentId }: { shopId: string; invoiceId: string; paymentId: string }) {
  const action = reverseInvoicePaymentAction.bind(null, shopId, invoiceId, paymentId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(action, {});
  return <details className="mt-2 text-xs print:hidden">
    <summary className="cursor-pointer text-red-800 underline">Reverse payment</summary>
    <form action={formAction} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1">Reason<input name="reason" required minLength={5} maxLength={500} className="mt-1 w-full rounded-md border border-[var(--line)] px-2 py-1.5" /></label>
      <button disabled={pending} className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-800 disabled:opacity-60">{pending ? "Saving…" : "Confirm reversal"}</button>
      {state.error && <p role="alert" className="w-full text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="w-full text-[var(--forest)]">{state.success}</p>}
    </form>
  </details>;
}
