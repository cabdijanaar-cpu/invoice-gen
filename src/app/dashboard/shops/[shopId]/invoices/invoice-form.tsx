"use client";

import { useActionState, useState } from "react";
import { createInvoiceAction, saveInvoiceDraftAction, type InvoiceActionState } from "./actions";

type CustomerOption = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string | null; sellingPriceCents: number; stockQuantityMilli: number };
type DraftLine = { productId: string; description: string; quantity: string; unitPrice: string; discount: string; taxRate: string };

const initialState: InvoiceActionState = {};
const blankLine = (): DraftLine => ({ productId: "", description: "", quantity: "1", unitPrice: "0.00", discount: "0.00", taxRate: "0" });

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
  const [lines, setLines] = useState<DraftLine[]>(draft?.items.map((item) => ({ productId: item.productId ?? "", description: item.description, quantity: (item.quantityMilli / 1000).toString(), unitPrice: (item.unitPriceCents / 100).toFixed(2), discount: (item.discountCents / 100).toFixed(2), taxRate: (item.taxRateBps / 100).toString() })) ?? [{ ...blankLine(), taxRate: (defaults.defaultTaxRateBps / 100).toString() }]);
  const [clientError, setClientError] = useState("");
  const requestId = state.nextRequestId ?? initialRequestId;

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
    formData.set("idempotencyKey", requestId);
    if (formData.get("intent") === "draft") draftAction(formData);
    else formAction(formData);
  };

  return (
    <form action={submit} className="space-y-5">
      {draft && <input type="hidden" name="draftId" value={draft.id} />}
      <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Customer
          <select name="customerId" defaultValue={draft?.customerId ?? ""} className="mt-1.5 w-full rounded-lg border border-[var(--line)] px-3 py-2.5">
            <option value="">Walk-in customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Due date
          <input name="dueDate" type="date" defaultValue={draft?.dueAt?.toISOString().slice(0, 10) ?? ""} className="mt-1.5 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Invoice lines</h2>
          <button type="button" onClick={() => setLines((current) => [...current, blankLine()])} disabled={lines.length >= 100} className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">Add line</button>
        </div>
        {lines.map((line, index) => (
          <fieldset className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" key={index}>
            <legend className="px-1 text-xs font-medium text-[var(--muted)]">Line {index + 1}</legend>
            <label className="text-xs font-medium lg:col-span-2">Product (optional)
              <select
                value={line.productId}
                onChange={(event) => {
                  const selected = products.find((product) => product.id === event.target.value);
                  setLines((current) => current.map((row, rowIndex) => rowIndex !== index ? row : selected
                    ? { ...row, productId: selected.id, description: selected.name, unitPrice: (selected.sellingPriceCents / 100).toFixed(2) }
                    : { ...row, productId: "" }));
                }}
                className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5"
              >
                <option value="">Custom line item</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium lg:col-span-2">Description
              <input value={line.description} onChange={(event) => setLine(index, "description", event.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
            </label>
            <label className="text-xs font-medium">Quantity
              <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
            </label>
            <label className="text-xs font-medium">Unit price (USD)
              <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => setLine(index, "unitPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
            </label>
            <label className="text-xs font-medium">Discount (USD)
              <input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => setLine(index, "discount", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
            </label>
            <label className="text-xs font-medium">Tax (%)
              <input type="number" min="0" max="1000" step="0.01" value={line.taxRate} onChange={(event) => setLine(index, "taxRate", event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
            </label>
            <div className="flex items-end justify-end lg:col-span-2">
              {lines.length > 1 && <button type="button" onClick={() => setLines((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="px-3 py-2 text-sm text-red-800">Remove line</button>}
            </div>
          </fieldset>
        ))}
      </section>

      <section className="grid gap-4 rounded-2xl border border-[var(--line)] bg-white p-5 sm:grid-cols-2">
        <label className="text-sm font-medium">Invoice discount (USD)
          <input name="invoiceDiscount" type="number" min="0" step="0.01" defaultValue="0.00" required className="mt-1.5 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="text-sm font-medium">Notes
          <input name="notes" defaultValue={draft?.notes ?? defaults.defaultPaymentTerms ?? ""} maxLength={2_000} className="mt-1.5 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </section>

      <p className="text-sm text-[var(--muted)]">Submitting finalizes the invoice and deducts tracked product stock immediately. Review the details before submitting.</p>
      {clientError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{clientError}</p>}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {draftState.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{draftState.error}</p>}
      {draftState.success && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">{draftState.success}{draftState.invoiceId && <> <a className="font-semibold underline" href={`/dashboard/shops/${shopId}/invoices/${draftState.invoiceId}`}>{draftState.invoiceNumber} · View draft</a></>}</p>}
      {state.success && <p role="status" className="rounded-lg bg-[#edf6df] px-3 py-2 text-sm text-[var(--forest)]">
        {state.success}{state.invoiceNumber && state.invoiceId && <> <a className="font-semibold underline" href={`/dashboard/shops/${shopId}/invoices/${state.invoiceId}`}>{state.invoiceNumber} · View invoice</a></>}
      </p>}
      <div className="flex flex-wrap gap-3"><button name="intent" value="draft" disabled={draftPending} className="rounded-xl border border-[var(--line)] bg-white px-5 py-3 font-medium disabled:opacity-60">{draftPending ? "Saving…" : draft ? "Save draft changes" : "Save as draft"}</button><button name="intent" value="finalize" disabled={pending || !requestId} className="rounded-xl bg-[var(--forest)] px-5 py-3 font-medium text-white disabled:opacity-60">{pending ? "Finalizing…" : "Finalize invoice"}</button></div>
    </form>
  );
}
