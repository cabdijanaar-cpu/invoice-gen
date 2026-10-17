import "server-only";
import { Prisma } from "@invoice/prisma-client";
import { db } from "@/lib/db";
import { requireShopMembership } from "@/server/auth/session";

export async function listShopCustomers(shopId: string, query = "", page = 1) {
  await requireShopMembership(shopId);
  const q = query.trim().slice(0, 100);
  const where = {
    shopId,
    status: "ACTIVE",
    ...(q ? { OR: [
      { name: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
    ] } : {}),
  };
  const pageSize = 20;
  const safePage = Number.isSafeInteger(page) ? Math.min(Math.max(1, page), 1_000_000) : 1;
  const [customers, total] = await db.$transaction([
    db.customer.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, address: true, notes: true, createdAt: true },
      orderBy: { name: "asc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    db.customer.count({ where }),
  ]);
  return { customers, total, pageSize };
}

export async function getShopCustomerHistory(shopId: string, customerId: string) {
  await requireShopMembership(shopId);
  const customer = await db.customer.findFirst({
    where: { id: customerId, shopId },
    select: {
      id: true, name: true, email: true, phone: true, status: true,
      invoices: {
        where: { shopId, status: { in: ["FINALIZED", "VOID"] } },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true, invoiceNumber: true, issuedAt: true, totalCents: true, status: true,
          payments: { where: { shopId }, orderBy: { paidAt: "desc" }, select: { id: true, amountCents: true, paidAt: true, method: true, reference: true, status: true, reversedAt: true, reversalReason: true } },
        },
      },
    },
  });
  if (!customer) return null;
  const totalInvoicedCents = customer.invoices.reduce((sum, invoice) => sum + (invoice.status === "FINALIZED" ? invoice.totalCents : 0), 0);
  const totalCollectedCents = customer.invoices.reduce((sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + (payment.status === "POSTED" ? payment.amountCents : 0), 0), 0);
  const payments = customer.invoices.flatMap((invoice) => invoice.payments.map((payment) => ({ ...payment, invoiceNumber: invoice.invoiceNumber }))).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  return { ...customer, payments, totalInvoicedCents, totalCollectedCents, balanceCents: Math.max(0, totalInvoicedCents - totalCollectedCents) };
}

export async function findPotentialShopCustomerDuplicates(shopId: string, input: { name: string; phone?: string }) {
  await requireShopMembership(shopId);
  const name = input.name.trim();
  const phone = input.phone?.trim();
  const matches = await db.customer.findMany({
    where: { shopId, status: "ACTIVE", OR: [
      { name: { contains: name } },
      ...(phone ? [{ phone }] : []),
    ] },
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  const normalizedPhone = phone?.replace(/\D/g, "");
  return matches.filter((customer) => customer.name.toLocaleLowerCase() === name.toLocaleLowerCase() || Boolean(normalizedPhone && customer.phone?.replace(/\D/g, "") === normalizedPhone)).slice(0, 5);
}

export async function updateShopCustomer(
  shopId: string,
  customerId: string,
  input: { name: string; email?: string; phone?: string; address?: string; notes?: string },
) {
  const { user, membership } = await requireShopMembership(shopId);
  if (membership.role !== "SHOP_OWNER" && !membership.canManageCustomers) throw new Error("You do not have permission to manage customers in this shop.");
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.customer.updateMany({
        where: { id: customerId, shopId, status: "ACTIVE" },
        data: { name: input.name.trim(), email: input.email || null, phone: input.phone || null, address: input.address || null, notes: input.notes || null },
      });
      if (changed.count !== 1) throw new Error("Customer not found in this shop.");
      await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: customerId, summary: "Customer details updated" } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("A customer with this email already exists in this shop.");
    throw error;
  }
}

export async function archiveShopCustomer(shopId: string, customerId: string) {
  const { user, membership } = await requireShopMembership(shopId);
  if (membership.role !== "SHOP_OWNER" && !membership.canManageCustomers) throw new Error("You do not have permission to manage customers in this shop.");
  return db.$transaction(async (tx) => {
    const changed = await tx.customer.updateMany({ where: { id: customerId, shopId, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
    if (changed.count !== 1) throw new Error("Customer not found in this shop.");
    await tx.auditLog.create({ data: { actorId: user.id, shopId, action: "CUSTOMER_ARCHIVED", entityType: "Customer", entityId: customerId, summary: "Customer archived" } });
  });
}

export async function createShopCustomer(
  shopId: string,
  input: { name: string; email?: string; phone?: string; address?: string; notes?: string },
) {
  const { membership } = await requireShopMembership(shopId);
  const canManage = membership.role === "SHOP_OWNER" || membership.canManageCustomers;
  if (!canManage) throw new Error("You do not have permission to manage customers in this shop.");

  if (input.email) {
    const existing = await db.customer.findFirst({
      where: { shopId, email: input.email, status: "ACTIVE" },
      select: { id: true },
    });
    if (existing) throw new Error("A customer with this email already exists in this shop.");
  }

  try {
    return await db.customer.create({
      data: {
        shopId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        notes: input.notes || null,
      },
      select: { id: true, name: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.email) {
      throw new Error("A customer with this email already exists in this shop.");
    }
    throw error;
  }
}
