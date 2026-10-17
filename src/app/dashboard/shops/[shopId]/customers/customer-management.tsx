"use client";

import { useActionState } from "react";
import { archiveCustomerAction, updateCustomerAction, type CustomerActionState } from "./actions";

type EditableCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

const initialState: CustomerActionState = {};

export function CustomerManagement({ shopId, customer }: { shopId: string; customer: EditableCustomer }) {
  const [editState, editAction, editing] = useActionState(updateCustomerAction.bind(null, shopId, customer.id), initialState);
  const [archiveState, archiveAction, archiving] = useActionState(archiveCustomerAction.bind(null, shopId, customer.id), initialState);

  return (
    <details className="mt-3 basis-full border-t border-[var(--line)] pt-3 text-sm">
      <summary className="cursor-pointer font-medium">Manage customer</summary>
      <form action={editAction} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Name<input name="name" required minLength={2} maxLength={120} defaultValue={customer.name} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Email<input name="email" type="email" maxLength={254} defaultValue={customer.email ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Phone<input name="phone" type="tel" maxLength={32} defaultValue={customer.phone ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label>Address<input name="address" maxLength={300} defaultValue={customer.address ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <label className="sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={1_000} defaultValue={customer.notes ?? ""} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label>
        <div><button disabled={editing} className="rounded-lg bg-[var(--forest)] px-4 py-2 font-medium text-white disabled:opacity-60">{editing ? "Saving…" : "Save changes"}</button></div>
        {editState.error && <p role="alert" className="text-red-800 sm:col-span-2">{editState.error}</p>}
        {editState.success && <p role="status" className="text-[var(--forest)] sm:col-span-2">{editState.success}</p>}
      </form>
      <form action={archiveAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
        <button disabled={archiving} className="rounded-lg border border-red-300 px-3 py-2 font-medium text-red-800 disabled:opacity-60">{archiving ? "Archiving…" : "Archive customer"}</button>
        <span className="text-xs text-[var(--muted)]">Past invoices and payments stay linked; this email remains reserved for this shop.</span>
        {archiveState.error && <p role="alert" className="w-full text-red-800">{archiveState.error}</p>}
        {archiveState.success && <p role="status" className="w-full text-[var(--forest)]">{archiveState.success}</p>}
      </form>
    </details>
  );
}
