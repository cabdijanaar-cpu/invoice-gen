"use client";

import { useActionState } from "react";
import { convertQuotationAction, transitionQuotationAction, type QuotationActionState } from "./actions";

function StatusAction({ shopId, quotationId, status, label }: { shopId: string; quotationId: string; status: "SENT" | "ACCEPTED" | "CANCELLED"; label: string }) {
  const action = transitionQuotationAction.bind(null, shopId, quotationId, status);
  const [state, formAction, pending] = useActionState<QuotationActionState, FormData>(action, {});
  return <form action={formAction}><button disabled={pending} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-60">{pending ? "Saving…" : label}</button>{state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}{state.success && <p role="status" className="mt-1 text-xs text-[var(--forest)]">{state.success}</p>}</form>;
}

export function QuotationControls({ shopId, quotationId, status }: { shopId: string; quotationId: string; status: string }) {
  const action = convertQuotationAction.bind(null, shopId, quotationId);
  const [state, formAction, pending] = useActionState<QuotationActionState, FormData>(action, {});
  return <div className="mt-6 flex flex-wrap gap-3">
    {status === "DRAFT" && <StatusAction shopId={shopId} quotationId={quotationId} status="SENT" label="Mark sent" />}
    {status === "SENT" && <><StatusAction shopId={shopId} quotationId={quotationId} status="ACCEPTED" label="Mark accepted" /><StatusAction shopId={shopId} quotationId={quotationId} status="CANCELLED" label="Cancel quotation" /></>}
    {status === "ACCEPTED" && <form action={formAction}><button disabled={pending} className="rounded-lg bg-[var(--forest)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{pending ? "Converting…" : "Convert to invoice"}</button>{state.error && <p role="alert" className="mt-1 text-xs text-red-700">{state.error}</p>}{state.success && <p role="status" className="mt-1 text-xs text-[var(--forest)]">{state.success} {state.invoiceId && <a className="underline" href={`/dashboard/shops/${shopId}/invoices/${state.invoiceId}`}>View invoice</a>}</p>}</form>}
  </div>;
}
