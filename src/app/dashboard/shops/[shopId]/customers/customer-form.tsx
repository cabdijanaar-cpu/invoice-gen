"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createCustomerAction, type CustomerActionState } from "./actions";

const initialState: CustomerActionState = {};

export function CustomerForm({ shopId }: { shopId: string }) {
  const action = createCustomerAction.bind(null, shopId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-5">
      <h2 className="font-semibold">Add a customer</h2>
      <label className="block text-sm font-medium">Name
        <input name="name" required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Email
          <input name="email" type="email" maxLength={254} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
        <label className="block text-sm font-medium">Phone
          <input name="phone" type="tel" maxLength={32} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
        </label>
      </div>
      <label className="block text-sm font-medium">Address
        <input name="address" maxLength={300} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
      </label>
      <label className="block text-sm font-medium">Notes
        <textarea name="notes" rows={2} maxLength={1_000} className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2.5" />
      </label>
      {state.possibleDuplicates && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
        <p className="font-medium text-amber-950">Possible existing customer matches</p>
        <ul className="mt-2 list-inside list-disc text-amber-900">{state.possibleDuplicates.map((customer) => <li key={customer.id}><Link className="underline" href={`/dashboard/shops/${shopId}/customers/${customer.id}`}>{customer.name}</Link>{customer.phone ? ` · ${customer.phone}` : ""}</li>)}</ul>
        <label className="mt-3 flex items-start gap-2"><input type="checkbox" name="confirmPossibleDuplicates" className="mt-1" /><span>I reviewed these matches and still want to add this customer.</span></label>
      </div>}
      {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-[var(--forest)]">{state.success}</p>}
      <button disabled={pending} className="rounded-lg bg-[var(--forest)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
        {pending ? "Saving…" : "Add customer"}
      </button>
    </form>
  );
}
