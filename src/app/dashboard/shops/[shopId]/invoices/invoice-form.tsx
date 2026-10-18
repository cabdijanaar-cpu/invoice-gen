"use client";

import { useActionState, useState } from "react";
import { calculateInvoice } from "@/server/domain/invoices/calculate-invoice";
import { createInvoiceAction, saveInvoiceDraftAction, type InvoiceActionState } from "./actions";

type CustomerOption = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string | null; sellingPriceCents: number; stockQuantityMilli: number };
type DraftLine = { productId: string; description: string; quantity: string; unitPrice: string; discount: string; taxRate: string };

const initialState: InvoiceActionState = {};
const blankLine = (defaultTaxRateBps = 0): DraftLine => ({ productId: "", description: "", quantity: "1", unitPrice: "0.00", discount: "0.00", taxRate: (defaultTaxRateBps / 100).toString() });

function parseQuantityMilli(value: string): number | null {
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,3}))?$/.exec(value.trim());
  if (!match) return null;
  const result = Number(match[1]) * 1_000 + Number((match[2] ?? "").padEnd(3, "0") || "0");
  return Number.isSafeInteger(result) && result > 0 && result <= 2_147_483_647 ? result : null;
}

function parseTaxRateBps(value: string): number | null {
  const match = /^(0|[1-9]\d{0,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return result <= 100_000 ? result : null;
}

function parseMoney(value: string): number | null {
  const normalized = value.trim();
  const match = /^(0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return Number.isSafeInteger(cents) && cents <= 2_147_483_647 ? cents : null;
}

export function InvoiceForm({
  shopId,
  initialRequestId,
  customers,
  products,
  defaults,
  draft,
}: {
  shopId: string;
  initialRequestId: string;
  customers: CustomerOption[];
  products: ProductOption[];
  defaults: { defaultTaxRateBps: number; defaultDiscountBps: number; defaultPaymentTerms: string | null };
  draft?: { id: string; customerId: string | null; dueAt: Date | null; notes: string | null; items: Array<{ productId: string | null; description: string; quantityMilli: number; unitPriceCents: number; discountCents: number; taxRateBps: number }> };
}) {
  const [state, formAction, pending] = useActionState(createInvoiceAction.bind(null, shopId), initialState);
  const [draftState, draftAction, draftPending] = useActionState(saveInvoiceDraftAction.bind(null, shopId), initialState);
  const [lines, setLines] = useState<DraftLine[]>(draft?.items.map((item) => ({ productId: item.productId ?? "", description: item.description, quantity: (item.quantityMilli / 1000).toString(), unitPrice: (item.unitPriceCents / 100).toFixed(2), discount: (item.discountCents / 100).toFixed(2), taxRate: (item.taxRateBps / 100).toString() })) ?? [blankLine(defaults.defaultTaxRateBps)]);
  const [invoiceDiscount, setInvoiceDiscount] = useState("0.00");
  const [clientError, setClientError] = useState("");
  const requestId = state.nextRequestId ?? initialRequestId;

  const preview = (() => {
    const parsedLines = lines.map((line) => ({ quantityMilli: parseQuantityMilli(line.quantity), unitPriceCents: parseMoney(line.unitPrice), lineDiscountCents: parseMoney(line.discount), taxRateBps: parseTaxRateBps(line.taxRate) }));
    const requestedDiscount = parseMoney(invoiceDiscount);
    if (parsedLines.some((line) => Object.values(line).some((value) => value === null)) || requestedDiscount === null) return null;
    try {
      const validLines = parsedLines.map((line) => ({ quantityMilli: line.quantityMilli!, unitPriceCents: line.unitPriceCents!, lineDiscountCents: line.lineDiscountCents!, taxRateBps: line.taxRateBps! }));
      let effectiveDiscount = requestedDiscount;
      if (effectiveDiscount === 0 && defaults.defaultDiscountBps > 0) {
        const eligible = validLines.reduce((sum, line) => {
          const gross = Number((BigInt(line.unitPriceCents) * BigInt(line.quantityMilli) + 500n) / 1_000n);
          return sum + Math.max(0, gross - line.lineDiscountCents);
        }, 0);
        effectiveDiscount = Number((BigInt(eligible) * BigInt(defaults.defaultDiscountBps) + 5_000n) / 10_000n);
      }
      return { totals: calculateInvoice({ lines: validLines, invoiceDiscountCents: effectiveDiscount }), hasDefaultDiscount: requestedDiscount === 0 && defaults.defaultDiscountBps > 0 };
    } catch { return null; }
  })();
  const formatUsd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  const setLine = (index: number, key: keyof DraftLine, value: string) => {
    setLines((current) => current.map((line, row) => row === index ? { ...line, [key]: value } : line));
  };

  const submit = (formData: FormData) => {
    setClientError("");
    const parsedLines = [];
    for (const line of lines) {
      const quantityMilli = parseQuantityMilli(line.quantity);
      const unitPriceCents = parseMoney(line.unitPrice);
      const lineDiscountCents = parseMoney(line.discount);
      const taxRateBps = parseTaxRateBps(line.taxRate);
      if (quantityMilli === null || unitPriceCents === null || lineDiscountCents === null || taxRateBps === null) {
        setClientError("Enter a valid quantity, price, discount, and tax rate for every line.");
        return;
      }
      if (!line.productId && line.description.trim().length < 2) {
        setClientError("Choose a product or enter a description for each custom line.");
        return;
      }
      parsedLines.push({
        productId: line.productId,
        description: line.description.trim(),
        quantityMilli,
        unitPriceCents,
        lineDiscountCents,
        taxRateBps,
      });
    }

    let invoiceDiscountCents = parseMoney(String(formData.get("invoiceDiscount") ?? ""));
    if (invoiceDiscountCents === null) {
      setClientError("Enter a valid invoice discount.");
      return;
    }
    if (invoiceDiscountCents === 0 && defaults.defaultDiscountBps > 0) {
      const eligibleCents = parsedLines.reduce((sum, line) => {
        const gross = Number((BigInt(line.unitPriceCents) * BigInt(line.quantityMilli) + 500n) / 1_000n);
        return sum + Math.max(0, gross - line.lineDiscountCents);
      }, 0);
      if (!Number.isSafeInteger(eligibleCents)) {
        setClientError("Invoice amount is outside the supported range.");
        return;
      }
      invoiceDiscountCents = Number((BigInt(eligibleCents) * BigInt(defaults.defaultDiscountBps) + 5_000n) / 10_000n);
    }
    if (!requestId) {
      setClientError("Preparing secure invoice submission. Try again in a moment.");
      return;
    }
    formData.set("linesJson", JSON.stringify(parsedLines));
    formData.set("invoiceDiscount", (invoiceDiscountCents / 100).toFixed(2));
    formData.set("idempotencyKey", requestId);
    if (formData.get("intent") === "draft") draftAction(formData);
    else formAction(formData);
  };

  return (
    <form action={submit} className="space-y-6">
      {draft && <input type="hidden" name="draftId" value={draft.id} />}
      <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <label className="text-sm font-medium">Customer
          <select name="customerId" defaultValue={draft?.customerId ?? ""} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm">
            <option value="">Walk-in customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Due date
          <input name="dueDate" type="date" defaultValue={draft?.dueAt?.toISOString().slice(0, 10) ?? ""} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-semibold tracking-tight">Invoice items</h2><p className="mt-1 text-sm text-[var(--muted)]">Add products or custom items to this invoice.</p></div>
          <button type="button" onClick={() => setLines((current) => [...current, blankLine(defaults.defaultTaxRateBps)])} disabled={lines.length >= 100} className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--forest)] shadow-sm transition hover:bg-[#edf6df] disabled:opacity-50">+ Add item</button>
        </div>
        {lines.map((line, index) => (
          <fieldset className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 shadow-sm sm:grid-cols-2 sm:gap-4 sm:p-5 lg:grid-cols-6" key={index}>
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Item {String(index + 1).padStart(2, "0")}</legend>
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-2">
              <span className="text-xs">Product (optional)</span>
              <select
                value={line.productId}
                onChange={(event) => {
                  const selected = products.find((product) => product.id === event.target.value);
                  setLines((current) => current.map((row, rowIndex) => rowIndex !== index ? row : selected
                    ? { ...row, productId: selected.id, description: selected.name, unitPrice: (selected.sellingPriceCents / 100).toFixed(2) }
                    : { ...row, productId: "" }));
                }}
                className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm"
              >
                <option value="">Custom line item</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium sm:col-span-2 lg:col-span-2">
              <span className="text-xs">Description</span>
              <input value={line.description} onChange={(event) => setLine(index, "description", event.target.value)} readOnly={Boolean(line.productId)} maxLength={200} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm read-only:bg-[#f1f4f1]" />
            </label>
            <label className="text-sm font-medium"><span className="text-xs">Quantity</span>
              <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
              {line.productId && (() => { const product = products.find((item) => item.id === line.productId); const requested = parseQuantityMilli(line.quantity); return product ? <span className={`mt-1 block text-xs ${requested !== null && requested > product.stockQuantityMilli ? "text-red-700" : "text-[var(--muted)]"}`}>{requested !== null && requested > product.stockQuantityMilli ? `Only ${(product.stockQuantityMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} available in stock.` : `Available: ${(product.stockQuantityMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })}`}</span> : null; })()}
            </label>
            <label className="text-sm font-medium"><span className="text-xs">Unit price (USD)</span>
              <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLine(index, "unitPrice", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
            </label>
            <label className="text-sm font-medium"><span className="text-xs">Discount (USD)</span>
              <input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => setLine(index, "discount", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
            </label>
            <label className="text-sm font-medium"><span className="text-xs">Tax (%)</span>
              <input type="number" min="0" max="1000" step="0.01" value={line.taxRate} onChange={(event) => setLine(index, "taxRate", event.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
            </label>
            <div className="flex items-end justify-end lg:col-span-2">
              {lines.length > 1 && <button type="button" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50">Remove item</button>}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <label className="text-sm font-medium">Invoice discount (USD)
          <input name="invoiceDiscount" type="number" min="0" step="0.01" value={invoiceDiscount} onChange={(event) => setInvoiceDiscount(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
        </label>
        <label className="text-sm font-medium">Notes
          <input name="notes" defaultValue={draft?.notes ?? defaults.defaultPaymentTerms ?? ""} maxLength={2_000} className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[#fbfcfb] px-3 py-3 text-sm shadow-sm" />
        </label>
      </section>

      <section aria-live="polite" className="overflow-hidden rounded-2xl border border-[var(--forest)] bg-[var(--forest)] p-5 text-white shadow-md sm:p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Invoice summary</h2><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">USD</span></div>
        {preview ? <>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-white/70">Subtotal</dt><dd>{formatUsd(preview.totals.subtotalCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/70">Discounts</dt><dd>−{formatUsd(preview.totals.discountCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-white/70">Tax</dt><dd>{formatUsd(preview.totals.taxCents)}</dd></div>
            <div className="mt-3 flex items-end justify-between gap-4 border-t border-white/20 pt-4"><dt className="text-sm font-medium text-white/75">Total due</dt><dd className="text-3xl font-semibold tracking-tight text-[#d2f58a]">{formatUsd(preview.totals.totalCents)}</dd></div>
          </dl>
          {preview.hasDefaultDiscount && <p className="mt-3 text-xs text-white/65">The shop’s default discount is included while the invoice discount is zero.</p>}
        </> : <p className="mt-3 text-sm text-white/75">Check the quantities, prices, discounts, and tax rates. The total will appear when they are valid.</p>}
      </section>

      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">Finalizing records this invoice and deducts tracked product stock. Review the items and total before you continue.</p>
      {clientError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{clientError}</p>}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {draftState.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{draftState.error}</p>}
      {draftState.success && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">{draftState.success}{draftState.invoiceId && <> <a className="font-semibold underline" href={`/dashboard/shops/${shopId}/invoices/${draftState.invoiceId}`}>{draftState.invoiceNumber} · View draft</a></>}</p>}
      {state.success && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">
        {state.success}{state.invoiceNumber && state.invoiceId && <> <a className="font-semibold underline" href={`/dashboard/shops/${shopId}/invoices/${state.invoiceId}`}>{state.invoiceNumber} · View invoice</a></>}
      </p>}
      <div className="flex flex-wrap gap-3"><button name="intent" value="draft" disabled={draftPending} className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 font-semibold text-[var(--forest)] shadow-sm transition hover:bg-[#f5f8f5] disabled:opacity-60">{draftPending ? "Saving…" : draft ? "Save draft changes" : "Save as draft"}</button><button name="intent" value="finalize" disabled={pending || !requestId} className="rounded-xl bg-[var(--forest)] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#20573d] disabled:opacity-60">{pending ? "Finalizing…" : "Finalize invoice"}</button></div>
    </form>
  );
}
