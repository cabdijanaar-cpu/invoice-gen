"use client";

import { useActionState } from "react";
import { createProductAction, type ProductActionState } from "./actions";

const initialState: ProductActionState = {};

export function ProductForm({ shopId }: { shopId: string }) {
  const [state, action, pending] = useActionState(createProductAction.bind(null, shopId), initialState);

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5">
      <h2 className="font-semibold">Add a product</h2>
      <label className="block text-sm font-medium">Product name
        <input name="name" required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">SKU
          <input name="sku" maxLength={64} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">Barcode
          <input name="barcode" maxLength={64} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">Cost (USD)
          <input name="purchaseCost" type="number" min="0" step="0.01" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">Selling price (USD)
          <input name="sellingPrice" type="number" min="0" step="0.01" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm font-medium">Opening stock
          <input name="initialStock" type="number" min="0" step="0.001" defaultValue="0" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">Low stock at
          <input name="lowStockThreshold" type="number" min="0" step="0.001" defaultValue="0" required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">Unit
          <input name="unit" defaultValue="item" maxLength={24} required className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-[var(--forest)]">{state.success}</p>}
      <button disabled={pending} className="rounded-lg bg-[var(--forest)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving…" : "Add product"}
      </button>
    </form>
  );
}
