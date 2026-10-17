"use client";

import { useActionState, useState } from "react";
import { createQuotationAction, type QuotationActionState } from "./actions";

type ProductOption = { id: string; name: string; sku: string | null; sellingPriceCents: number };
type Line = { productId: string; description: string; quantity: string; price: string; discount: string; tax: string };
const blank = (): Line => ({ productId: "", description: "", quantity: "1", price: "0.00", discount: "0.00", tax: "0" });
function cents(value: string) { const m = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(value.trim()); return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0") : null; }

export function QuotationForm({ shopId, customers, products }: { shopId: string; customers: { id: string; name: string }[]; products: ProductOption[] }) {
  const [state, formAction, pending] = useActionState<QuotationActionState, FormData>(createQuotationAction.bind(null, shopId), {});
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState("");
  const submit = (data: FormData) => {
    setError("");
    const parsed = [];
    for (const line of lines) {
      const amount = cents(line.price); const discount = cents(line.discount);
      const quantityMatch = /^(0|[1-9]\d{0,6})(?:\.(\d{1,3}))?$/.exec(line.quantity.trim());
      const taxMatch = /^(0|[1-9]\d{0,3})(?:\.(\d{1,2}))?$/.exec(line.tax.trim());
      if (amount === null || discount === null || !quantityMatch || !taxMatch) { setError("Check quantity, price, discount, and tax rate on every line."); return; }
      const description = line.description.trim();
      if (!line.productId && description.length < 2) { setError("Choose a product or describe each custom item."); return; }
      parsed.push({ productId: line.productId, description, quantityMilli: Number(quantityMatch[1]) * 1000 + Number((quantityMatch[2] ?? "").padEnd(3, "0") || "0"), unitPriceCents: amount, lineDiscountCents: discount, taxRateBps: Number(taxMatch[1]) * 100 + Number((taxMatch[2] ?? "").padEnd(2, "0") || "0") });
    }
    data.set("linesJson", JSON.stringify(parsed));
    formAction(data);
  };
  return <form action={submit} className="space-y-4 rounded-2xl border border-[var(--line)] bg-white p-5">
    <h2 className="font-semibold">Create quotation</h2>
    <label className="block text-sm font-medium">Customer<select name="customerId" defaultValue="" className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2"><option value="">Walk-in customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="block text-sm font-medium">Expires on<input name="expiresAt" type="date" className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
    {lines.map((line, index) => <fieldset key={index} className="grid gap-2 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-2">
      <legend className="px-1 text-xs text-[var(--muted)]">Item {index + 1}</legend>
      <label className="text-xs">Product<select value={line.productId} onChange={(e) => { const product = products.find((p) => p.id === e.target.value); setLines((rows) => rows.map((row, i) => i === index ? { ...row, productId: product?.id ?? "", description: product?.name ?? "", price: product ? (product.sellingPriceCents / 100).toFixed(2) : row.price } : row)); }} className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2"><option value="">Custom item</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ""}</option>)}</select></label>
      <label className="text-xs">Description<input value={line.description} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} maxLength={200} className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2" /></label>
      <label className="text-xs">Quantity<input value={line.quantity} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2" /></label>
      <label className="text-xs">Unit price USD<input value={line.price} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, price: e.target.value } : row))} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2" /></label>
      <label className="text-xs">Discount USD<input value={line.discount} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, discount: e.target.value } : row))} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2" /></label>
      <label className="text-xs">Tax %<input value={line.tax} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, tax: e.target.value } : row))} inputMode="decimal" className="mt-1 w-full rounded border border-[var(--line)] px-2 py-2" /></label>
      {lines.length > 1 && <button type="button" onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))} className="text-left text-sm text-red-800">Remove item</button>}
    </fieldset>)}
    <button type="button" disabled={lines.length >= 100} onClick={() => setLines((rows) => [...rows, blank()])} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm">Add item</button>
    <label className="block text-sm">Invoice discount USD<input name="discount" defaultValue="0.00" required inputMode="decimal" className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
    <label className="block text-sm">Notes<input name="notes" maxLength={2000} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-[var(--forest)]">{state.success} {state.quotationId && <a className="underline" href={`/dashboard/shops/${shopId}/quotations/${state.quotationId}`}>Open quotation</a>}</p>}
    <button disabled={pending} className="rounded-lg bg-[var(--forest)] px-4 py-2 font-medium text-white disabled:opacity-60">{pending ? "Saving…" : "Save quotation draft"}</button>
  </form>;
}
