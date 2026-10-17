"use client";

import { useActionState } from "react";
import { recordInvoiceRefundAction, type PaymentActionState } from "../actions";

export function RefundPaymentForm({ shopId, invoiceId, paymentId, initialRequestId }: { shopId: string; invoiceId: string; paymentId: string; initialRequestId: string }) {
  const action = recordInvoiceRefundAction.bind(null, shopId, invoiceId, paymentId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(action, {});
  return <details className="mt-2 text-xs print:hidden"><summary className="cursor-pointer text-amber-800 underline">Record partial refund</summary>
    <form action={formAction} className="mt-2 grid gap-2 sm:grid-cols-2"><input type="hidden" name="idempotencyKey" value={state.nextRequestId ?? initialRequestId} />
      <label>Refund amount USD<input name="amount" required inputMode="decimal" className="mt-1 w-full rounded-md border border-[var(--line)] px-2 py-1.5" /></label>
      <label>Reason<input name="reason" required minLength={5} maxLength={500} className="mt-1 w-full rounded-md border border-[var(--line)] px-2 py-1.5" /></label>
      {state.error && <p role="alert" className="text-red-700 sm:col-span-2">{state.error}</p>}{state.success && <p role="status" className="text-[var(--forest)] sm:col-span-2">{state.success}</p>}
      <button disabled={pending} className="rounded-md border border-amber-300 px-3 py-1.5 font-medium text-amber-900 disabled:opacity-60 sm:col-span-2">{pending ? "Saving…" : "Record refund"}</button>
    </form>
  </details>;
}
