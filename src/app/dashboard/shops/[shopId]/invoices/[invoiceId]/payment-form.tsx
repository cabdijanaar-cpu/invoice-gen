"use client";

import { useActionState } from "react";
import { recordInvoicePaymentAction, type PaymentActionState } from "../actions";

export function PaymentForm({ shopId, invoiceId, balanceCents, initialRequestId }: { shopId: string; invoiceId: string; balanceCents: number; initialRequestId: string }) {
  const action = recordInvoicePaymentAction.bind(null, shopId, invoiceId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(action, {});

  return <form action={formAction} className="mt-4 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
    <input type="hidden" name="idempotencyKey" value={state.nextRequestId ?? initialRequestId} />
    <label className="block text-sm font-medium">Amount<input name="amount" required inputMode="decimal" placeholder="0.00" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label>
    <label className="block text-sm font-medium">Method<select name="method" className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
    <label className="block text-sm font-medium">Reference (optional)<input name="reference" maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label>
    <label className="block text-sm font-medium">Notes (optional)<textarea name="notes" maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2" /></label>
    {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-[var(--forest)]">{state.success}</p>}
    <button disabled={pending} className="rounded-lg bg-[var(--forest)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Recording…" : `Record payment · ${(balanceCents / 100).toFixed(2)} USD due`}</button>
  </form>;
}
