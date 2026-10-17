"use client";

import { useActionState } from "react";
import { voidInvoiceAction, type PaymentActionState } from "../actions";

export function VoidInvoiceForm({ shopId, invoiceId }: { shopId: string; invoiceId: string }) {
  const action = voidInvoiceAction.bind(null, shopId, invoiceId);
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(action, {});
  return <details className="mt-5 border-t border-red-200 pt-4 print:hidden">
    <summary className="cursor-pointer text-sm font-medium text-red-800">Void invoice</summary>
    <p className="mt-2 text-xs text-[var(--muted)]">All posted payments must first be reversed. Tracked stock will be restored and its history retained.</p>
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="min-w-52 flex-1 text-sm">Reason<input name="reason" required minLength={5} maxLength={500} className="mt-1 w-full rounded-md border border-[var(--line)] px-2 py-1.5" /></label>
      <button disabled={pending} className="rounded-md bg-red-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{pending ? "Saving…" : "Confirm void"}</button>
      {state.error && <p role="alert" className="w-full text-sm text-red-700">{state.error}</p>}
      {state.success && <p role="status" className="w-full text-sm text-[var(--forest)]">{state.success}</p>}
    </form>
  </details>;
}
