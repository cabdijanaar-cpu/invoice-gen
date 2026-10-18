import { requireShopMembership } from "@/server/auth/session";
import { getShopEntitlement } from "@/server/platform/entitlements";
import { listShopMembers } from "@/server/shops/members";
import { addShopMemberAction, updateShopMemberAction } from "./actions";
import { WorkspacePageHeader } from "../workspace-page-header";

const permissions = [
  ["canViewReports", "View reports"],
  ["canManageProducts", "Manage products"],
  ["canManageCustomers", "Manage customers"],
  ["canManageSettings", "Manage settings"],
  ["canManageUsers", "Manage staff"],
  ["canAdjustInventory", "Adjust inventory"],
] as const;

export default async function ShopUsersPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const { shopId } = await params;
  const [query, { membership }] = await Promise.all([searchParams, requireShopMembership(shopId)]);
  const canManage = membership.role === "SHOP_OWNER" || membership.canManageUsers;
  const members = canManage ? await listShopMembers(shopId) : [];
  const entitlement = canManage ? await getShopEntitlement(shopId) : null;
  const activeMembers = members.filter((m) => m.status === "ACTIVE").length;

  return <main className="min-h-screen px-4 py-7 sm:px-8 sm:py-10"><div className="mx-auto max-w-6xl">
    <WorkspacePageHeader shopName={membership.shop.name} title="Staff and permissions" description="Add registered accounts to this shop and control their access." badge={canManage ? `${activeMembers} active members` : "Staff access restricted"} />
    {query.message && <p role="status" className="mb-4 rounded-xl bg-[#edf6df] p-3 text-sm">{query.message}</p>}
    {query.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{query.error}</p>}
    {!canManage ? <p className="rounded-xl border border-[var(--line)] bg-white p-5 text-sm">You do not have permission to manage staff in this shop.</p> : <>
      <section className="rounded-2xl border border-[var(--line)] bg-white p-5"><h2 className="font-semibold">Add a staff member</h2><p className="mt-1 text-sm text-[var(--muted)]">The person must already have an active account. Their account can belong to other shops too.</p><form action={addShopMemberAction.bind(null, shopId)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"><label className="text-sm">Account email<input required type="email" name="email" maxLength={254} autoComplete="email" className="mt-1 block w-full rounded-lg border border-[var(--line)] px-3 py-2" /></label><label className="text-sm">Role<select name="role" className="mt-1 block w-full rounded-lg border border-[var(--line)] px-3 py-2"><option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option></select></label><button className="rounded-lg bg-[var(--forest)] px-4 py-2 text-sm font-medium text-white">Add staff</button></form></section>
      <section className="mt-6"><h2 className="mb-3 font-semibold">Shop members ({activeMembers} active{entitlement?.plan.maxUsers !== null && entitlement ? ` · limit ${entitlement.plan.maxUsers}` : ""})</h2><div className="space-y-4">{members.map((member) => <article key={member.id} className="rounded-2xl border border-[var(--line)] bg-white p-5"><div className="mb-4"><h3 className="font-semibold">{member.user.name} {member.role === "SHOP_OWNER" && <span className="ml-1 text-xs text-[var(--muted)]">Owner</span>}</h3><p className="text-sm text-[var(--muted)]">{member.user.email} · Account {member.user.status.toLowerCase()} · Membership {member.status.toLowerCase()}</p></div>{member.role === "SHOP_OWNER" ? <p className="text-sm text-[var(--muted)]">The owner account is managed separately and cannot be changed here.</p> : <form action={updateShopMemberAction.bind(null, shopId, member.id)} className="space-y-4"><div className="flex flex-wrap items-end gap-3"><label className="text-sm">Role<select name="role" defaultValue={member.role} className="mt-1 block rounded-lg border border-[var(--line)] px-3 py-2"><option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option></select></label><label className="text-sm">Membership<select name="status" defaultValue={member.status} className="mt-1 block rounded-lg border border-[var(--line)] px-3 py-2"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label></div><fieldset><legend className="mb-2 text-sm font-medium">Permissions</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{permissions.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm">{key === "canManageUsers" && membership.role !== "SHOP_OWNER" && member.canManageUsers && <input type="hidden" name={key} value="on" />}<input type="checkbox" name={key} defaultChecked={member[key]} disabled={key === "canManageUsers" && membership.role !== "SHOP_OWNER"} className="accent-[var(--forest)]" />{label}</label>)}</div>{membership.role !== "SHOP_OWNER" && <p className="mt-2 text-xs text-[var(--muted)]">Only the shop owner can grant staff management permission.</p>}</fieldset><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium">Save member</button></form>}</article>)}{members.length === 0 && <p className="rounded-xl border border-dashed border-[var(--line)] p-5 text-sm text-[var(--muted)]">No shop members found.</p>}</div></section>
    </>}</div></main>;
}
