"use client";

import { useActionState } from "react";
import { archiveProductAction, updateProductAction, type ProductManageState } from "./actions";

type EditableProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  purchaseCostCents: number;
  sellingPriceCents: number;
  lowStockThresholdMilli: number;
  unit: string;
  stockQuantityMilli: number;
};

const initialState: ProductManageState = {};

export function ProductManagement({ shopId, product }: { shopId: string; product: EditableProduct }) {
  const [editState, editAction, editing] = useActionState(updateProductAction.bind(null, shopId, product.id), initialState);
  const [archiveState, archiveAction, archiving] = useActionState(archiveProductAction.bind(null, shopId, product.id), initialState);

  return (
    <details className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
      <summary className="cursor-pointer font-medium">Manage product</summary>
      <form action={editAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Name<input name="name" required minLength={2} maxLength={120} defaultValue={product.name} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Unit<input name="unit" required maxLength={24} defaultValue={product.unit} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>SKU<input name="sku" maxLength={64} defaultValue={product.sku ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Barcode<input name="barcode" maxLength={64} defaultValue={product.barcode ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Cost (USD)<input name="purchaseCost" type="number" min="0" step="0.01" required defaultValue={(product.purchaseCostCents / 100).toFixed(2)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Selling price (USD)<input name="sellingPrice" type="number" min="0" step="0.01" required defaultValue={(product.sellingPriceCents / 100).toFixed(2)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Low stock at<input name="lowStockThreshold" type="number" min="0" step="0.001" required defaultValue={product.lowStockThresholdMilli / 1_000} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <div className="flex items-end"><button disabled={editing} className="rounded-lg bg-[var(--forest)] px-4 py-2 font-medium text-white disabled:opacity-60">{editing ? "Saving…" : "Save changes"}</button></div>
        {editState.error && <p role="alert" className="text-red-800 sm:col-span-2">{editState.error}</p>}
        {editState.success && <p role="status" className="text-[var(--forest)] sm:col-span-2">{editState.success}</p>}
      </form>
      <form action={archiveAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
        <button disabled={archiving} className="rounded-lg border border-red-300 px-3 py-2 font-medium text-red-800 disabled:opacity-60">{archiving ? "Archiving…" : "Archive product"}</button>
        <span className="text-xs text-[var(--muted)]">Stock must be zero. Existing invoices and movement history are preserved.</span>
        {archiveState.error && <p role="alert" className="w-full text-red-800">{archiveState.error}</p>}
        {archiveState.success && <p role="status" className="w-full text-[var(--forest)]">{archiveState.success}</p>}
      </form>
    </details>
  );
}
