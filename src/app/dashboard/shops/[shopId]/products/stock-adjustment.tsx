"use client";

import { useActionState } from "react";
import { adjustStockAction, type ProductActionState } from "./actions";

const initialState: ProductActionState = {};

export function StockAdjustment({ shopId, productId, initialRequestId }: { shopId: string; productId: string; initialRequestId: string }) {
  const [state, action, pending] = useActionState(adjustStockAction.bind(null, shopId, productId), initialState);
  const requestId = state.nextRequestId ?? initialRequestId;

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium text-[var(--forest)]">Adjust stock</summary>
      <form action={action} className="mt-3 space-y-2">
        <label className="block text-xs font-medium">Quantity change (positive adds stock; negative removes stock)
          <input name="delta" type="number" step="0.001" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" />
        </label>
        <label className="block text-xs font-medium">Reason
          <input name="reason" required minLength={3} maxLength={200} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" />
        </label>
        <input type="hidden" name="idempotencyKey" value={requestId} />
        {state.error && <p role="alert" className="text-xs text-red-800">{state.error}</p>}
        {state.success && <p role="status" className="text-xs text-[var(--forest)]">{state.success}</p>}
        <div className="flex flex-wrap gap-2">
          <button name="movementType" value="ADJUSTMENT" disabled={pending || !requestId} className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium disabled:opacity-60">{pending ? "Updating…" : "Record adjustment"}</button>
          <button name="movementType" value="RESTOCK" disabled={pending || !requestId} className="rounded-lg bg-[var(--forest)] px-3 py-2 text-xs font-medium text-white disabled:opacity-60">{pending ? "Recording…" : "Record restock"}</button>
        </div>
      </form>
    </details>
  );
}
