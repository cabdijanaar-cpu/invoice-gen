"use client";

import { useActionState, useState } from "react";
import { calculateDefaultInvoiceDiscountCents, calculateInvoice } from "@/server/domain/invoices/calculate-invoice";
import { createQuotationAction, type QuotationActionState } from "./actions";

type ProductOption = { id: string; name: string; sku: string | null; sellingPriceCents: number };
type Line = { productId: string; description: string; quantity: string; price: string; discount: string; tax: string };
const cents = (value: string) => { const m = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(value.trim()); return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0") : null; };
const quantityMilli = (value: string) => { const m = /^(0|[1-9]\d{0,6})(?:\.(\d{1,3}))?$/.exec(value.trim()); return m ? Number(m[1]) * 1_000 + Number((m[2] ?? "").padEnd(3, "0") || "0") : null; };
const rateBps = (value: string) => { const m = /^(0|[1-9]\d{0,3})(?:\.(\d{1,2}))?$/.exec(value.trim()); return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0") : null; };
const makeLine = (taxRateBps: number): Line => ({ productId: "", description: "", quantity: "1", price: "0.00", discount: "0.00", tax: (taxRateBps / 100).toString() });

export function QuotationForm({ shopId, customers, products, defaults }: {
  shopId: string;
  customers: { id: string; name: string }[];
  products: ProductOption[];
  defaults: { defaultTaxRateBps: number; defaultDiscountBps: number };
}) {
  const [state, formAction, pending] = useActionState<QuotationActionState, FormData>(createQuotationAction.bind(null, shopId), {});
  const [lines, setLines] = useState<Line[]>([makeLine(defaults.defaultTaxRateBps)]);
  const [discount, setDiscount] = useState("0.00");
  const [error, setError] = useState("");
  const updateLine = (index: number, key: keyof Line, value: string) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, [key]: value } : row));

  const preview = (() => {
    const parsed = lines.map((line) => ({ quantityMilli: quantityMilli(line.quantity), unitPriceCents: cents(line.price), lineDiscountCents: cents(line.discount), taxRateBps: rateBps(line.tax) }));
    const enteredDiscount = cents(discount);
    if (enteredDiscount === null || parsed.some((line) => Object.values(line).some((value) => value === null))) return null;
    try {
      const validLines = parsed.map((line) => ({ quantityMilli: line.quantityMilli!, unitPriceCents: line.unitPriceCents!, lineDiscountCents: line.lineDiscountCents!, taxRateBps: line.taxRateBps! }));
      let invoiceDiscountCents = enteredDiscount;
      if (invoiceDiscountCents === 0 && defaults.defaultDiscountBps > 0) {
        invoiceDiscountCents = calculateDefaultInvoiceDiscountCents(validLines, defaults.defaultDiscountBps);
      }
      return { totals: calculateInvoice({ lines: validLines, invoiceDiscountCents }), hasDefaultDiscount: enteredDiscount === 0 && defaults.defaultDiscountBps > 0 };
    } catch { return null; }
  })();
  const usd = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);

  const submit = (data: FormData) => {
    setError("");
    const parsed = [];
    for (const line of lines) {
      const price = cents(line.price), lineDiscountCents = cents(line.discount), quantity = quantityMilli(line.quantity), taxRateBps = rateBps(line.tax);
      if (price === null || price > 2_147_483_647 || lineDiscountCents === null || lineDiscountCents > 2_147_483_647 || quantity === null || quantity < 1 || quantity > 2_147_483_647 || taxRateBps === null || taxRateBps > 100_000) { setError("Check the quantity, price, discount, and tax rate on every item."); return; }
      const description = line.description.trim();
      if (!line.productId && description.length < 2) { setError("Choose a product or describe each custom item."); return; }
      parsed.push({ productId: line.productId, description, quantityMilli: quantity, unitPriceCents: price, lineDiscountCents, taxRateBps });
    }
    let invoiceDiscountCents = cents(discount);
    if (invoiceDiscountCents === null || invoiceDiscountCents > 2_147_483_647) { setError("Enter a valid invoice discount."); return; }
    if (invoiceDiscountCents === 0 && defaults.defaultDiscountBps > 0 && preview) invoiceDiscountCents = preview.totals.invoiceDiscountCents;
    if (!preview) { setError("The quotation values are outside the supported range."); return; }
    data.set("linesJson", JSON.stringify(parsed));
    data.set("discount", (invoiceDiscountCents / 100).toFixed(2));
    formAction(data);
  };

  return <form action={submit} className="space-y-5 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:p-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-medium">Customer<select name="customerId" defaultValue="" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm"><option value="">Walk-in customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <label className="block text-sm font-medium">Expires on<input name="expiresAt" type="date" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm" /></label>
    </div>
    <div className="flex items-end justify-between gap-3"><div><h3 className="font-semibold">Quoted items</h3><p className="mt-1 text-sm text-[var(--muted)]">Select products or describe custom work.</p></div><button type="button" disabled={lines.length >= 100} onClick={() => setLines((rows) => [...rows, makeLine(defaults.defaultTaxRateBps)])} className="shrink-0 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--forest)] shadow-sm hover:bg-[#edf6df] disabled:opacity-60">+ Add item</button></div>
    {lines.map((line, index) => <fieldset key={index} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[#fcfdfc] p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Item {String(index + 1).padStart(2, "0")}</legend>
      <label className="text-sm font-medium sm:col-span-2 lg:col-span-2"><span className="text-xs">Product</span><select value={line.productId} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); setLines((rows) => rows.map((row, i) => i === index ? { ...row, productId: product?.id ?? "", description: product?.name ?? "", price: product ? (product.sellingPriceCents / 100).toFixed(2) : row.price } : row)); }} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm"><option value="">Custom item</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label>
      <label className="text-sm font-medium sm:col-span-2 lg:col-span-2"><span className="text-xs">Description</span><input value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} readOnly={Boolean(line.productId)} maxLength={200} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm read-only:bg-[#f1f4f1]" /></label>
      <label className="text-sm font-medium"><span className="text-xs">Quantity</span><input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)} inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label>
      <label className="text-sm font-medium"><span className="text-xs">Unit price (USD)</span><input type="number" min="0" step="0.01" value={line.price} onChange={(event) => updateLine(index, "price", event.target.value)} inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label>
      <label className="text-sm font-medium"><span className="text-xs">Discount (USD)</span><input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => updateLine(index, "discount", event.target.value)} inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label>
      <label className="text-sm font-medium"><span className="text-xs">Tax (%)</span><input type="number" min="0" max="1000" step="0.01" value={line.tax} onChange={(event) => updateLine(index, "tax", event.target.value)} inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label>
      {lines.length > 1 && <div className="flex justify-end lg:col-span-2"><button type="button" onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Remove item</button></div>}
    </fieldset>)}
    <div className="grid gap-4 rounded-xl bg-[#f7faf7] p-4 sm:grid-cols-2"><label className="block text-sm font-medium">Invoice discount (USD)<input name="discount" type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} required inputMode="decimal" className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label><label className="block text-sm font-medium">Notes<input name="notes" maxLength={2_000} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm" /></label></div>
    <section aria-live="polite" className="rounded-2xl bg-[var(--forest)] p-5 text-white shadow-md"><div className="flex items-center justify-between"><h3 className="font-semibold">Quotation summary</h3><span className="rounded-full bg-white/10 px-3 py-1 text-xs">USD</span></div>{preview ? <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-white/70">Subtotal</dt><dd>{usd(preview.totals.subtotalCents)}</dd></div><div className="flex justify-between"><dt className="text-white/70">Discounts</dt><dd>−{usd(preview.totals.discountCents)}</dd></div><div className="flex justify-between"><dt className="text-white/70">Tax</dt><dd>{usd(preview.totals.taxCents)}</dd></div><div className="flex items-end justify-between border-t border-white/20 pt-3"><dt className="text-white/75">Estimated total</dt><dd className="text-2xl font-semibold text-[#d2f58a]">{usd(preview.totals.totalCents)}</dd></div>{preview.hasDefaultDiscount && <p className="pt-1 text-xs text-white/65">Shop default discount included.</p>}</dl> : <p className="mt-3 text-sm text-white/75">Check item quantities, prices, discounts, and tax rates.</p>}</section>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}{state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="rounded-xl bg-[#edf6df] p-3 text-sm text-[var(--forest)]">{state.success} {state.quotationId && <a className="font-semibold underline" href={`/dashboard/shops/${shopId}/quotations/${state.quotationId}`}>Open quotation</a>}</p>}
    <button disabled={pending} className="rounded-xl bg-[var(--forest)] px-5 py-3 font-semibold text-white shadow-sm hover:bg-[#20573d] disabled:opacity-60">{pending ? "Saving..." : "Save quotation draft"}</button>
  </form>;
}
