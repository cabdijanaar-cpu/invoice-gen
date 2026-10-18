import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";

const cookie = vi.hoisted(() => ({ value: "" }));
const resetEmail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/server/auth/password-reset-email", () => ({
  assertPasswordResetEmailConfigured: () => "https://invoiceflow.example.test",
  sendPasswordResetEmail: resetEmail.send,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => cookie.value ? { value: cookie.value } : undefined,
    set: (_name: string, value: string) => { cookie.value = value; },
    delete: () => { cookie.value = ""; },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { assertShopInvoiceCapacity, assertShopProductCapacity, getShopEntitlement } from "@/server/platform/entitlements";
import { createSession } from "@/server/auth/session";
import { getCurrentUser, requireShopMembership, requireShopPermission, requireSuperAdmin } from "@/server/auth/session";
import { archiveShopCustomer, createShopCustomer, getShopCustomerHistory, listShopCustomers, updateShopCustomer } from "@/server/shops/customers";
import { adjustShopStock, archiveShopProduct, createShopProduct, getShopProductMovementHistory, updateShopProduct } from "@/server/shops/products";
import { getShopDashboardStats } from "@/server/shops/dashboard";
import { addShopMember, listShopMembers, updateShopMember } from "@/server/shops/members";
import { createShopExpense, reverseShopExpense } from "@/server/shops/expenses";
import { getShopReport, reportRange } from "@/server/shops/reports";
import { getShopSettings } from "@/server/shops/settings";
import { assignPlatformSubscription, createPlatformPlan, getPlatformOverview, reviewPlatformPayment, submitShopSubscriptionPayment, updatePlatformShopStatus, updatePlatformSubscription, updatePlatformUserStatus } from "@/server/platform/admin";
import { createFinalizedInvoice, getShopInvoice, recordInvoicePayment, recordInvoiceRefund, reverseInvoicePayment, saveShopInvoiceDraft, voidFinalizedInvoice } from "@/server/shops/invoices";
import { convertAcceptedQuotation, createShopQuotation, transitionShopQuotation } from "@/server/shops/quotations";
import { consumeAuthAttempt } from "@/server/auth/rate-limit";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { requestPasswordResetAction } from "@/app/(auth)/password-reset-actions";
import { loginAction, logoutAction, registerAction } from "@/app/(auth)/actions";
import { createCustomerAction } from "@/app/dashboard/shops/[shopId]/customers/actions";
import { GET as invoicePdfRoute } from "@/app/dashboard/shops/[shopId]/invoices/[invoiceId]/pdf/route";
import { GET as reportCsvRoute } from "@/app/dashboard/shops/[shopId]/reports/csv/route";
import { updateSettingsAction } from "@/app/dashboard/shops/[shopId]/settings/actions";

async function clearDatabase() {
  await db.$executeRaw`TRUNCATE TABLE
    "AuditLog", "CustomerPayment", "InvoiceItem", "Invoice", "Customer",
    "InventoryMovement", "Product", "QuotationItem", "Quotation", "Expense",
    "SubscriptionPayment", "Subscription", "ShopSettings", "ShopMembership",
    "Session", "PasswordResetToken", "AuthRateLimit", "Shop", "SubscriptionPlan", "User"
    CASCADE`;
  cookie.value = "";
}

describe("shop tenant isolation", () => {
  beforeEach(clearDatabase);
  afterAll(async () => {
    await clearDatabase();
    await db.$disconnect();
  });

  it("records and reverses expenses and reconciles invoice balances in reports and CSV", async () => {
    const owner = await db.user.create({ data: { name: "Phase 5 Owner", email: "phase5-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Phase 5 Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, createdById: owner.id, invoiceNumber: "P5-001", status: "FINALIZED", issuedAt: new Date("2026-03-10T12:00:00.000Z"), totalCents: 10_000 } });
    await db.customerPayment.create({ data: { shopId: shop.id, invoiceId: invoice.id, recordedById: owner.id, amountCents: 4_000, method: "CASH", paidAt: new Date("2026-02-01T12:00:00.000Z") } });
    await createSession(owner.id);
    const expense = await createShopExpense(shop.id, { category: "Rent", description: "March rent", amountCents: 1_250, method: "CASH", incurredAt: new Date("2026-03-12T12:00:00.000Z") });
    const range = reportRange("2026-03-01", "2026-03-31");
    const report = await getShopReport(shop.id, range.from, range.to);
    expect(report.outstandingCents).toBe(6_000);
    expect(report.invoices[0]?.balanceCents).toBe(6_000);
    expect(report.collectedCents).toBe(0);
    expect(report.expenseCents).toBe(1_250);
    await reverseShopExpense(shop.id, expense.id, "Entered against the wrong month");
    await expect(reverseShopExpense(shop.id, expense.id, "Second attempt")).rejects.toThrow("already reversed");
    await expect(getShopReport(shop.id, range.from, range.to)).resolves.toMatchObject({ expenseCents: 0, expenses: [{ status: "REVERSED" }] });
    const response = await reportCsvRoute(new NextRequest("http://localhost/dashboard/shops/csv?from=2026-03-01&to=2026-03-31"), { params: Promise.resolve({ shopId: shop.id }) });
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(csv).toContain("balance_cents");
    expect(csv).toContain('"P5-001","FINALIZED","","","",10000,6000,');
    expect(await db.auditLog.count({ where: { shopId: shop.id, action: "EXPENSE_REVERSED" } })).toBe(1);
  });

  it("restricts platform controls to Super Admin and activates a subscription after payment approval", async () => {
    const admin = await db.user.create({ data: { name: "Billing Admin", email: "billing-admin@example.test", passwordHash: "test-hash", globalRole: "SUPER_ADMIN" }, select: { id: true } });
    const owner = await db.user.create({ data: { name: "Billing Owner", email: "billing-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Billing Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    await createSession(owner.id);
    await expect(getPlatformOverview()).rejects.toThrow("permission");
    await expect(updatePlatformShopStatus(shop.id, "SUSPENDED")).rejects.toThrow("permission");
    await expect(updatePlatformUserStatus(owner.id, "SUSPENDED")).rejects.toThrow("permission");
    await createSession(admin.id);
    const plan = await createPlatformPlan({ name: "Starter", monthlyPriceCents: 2_500, yearlyPriceCents: 25_000, trialDays: 14, graceDays: 3, maxUsers: 5, maxProducts: 100, maxInvoicesPerMonth: 500, features: "Core invoicing" });
    const start = new Date();
    const trialSubscription = await assignPlatformSubscription({ shopId: shop.id, planId: plan.id, interval: "MONTHLY", status: "TRIAL", startsAt: start, endsAt: new Date(start.getTime() + 14 * 86_400_000) });
    await expect(updatePlatformSubscription(trialSubscription.id, "TRIAL", new Date(start.getTime() + 15 * 86_400_000))).rejects.toThrow("cannot exceed");
    const trialOwner = await db.user.create({ data: { name: "Trial Owner", email: "trial-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const trialShop = await db.shop.create({ data: { name: "Configured Trial Shop", createdById: trialOwner.id }, select: { id: true } });
    await assignPlatformSubscription({ shopId: trialShop.id, planId: plan.id, interval: "MONTHLY", status: "TRIAL", startsAt: start, endsAt: null });
    await expect(db.subscription.findFirstOrThrow({ where: { shopId: trialShop.id } })).resolves.toMatchObject({ endsAt: new Date(start.getTime() + 14 * 86_400_000) });
    const noTrialPlan = await createPlatformPlan({ name: "No trial", monthlyPriceCents: 1_000, yearlyPriceCents: 10_000, trialDays: 0, graceDays: 0, maxUsers: null, maxProducts: null, maxInvoicesPerMonth: null, features: "" });
    await expect(assignPlatformSubscription({ shopId: trialShop.id, planId: noTrialPlan.id, interval: "MONTHLY", status: "TRIAL", startsAt: start, endsAt: null })).rejects.toThrow("does not include a trial");
    await createSession(owner.id);
    const payment = await submitShopSubscriptionPayment(shop.id, { method: "MOBILE_MONEY", reference: "PAY-2500", notes: "Sent from shop account" });
    expect(payment.amountCents).toBe(2_500);
    await db.subscriptionPlan.update({ where: { id: plan.id }, data: { monthlyPriceCents: 3_000 } });
    await createSession(admin.id);
    await expect(reviewPlatformPayment(payment.id, "APPROVED", "Transfer verified")).resolves.toMatchObject({ status: "APPROVED" });
    await expect(reviewPlatformPayment(payment.id, "APPROVED", "Duplicate review")).rejects.toThrow("already been reviewed");
    await expect(db.subscription.findFirstOrThrow({ where: { shopId: shop.id } })).resolves.toMatchObject({ status: "ACTIVE", interval: "MONTHLY" });
    await expect(db.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } })).resolves.toMatchObject({ status: "APPROVED", reviewedById: admin.id });
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "SUBSCRIPTION_PAYMENT_APPROVED" } })).resolves.toBe(1);
    await createSession(admin.id);
    await updatePlatformShopStatus(shop.id, "SUSPENDED");
    await createSession(owner.id);
    await expect(requireShopMembership(shop.id)).rejects.toThrow("permission");
    await createSession(admin.id);
    await updatePlatformShopStatus(shop.id, "ACTIVE");
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "SHOP_STATUS_CHANGED" } })).resolves.toBe(2);
    await expect(updatePlatformUserStatus(admin.id, "SUSPENDED")).rejects.toThrow("cannot suspend your own");
    await updatePlatformUserStatus(owner.id, "SUSPENDED");
    await expect(db.user.findUniqueOrThrow({ where: { id: owner.id } })).resolves.toMatchObject({ status: "SUSPENDED" });
    await updatePlatformUserStatus(owner.id, "ACTIVE");
    await expect(db.auditLog.count({ where: { action: "PLATFORM_USER_STATUS_CHANGED", entityId: owner.id } })).resolves.toBe(2);
  });

  it("manages shop staff and enforces the active member plan limit", async () => {
    const owner = await db.user.create({ data: { name: "Staff Owner", email: "staff-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const manager = await db.user.create({ data: { name: "Staff Manager", email: "staff-manager@example.test", passwordHash: "test-hash" }, select: { id: true } });
    await db.user.create({ data: { name: "Staff Cashier", email: "staff-cashier@example.test", passwordHash: "test-hash" } });
    const shop = await db.shop.create({ data: { name: "Staff Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    const plan = await db.subscriptionPlan.create({ data: { name: "Two seats", monthlyPriceCents: 1_000, yearlyPriceCents: 10_000, maxUsers: 2 } });
    await db.subscription.create({ data: { shopId: shop.id, planId: plan.id, status: "ACTIVE", interval: "MONTHLY", startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000) } });

    await createSession(owner.id);
    const added = await addShopMember(shop.id, "staff-manager@example.test", "MANAGER");
    await expect(addShopMember(shop.id, "staff-cashier@example.test", "CASHIER")).rejects.toThrow("active member limit");
    await updateShopMember(shop.id, added.id, { role: "MANAGER", status: "ACTIVE", canViewReports: true, canManageProducts: false, canManageCustomers: false, canManageSettings: false, canManageUsers: true, canAdjustInventory: false });
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "SHOP_MEMBER_ADDED" } })).resolves.toBe(1);

    await createSession(manager.id);
    await expect(listShopMembers(shop.id)).resolves.toHaveLength(2);
    await expect(addShopMember(shop.id, "staff-cashier@example.test", "CASHIER")).rejects.toThrow("active member limit");

    await createSession(owner.id);
    await updateShopMember(shop.id, added.id, { role: "MANAGER", status: "SUSPENDED", canViewReports: false, canManageProducts: false, canManageCustomers: false, canManageSettings: false, canManageUsers: false, canAdjustInventory: false });
    await expect(addShopMember(shop.id, "staff-cashier@example.test", "CASHIER")).resolves.toMatchObject({ role: "CASHIER", status: "ACTIVE" });
    await expect(db.shopMembership.count({ where: { shopId: shop.id, status: "ACTIVE" } })).resolves.toBe(2);
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "SHOP_MEMBER_UPDATED" } })).resolves.toBe(2);
  });

  it("enforces product and monthly invoice limits from the active plan", async () => {
    const owner = await db.user.create({ data: { name: "Limit Owner", email: "limit-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Limit Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    const plan = await db.subscriptionPlan.create({ data: { name: "Limited", monthlyPriceCents: 1_000, yearlyPriceCents: 10_000, graceDays: 3, maxProducts: 1, maxInvoicesPerMonth: 1 } });
    await db.subscription.create({ data: { shopId: shop.id, planId: plan.id, status: "ACTIVE", startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000) } });

    await expect(db.$transaction((tx) => assertShopProductCapacity(shop.id, tx))).resolves.toBeUndefined();
    await db.product.create({ data: { shopId: shop.id, name: "One product", sellingPriceCents: 500 } });
    await expect(db.$transaction((tx) => assertShopProductCapacity(shop.id, tx))).rejects.toThrow("active product limit");

    const now = new Date();
    await expect(db.$transaction((tx) => assertShopInvoiceCapacity(shop.id, tx, now))).resolves.toBeUndefined();
    await db.invoice.create({ data: { shopId: shop.id, createdById: owner.id, invoiceNumber: "LIMIT-001", status: "FINALIZED", issuedAt: now, totalCents: 500 } });
    await expect(db.$transaction((tx) => assertShopInvoiceCapacity(shop.id, tx, now))).rejects.toThrow("monthly invoice limit");

    const futureOwner = await db.user.create({ data: { name: "Future Owner", email: "future-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const futureShop = await db.shop.create({ data: { name: "Future Shop", createdById: futureOwner.id }, select: { id: true } });
    await db.subscription.create({ data: { shopId: futureShop.id, planId: plan.id, status: "ACTIVE", startsAt: new Date(Date.now() + 86_400_000) } });
    await expect(getShopEntitlement(futureShop.id)).resolves.toMatchObject({ hasAccess: false });
    await expect(db.$transaction((tx) => assertShopProductCapacity(futureShop.id, tx))).rejects.toThrow("subscription is not active");

    const graceOwner = await db.user.create({ data: { name: "Grace Owner", email: "grace-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const graceShop = await db.shop.create({ data: { name: "Grace Shop", createdById: graceOwner.id }, select: { id: true } });
    const graceSubscription = await db.subscription.create({ data: { shopId: graceShop.id, planId: plan.id, status: "ACTIVE", startsAt: new Date(Date.now() - 30 * 86_400_000), endsAt: new Date(Date.now() - 86_400_000) } });
    await expect(getShopEntitlement(graceShop.id)).resolves.toMatchObject({ hasAccess: true });
    await db.subscription.update({ where: { id: graceSubscription.id }, data: { endsAt: new Date(Date.now() - 4 * 86_400_000) } });
    await expect(getShopEntitlement(graceShop.id)).resolves.toMatchObject({ hasAccess: false });
  });

  it("updates shop settings for authorized owners and denies unprivileged managers", async () => {
    const owner = await db.user.create({ data: { name: "Settings Owner", email: "settings-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const manager = await db.user.create({ data: { name: "Settings Manager", email: "settings-manager@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Settings Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const formValues = {
      legalName: "Settings Shop LLC", address: "12 Test Road", phone: "+15555550123", email: "office@example.test",
      website: "https://example.test", taxId: "TEST-123", invoicePrefix: "SALE", quotationPrefix: "OFFER",
      defaultPaymentTerms: "Due in 15 days", defaultTaxRate: "5.25", defaultDiscount: "1.25",
      primaryColor: "#123ABC", footer: "Thank you for your business.", template: "MODERN",
    };
    const settingsForm = (values: Record<string, string>) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(values)) form.set(key, value);
      return form;
    };
    const expectedSettings = {
      legalName: formValues.legalName, address: formValues.address, phone: formValues.phone, email: formValues.email,
      website: formValues.website, taxId: formValues.taxId, invoicePrefix: formValues.invoicePrefix, quotationPrefix: formValues.quotationPrefix,
      defaultPaymentTerms: formValues.defaultPaymentTerms, defaultTaxRateBps: 525, defaultDiscountBps: 125,
      primaryColor: formValues.primaryColor, footer: formValues.footer, template: formValues.template,
    };

    await createSession(owner.id);
    await expect(updateSettingsAction(shop.id, {}, settingsForm(formValues))).resolves.toEqual({ success: "Settings saved." });
    await expect(getShopSettings(shop.id)).resolves.toMatchObject({ name: "Settings Shop", settings: expectedSettings });
    await expect(updateSettingsAction(shop.id, {}, settingsForm({ ...formValues, email: "invalid-email" }))).resolves.toEqual({ error: "Check the settings and try again." });
    await expect(db.auditLog.findMany({ where: { shopId: shop.id, action: "SHOP_SETTINGS_UPDATED" }, select: { actorId: true } })).resolves.toEqual([{ actorId: owner.id }]);

    await db.shopMembership.create({ data: { userId: manager.id, shopId: shop.id, role: "MANAGER" } });
    await createSession(manager.id);
    await expect(getShopSettings(shop.id)).rejects.toThrow("permission");
    await expect(updateSettingsAction(shop.id, {}, settingsForm({ ...formValues, invoicePrefix: "DENIED" }))).resolves.toEqual({ error: "You do not have permission to perform this action." });
    await expect(db.shopSettings.findUniqueOrThrow({ where: { shopId: shop.id }, select: { invoicePrefix: true } })).resolves.toEqual({ invoicePrefix: "SALE" });
  });

  it("allows a member to read their shop and denies another shop by ID", async () => {
    const owner = await db.user.create({
      data: { name: "Owner A", email: "owner-a@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const otherOwner = await db.user.create({
      data: { name: "Owner B", email: "owner-b@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const shopA = await db.shop.create({
      data: { name: "Shop A", createdBy: { connect: { id: owner.id } }, settings: { create: {} }, memberships: { create: { user: { connect: { id: owner.id } }, role: "SHOP_OWNER" } } },
      select: { id: true },
    });
    const shopB = await db.shop.create({
      data: { name: "Shop B", createdBy: { connect: { id: otherOwner.id } }, settings: { create: {} }, memberships: { create: { user: { connect: { id: otherOwner.id } }, role: "SHOP_OWNER" } } },
      select: { id: true },
    });

    await createSession(owner.id);
    await db.customer.create({ data: { shopId: shopA.id, name: "Customer A" } });
    await db.customer.create({ data: { shopId: shopB.id, name: "Customer B" } });
    const otherInvoice = await db.invoice.create({
      data: { shopId: shopB.id, createdById: otherOwner.id, invoiceNumber: "INV-000001", status: "FINALIZED" },
      select: { id: true },
    });

    await expect(listShopCustomers(shopA.id)).resolves.toMatchObject({ customers: [{ name: "Customer A" }], total: 1 });
    await expect(listShopCustomers(shopB.id)).rejects.toThrow("permission");
    await expect(getShopInvoice(shopA.id, otherInvoice.id)).resolves.toBeNull();
  });

  it("serves invoice PDFs only to an authorized shop member", async () => {
    const owner = await db.user.create({ data: { name: "PDF Owner", email: "pdf-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const otherOwner = await db.user.create({ data: { name: "PDF Other", email: "pdf-other@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "PDF Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const otherShop = await db.shop.create({ data: { name: "Other PDF Shop", createdById: otherOwner.id, memberships: { create: { userId: otherOwner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, createdById: owner.id, invoiceNumber: "PDF-001", status: "FINALIZED", totalCents: 2_500 } });
    const foreignInvoice = await db.invoice.create({ data: { shopId: otherShop.id, createdById: otherOwner.id, invoiceNumber: "PRIVATE-001", status: "FINALIZED", totalCents: 9_999 } });
    await createSession(owner.id);
    const response = await invoicePdfRoute(new Request("http://localhost"), { params: Promise.resolve({ shopId: shop.id, invoiceId: invoice.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await response.arrayBuffer()).toString("ascii")).toContain("PDF-001");
    const forbidden = await invoicePdfRoute(new Request("http://localhost"), { params: Promise.resolve({ shopId: shop.id, invoiceId: foreignInvoice.id }) });
    expect(forbidden.status).toBe(404);
  });

  it("records partial invoice payments once, rejects overpayment, and blocks cross-shop access", async () => {
    const owner = await db.user.create({ data: { name: "Payment Owner", email: "payment-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const otherOwner = await db.user.create({ data: { name: "Payment Other", email: "payment-other@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Payment Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    const otherShop = await db.shop.create({ data: { name: "Other Payment Shop", createdById: otherOwner.id, memberships: { create: { userId: otherOwner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, createdById: owner.id, invoiceNumber: "PAY-001", status: "FINALIZED", totalCents: 5_000 } });
    const otherInvoice = await db.invoice.create({ data: { shopId: otherShop.id, createdById: otherOwner.id, invoiceNumber: "PAY-002", status: "FINALIZED", totalCents: 5_000 } });
    await createSession(owner.id);
    const input = { amountCents: 1_500, method: "MOBILE_MONEY" as const, reference: "TX-123", idempotencyKey: "e6cf1562-220f-4ca7-a8a8-269f41f6d164" };
    await expect(recordInvoicePayment(shop.id, invoice.id, input)).resolves.toMatchObject({ duplicate: false });
    await expect(recordInvoicePayment(shop.id, invoice.id, input)).resolves.toMatchObject({ duplicate: true });
    await expect(recordInvoicePayment(shop.id, invoice.id, { ...input, amountCents: 3_501, idempotencyKey: "d0041ef0-0ad6-4cbe-a77c-cd3f260785d7" })).rejects.toThrow("exceeds");
    await expect(recordInvoicePayment(otherShop.id, otherInvoice.id, { ...input, idempotencyKey: "2948c4bc-a3be-45a2-aad0-bb3aecfc1b92" })).rejects.toThrow("permission");
    await expect(db.customerPayment.count({ where: { shopId: shop.id, invoiceId: invoice.id } })).resolves.toBe(1);
    await expect(getShopInvoice(shop.id, invoice.id)).resolves.toMatchObject({ payments: [{ amountCents: 1_500, reference: "TX-123" }] });
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "INVOICE_PAYMENT_RECORDED" } })).resolves.toBe(1);
    const originalPaymentId = (await db.customerPayment.findFirstOrThrow({ where: { invoiceId: invoice.id } })).id;
    const refundInput = { amountCents: 500, reason: "Partial return", idempotencyKey: "2f727a14-b32f-4d08-b3ca-4dc910835ebc" };
    await expect(recordInvoiceRefund(shop.id, invoice.id, originalPaymentId, refundInput)).resolves.toMatchObject({ duplicate: false });
    await expect(recordInvoiceRefund(shop.id, invoice.id, originalPaymentId, refundInput)).resolves.toMatchObject({ duplicate: true });
    await expect(recordInvoiceRefund(shop.id, invoice.id, originalPaymentId, { amountCents: 1_001, reason: "Too much refund", idempotencyKey: "4b31745e-a254-45d6-aa72-f9196818efcc" })).rejects.toThrow("exceeds");
    const afterRefund = await getShopInvoice(shop.id, invoice.id);
    expect(afterRefund?.payments.reduce((sum, payment) => sum + (payment.status === "POSTED" ? payment.amountCents : 0), 0)).toBe(1_000);
    await expect(reverseInvoicePayment(shop.id, invoice.id, originalPaymentId, "Refund returned to customer")).resolves.toMatchObject({ amountCents: 1_500 });
    const afterReversal = await getShopInvoice(shop.id, invoice.id);
    expect(afterReversal?.payments.every((payment) => payment.status === "REVERSED")).toBe(true);
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "INVOICE_PAYMENT_REVERSED" } })).resolves.toBe(2);
    const replacement = await recordInvoicePayment(shop.id, invoice.id, { ...input, amountCents: 5_000, idempotencyKey: "e61b489e-4fc9-4bd7-bfae-e98829601499" });
    await expect(replacement).toMatchObject({ duplicate: false });
    const cashier = await db.user.create({ data: { name: "Payment Cashier", email: "payment-cashier@example.test", passwordHash: "test-hash" }, select: { id: true } });
    await db.shopMembership.create({ data: { userId: cashier.id, shopId: shop.id, role: "CASHIER" } });
    await createSession(cashier.id);
    await expect(reverseInvoicePayment(shop.id, invoice.id, replacement.id, "Refund requested")).rejects.toThrow("Only a shop owner or manager");
    await expect(recordInvoiceRefund(shop.id, invoice.id, replacement.id, { amountCents: 100, reason: "Cashier refund", idempotencyKey: "d0117526-ea8a-49e1-a5f3-afcbb6da6b01" })).rejects.toThrow("Only a shop owner or manager");
    await createSession(owner.id);
    await expect(reverseInvoicePayment(shop.id, invoice.id, originalPaymentId, "Repeat refund")).rejects.toThrow("not found");
  });

  it("voids a finalized invoice only after payments are reversed and restores sale stock once", async () => {
    const owner = await db.user.create({ data: { name: "Void Owner", email: "void-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Void Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const product = await db.product.create({ data: { shopId: shop.id, name: "Returned item", sellingPriceCents: 1_000, stockQuantityMilli: 0 } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, createdById: owner.id, invoiceNumber: "VOID-001", status: "FINALIZED", totalCents: 1_000 } });
    await db.invoiceItem.create({ data: { invoiceId: invoice.id, position: 0, productId: product.id, description: product.name, quantityMilli: 1_000, unitPriceCents: 1_000, lineTotalCents: 1_000 } });
    await db.inventoryMovement.create({ data: { shopId: shop.id, productId: product.id, type: "SALE", quantityDeltaMilli: -1_000, reason: "Invoice VOID-001", sourceType: "INVOICE", sourceId: invoice.id } });
    const payment = await db.customerPayment.create({ data: { shopId: shop.id, invoiceId: invoice.id, recordedById: owner.id, amountCents: 500, method: "CASH" } });
    await createSession(owner.id);
    await expect(voidFinalizedInvoice(shop.id, invoice.id, "Customer cancellation")).rejects.toThrow("Reverse all posted payments");
    await reverseInvoicePayment(shop.id, invoice.id, payment.id, "Cash returned to customer");
    await expect(voidFinalizedInvoice(shop.id, invoice.id, "Customer cancellation")).resolves.toMatchObject({ id: invoice.id });
    await expect(db.invoice.findUnique({ where: { id: invoice.id }, select: { status: true, voidReason: true } })).resolves.toEqual({ status: "VOID", voidReason: "Customer cancellation" });
    await expect(db.product.findUnique({ where: { id: product.id }, select: { stockQuantityMilli: true } })).resolves.toEqual({ stockQuantityMilli: 1_000 });
    await expect(db.inventoryMovement.count({ where: { shopId: shop.id, sourceType: "INVOICE_VOID", sourceId: invoice.id } })).resolves.toBe(1);
    await expect(voidFinalizedInvoice(shop.id, invoice.id, "Repeated cancellation")).rejects.toThrow("not found");
  });

  it("saves and edits an invoice draft without changing stock, then finalizes it once", async () => {
    const owner = await db.user.create({ data: { name: "Draft Owner", email: "draft-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Draft Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const product = await db.product.create({ data: { shopId: shop.id, name: "Draft product", sellingPriceCents: 700, stockQuantityMilli: 4_000 } });
    await createSession(owner.id);
    const firstDraft = await saveShopInvoiceDraft(shop.id, { invoiceDiscountCents: 0, lines: [{ productId: product.id, description: product.name, quantityMilli: 1_000, unitPriceCents: 700, lineDiscountCents: 0, taxRateBps: 0 }] });
    await expect(db.product.findUnique({ where: { id: product.id }, select: { stockQuantityMilli: true } })).resolves.toEqual({ stockQuantityMilli: 4_000 });
    const updatedDraft = await saveShopInvoiceDraft(shop.id, { invoiceDiscountCents: 100, notes: "Edited before issue", lines: [{ productId: product.id, description: product.name, quantityMilli: 2_000, unitPriceCents: 700, lineDiscountCents: 0, taxRateBps: 0 }] }, firstDraft.id);
    expect(updatedDraft).toEqual(firstDraft);
    const finalized = await createFinalizedInvoice(shop.id, { draftId: firstDraft.id, invoiceDiscountCents: 100, notes: "Edited before issue", idempotencyKey: "37fd4888-98a2-4731-8a28-a594a782e6e1", lines: [{ productId: product.id, description: product.name, quantityMilli: 2_000, unitPriceCents: 700, lineDiscountCents: 0, taxRateBps: 0 }] });
    expect(finalized).toMatchObject({ id: firstDraft.id, invoiceNumber: firstDraft.invoiceNumber, duplicate: false });
    await expect(createFinalizedInvoice(shop.id, { draftId: firstDraft.id, invoiceDiscountCents: 100, idempotencyKey: "37fd4888-98a2-4731-8a28-a594a782e6e1", lines: [{ productId: product.id, description: product.name, quantityMilli: 2_000, unitPriceCents: 700, lineDiscountCents: 0, taxRateBps: 0 }] })).resolves.toMatchObject({ id: firstDraft.id, duplicate: true });
    await expect(db.invoice.findUnique({ where: { id: firstDraft.id }, select: { status: true, totalCents: true } })).resolves.toEqual({ status: "FINALIZED", totalCents: 1_300 });
    await expect(db.product.findUnique({ where: { id: product.id }, select: { stockQuantityMilli: true } })).resolves.toEqual({ stockQuantityMilli: 2_000 });
    await expect(db.inventoryMovement.count({ where: { shopId: shop.id, sourceType: "INVOICE", sourceId: firstDraft.id } })).resolves.toBe(1);
  });

  it("converts an accepted quotation into one invoice and deducts stock once", async () => {
    const owner = await db.user.create({ data: { name: "Quote Owner", email: "quote-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Quote Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } }, settings: { create: {} } }, select: { id: true } });
    const customer = await db.customer.create({ data: { shopId: shop.id, name: "Quote Customer" } });
    const product = await db.product.create({ data: { shopId: shop.id, name: "Quoted product", sellingPriceCents: 1_250, stockQuantityMilli: 3_000 } });
    await createSession(owner.id);
    const quote = await createShopQuotation(shop.id, { customerId: customer.id, invoiceDiscountCents: 0, lines: [{ productId: product.id, description: product.name, quantityMilli: 1_000, unitPriceCents: 1_250, lineDiscountCents: 0, taxRateBps: 0 }] });
    await transitionShopQuotation(shop.id, quote.id, "SENT");
    await transitionShopQuotation(shop.id, quote.id, "ACCEPTED");
    const first = await convertAcceptedQuotation(shop.id, quote.id);
    const retry = await convertAcceptedQuotation(shop.id, quote.id);
    expect(first).toMatchObject({ duplicate: false });
    expect(retry).toMatchObject({ id: first.id, duplicate: true });
    await expect(db.quotation.findUnique({ where: { id: quote.id }, select: { status: true, convertedInvoiceId: true } })).resolves.toEqual({ status: "CONVERTED", convertedInvoiceId: first.id });
    await expect(db.product.findUnique({ where: { id: product.id }, select: { stockQuantityMilli: true } })).resolves.toEqual({ stockQuantityMilli: 2_000 });
    await expect(db.inventoryMovement.count({ where: { shopId: shop.id, type: "SALE", sourceId: first.id } })).resolves.toBe(1);
    const expired = await createShopQuotation(shop.id, { expiresAt: new Date("2020-01-01T00:00:00.000Z"), invoiceDiscountCents: 0, lines: [{ description: "Expired custom item", quantityMilli: 1_000, unitPriceCents: 300, lineDiscountCents: 0, taxRateBps: 0 }] });
    await transitionShopQuotation(shop.id, expired.id, "SENT");
    await expect(transitionShopQuotation(shop.id, expired.id, "ACCEPTED")).resolves.toEqual({ status: "EXPIRED" });
    await expect(db.quotation.findUnique({ where: { id: expired.id }, select: { status: true } })).resolves.toEqual({ status: "EXPIRED" });
  });

  it("cannot create customer records in a shop without membership", async () => {
    const owner = await db.user.create({
      data: { name: "Owner A", email: "create-a@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const otherOwner = await db.user.create({
      data: { name: "Owner B", email: "create-b@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const shopA = await db.shop.create({
      data: { name: "Shop A", createdBy: { connect: { id: owner.id } }, settings: { create: {} }, memberships: { create: { user: { connect: { id: owner.id } }, role: "SHOP_OWNER" } } },
      select: { id: true },
    });
    const shopB = await db.shop.create({
      data: { name: "Shop B", createdBy: { connect: { id: otherOwner.id } }, settings: { create: {} }, memberships: { create: { user: { connect: { id: otherOwner.id } }, role: "SHOP_OWNER" } } },
      select: { id: true },
    });
    await createSession(owner.id);

    await expect(createShopCustomer(shopB.id, { name: "Cross tenant attempt" })).rejects.toThrow("permission");
    await expect(db.customer.count({ where: { shopId: shopB.id } })).resolves.toBe(0);
    await expect(db.shop.count({ where: { id: shopA.id } })).resolves.toBe(1);
  });

  it("updates and archives customers within their shop while retaining the record", async () => {
    const owner = await db.user.create({ data: { name: "Customer Owner", email: "customer-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({
      data: { name: "Customer Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } },
      select: { id: true },
    });
    const customer = await db.customer.create({ data: { shopId: shop.id, name: "Old customer", email: "old@example.test" }, select: { id: true } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, customerId: customer.id, createdById: owner.id, invoiceNumber: "INV-000001", status: "FINALIZED", totalCents: 4_200, issuedAt: new Date() }, select: { id: true } });
    await db.customerPayment.create({ data: { shopId: shop.id, invoiceId: invoice.id, customerId: customer.id, recordedById: owner.id, amountCents: 1_200, method: "CASH" } });
    await createSession(owner.id);

    await updateShopCustomer(shop.id, customer.id, { name: "Updated customer", email: "new@example.test", phone: "123", address: "Market street", notes: "Preferred customer" });
    await archiveShopCustomer(shop.id, customer.id);

    await expect(db.customer.findUnique({ where: { id: customer.id }, select: { name: true, email: true, status: true } })).resolves.toEqual({ name: "Updated customer", email: "new@example.test", status: "ARCHIVED" });
    await expect(db.auditLog.count({ where: { shopId: shop.id, entityId: customer.id } })).resolves.toBe(2);
    await expect(listShopCustomers(shop.id)).resolves.toMatchObject({ customers: [], total: 0 });
    await expect(getShopCustomerHistory(shop.id, customer.id)).resolves.toMatchObject({ totalInvoicedCents: 4_200, totalCollectedCents: 1_200, balanceCents: 3_000, invoices: [{ invoiceNumber: "INV-000001" }], payments: [{ invoiceNumber: "INV-000001", amountCents: 1_200, method: "CASH" }] });
  });

  it("asks the operator to review likely duplicate customers before creating another", async () => {
    const owner = await db.user.create({ data: { name: "Duplicate Owner", email: "duplicate-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Duplicate Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } }, select: { id: true } });
    await db.customer.create({ data: { shopId: shop.id, name: "Sam Customer", phone: "+1 (555) 010-1234" } });
    await createSession(owner.id);
    const formData = new FormData();
    formData.set("name", "Sam Customer");
    formData.set("email", "sam-two@example.test");
    formData.set("phone", "15550101234");
    formData.set("address", "");
    formData.set("notes", "");

    await expect(createCustomerAction(shop.id, {}, formData)).resolves.toMatchObject({ possibleDuplicates: [{ name: "Sam Customer" }] });
    await expect(db.customer.count({ where: { shopId: shop.id } })).resolves.toBe(1);
    formData.set("confirmPossibleDuplicates", "on");
    await expect(createCustomerAction(shop.id, {}, formData)).resolves.toMatchObject({ success: "Customer added." });
    await expect(db.customer.count({ where: { shopId: shop.id } })).resolves.toBe(2);
  });

  it("updates products within their shop and archives only after stock reaches zero", async () => {
    const owner = await db.user.create({ data: { name: "Product Owner", email: "product-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({
      data: { name: "Product Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER" } } },
      select: { id: true },
    });
    const product = await db.product.create({ data: { shopId: shop.id, name: "Old name", sellingPriceCents: 250, stockQuantityMilli: 1_000 }, select: { id: true } });
    await createSession(owner.id);

    await expect(updateShopProduct(shop.id, product.id, {
      name: "New name", purchaseCostCents: 100, sellingPriceCents: 300, lowStockThresholdMilli: 2_000, unit: "item",
    })).resolves.toBeUndefined();
    await expect(archiveShopProduct(shop.id, product.id)).rejects.toThrow("Adjust stock to zero");
    await db.product.update({ where: { id: product.id }, data: { stockQuantityMilli: 0 } });
    await archiveShopProduct(shop.id, product.id);

    await expect(db.product.findUnique({ where: { id: product.id }, select: { name: true, status: true } })).resolves.toEqual({ name: "New name", status: "ARCHIVED" });
    await expect(db.auditLog.count({ where: { shopId: shop.id, entityId: product.id } })).resolves.toBe(2);
  });

  it("records fractional stock adjustments once and keeps dashboard totals shop-scoped", async () => {
    const owner = await db.user.create({ data: { name: "Metrics Owner", email: "metrics-owner@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const otherOwner = await db.user.create({ data: { name: "Other Owner", email: "metrics-other@example.test", passwordHash: "test-hash" }, select: { id: true } });
    const shop = await db.shop.create({ data: { name: "Metrics Shop", createdById: owner.id, memberships: { create: { userId: owner.id, role: "SHOP_OWNER", canAdjustInventory: true } } }, select: { id: true } });
    const otherShop = await db.shop.create({ data: { name: "Other Metrics Shop", createdById: otherOwner.id, memberships: { create: [{ userId: otherOwner.id, role: "SHOP_OWNER" }, { userId: owner.id, role: "MANAGER" }] } }, select: { id: true } });
    const customer = await db.customer.create({ data: { shopId: shop.id, name: "Metrics Customer" }, select: { id: true } });
    const invoice = await db.invoice.create({ data: { shopId: shop.id, customerId: customer.id, createdById: owner.id, invoiceNumber: "INV-METRIC-1", status: "FINALIZED", totalCents: 5_000, issuedAt: new Date() }, select: { id: true } });
    await db.invoice.create({ data: { shopId: otherShop.id, createdById: otherOwner.id, invoiceNumber: "INV-METRIC-2", status: "FINALIZED", totalCents: 20_000, issuedAt: new Date() } });
    await db.customerPayment.create({ data: { shopId: shop.id, invoiceId: invoice.id, customerId: customer.id, recordedById: owner.id, amountCents: 1_000, method: "CASH" } });
    await db.customerPayment.create({ data: { shopId: otherShop.id, invoiceId: (await db.invoice.findFirstOrThrow({ where: { shopId: otherShop.id } })).id, recordedById: otherOwner.id, amountCents: 15_000, method: "CASH" } });
    await db.expense.create({ data: { shopId: shop.id, recordedById: owner.id, category: "Rent", description: "Monthly rent", amountCents: 400 } });
    await db.expense.create({ data: { shopId: otherShop.id, recordedById: otherOwner.id, category: "Rent", description: "Other rent", amountCents: 900 } });
    await db.product.create({ data: { shopId: shop.id, name: "Low stock", sellingPriceCents: 100, stockQuantityMilli: 500, lowStockThresholdMilli: 1_000 } });
    await db.product.create({ data: { shopId: otherShop.id, name: "Other stock", sellingPriceCents: 100, stockQuantityMilli: 5_000, lowStockThresholdMilli: 1_000 } });
    await createSession(owner.id);

    const openingProduct = await createShopProduct(shop.id, { name: "Fractional opening", purchaseCostCents: 40, sellingPriceCents: 100, initialStockMilli: 1_275, lowStockThresholdMilli: 250, unit: "kg" });
    await expect(getShopProductMovementHistory(shop.id, openingProduct.id)).resolves.toMatchObject({ product: { stockQuantityMilli: 1_275 }, total: 1, movements: [{ type: "OPENING", quantityDeltaMilli: 1_275 }] });
    await expect(updateShopProduct(shop.id, openingProduct.id, { name: "Fractional opening", purchaseCostCents: 40, sellingPriceCents: 100, lowStockThresholdMilli: 250, unit: "lb" })).rejects.toThrow("unit cannot change");

    const requestKey = "9a1b13da-a548-412c-b68f-86b3f4992c05";
    await expect(adjustShopStock(shop.id, openingProduct.id, { deltaMilli: 375, reason: "Measured restock", idempotencyKey: requestKey, movementType: "RESTOCK" })).resolves.toEqual({ duplicate: false });
    await expect(adjustShopStock(shop.id, openingProduct.id, { deltaMilli: 375, reason: "Measured restock", idempotencyKey: requestKey, movementType: "RESTOCK" })).resolves.toEqual({ duplicate: true });
    await expect(db.auditLog.count({ where: { shopId: shop.id, action: "INVENTORY_RESTOCKED", entityType: "InventoryMovement" } })).resolves.toBe(1);
    await expect(adjustShopStock(shop.id, openingProduct.id, { deltaMilli: -100, reason: "Invalid restock", idempotencyKey: "f9b2bd30-b5f0-4f87-a44f-f33e38544aab", movementType: "RESTOCK" })).rejects.toThrow("positive");
    await expect(db.product.findUnique({ where: { id: openingProduct.id }, select: { stockQuantityMilli: true } })).resolves.toEqual({ stockQuantityMilli: 1_650 });
    await expect(getShopProductMovementHistory(shop.id, openingProduct.id)).resolves.toMatchObject({ total: 2, movements: [{ type: "RESTOCK", quantityDeltaMilli: 375 }, { type: "OPENING", quantityDeltaMilli: 1_275 }] });

    const currentMonth = new Date();
    const trendFrom = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth(), 1));
    const trendTo = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1));
    const trendFromText = trendFrom.toISOString().slice(0, 10);
    const trendToText = new Date(trendTo.getTime() - 86_400_000).toISOString().slice(0, 10);
    await expect(getShopDashboardStats(shop.id, trendFromText, trendToText)).resolves.toMatchObject({ totalSalesCents: 5_000, collectedCents: 1_000, outstandingCents: 4_000, expenseCents: 400, invoiceCount: 1, lowStockCount: 1, recentInvoices: [{ invoiceNumber: "INV-METRIC-1" }], monthlySales: [{ month: trendFrom.toISOString().slice(0, 7), salesCents: 5_000, invoiceCount: 1 }] });
    await expect(getShopDashboardStats(otherShop.id, trendFromText, trendToText)).resolves.toMatchObject({ totalSalesCents: 20_000, collectedCents: 15_000, outstandingCents: 5_000, expenseCents: 900, invoiceCount: 1, lowStockCount: 0, recentInvoices: [{ invoiceNumber: "INV-METRIC-2" }], monthlySales: [{ month: trendFrom.toISOString().slice(0, 7), salesCents: 20_000, invoiceCount: 1 }] });
  });

  it("stores only a hash of the opaque session token", async () => {
    const user = await db.user.create({
      data: { name: "Session User", email: "session@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    await createSession(user.id);

    const stored = await db.session.findUnique({
      where: { tokenHash: createHash("sha256").update(cookie.value).digest("hex") },
      select: { tokenHash: true, expiresAt: true },
    });
    expect(cookie.value).toHaveLength(43);
    expect(stored?.tokenHash).not.toBe(cookie.value);
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rotates the current browser session token when a new session is created", async () => {
    const user = await db.user.create({
      data: { name: "Rotation User", email: "rotation@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    await createSession(user.id);
    const firstToken = cookie.value;
    await createSession(user.id);

    expect(cookie.value).not.toBe(firstToken);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(db.session.findUnique({ where: { tokenHash: createHash("sha256").update(firstToken).digest("hex") } })).resolves.toBeNull();
  });

  it("limits repeated authentication attempts without storing the email", async () => {
    const windowStart = new Date("2026-10-18T12:00:00.000Z");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(consumeAuthAttempt("login", "ratelimit@example.test", windowStart)).resolves.toBe(true);
    }
    await expect(consumeAuthAttempt("login", "ratelimit@example.test", windowStart)).resolves.toBe(false);

    const entries = await db.authRateLimit.findMany({ select: { key: true } });
    expect(entries).toHaveLength(1);
    expect(entries[0].key).not.toContain("ratelimit@example.test");
  });

  it("sends hashed, single-use reset tokens and revokes sessions after password change", async () => {
    resetEmail.send.mockReset().mockResolvedValue(undefined);
    const user = await db.user.create({
      data: { name: "Reset User", email: "reset@example.test", passwordHash: await hashPassword("old-password-123") },
      select: { id: true, passwordHash: true },
    });
    await createSession(user.id);

    await requestPasswordReset("reset@example.test");
    expect(resetEmail.send).toHaveBeenCalledTimes(1);
    const email = resetEmail.send.mock.calls[0][0] as { resetUrl: string; expiresInMinutes: number };
    expect(email.expiresInMinutes).toBe(30);
    const token = new URL(email.resetUrl).searchParams.get("token");
    expect(token).toMatch(/^[\w-]{43}$/);

    const stored = await db.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(token);
    expect(stored[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    await expect(completePasswordReset(token!, "a-new-password-123")).resolves.toBe(true);
    await expect(completePasswordReset(token!, "another-password-123")).resolves.toBe(false);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    const resetAudit = await db.auditLog.findMany({
      where: { actorId: user.id },
      select: { action: true, entityId: true, summary: true },
    });
    expect(resetAudit).toEqual(expect.arrayContaining([
      { action: "AUTH_SESSION_CREATED", entityId: null, summary: "Authentication session started" },
      { action: "AUTH_PASSWORD_RESET_REQUESTED", entityId: user.id, summary: "Password reset requested" },
      { action: "AUTH_PASSWORD_RESET_COMPLETED", entityId: user.id, summary: "Password reset completed; existing sessions revoked" },
    ]));
    expect(JSON.stringify(resetAudit)).not.toContain(token);
    expect(JSON.stringify(resetAudit)).not.toContain("a-new-password-123");
    const updated = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    await expect(verifyPassword("a-new-password-123", updated.passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("old-password-123", updated.passwordHash)).resolves.toBe(false);
  });

  it("does not send password reset mail for an unknown email", async () => {
    resetEmail.send.mockReset().mockResolvedValue(undefined);
    await db.user.create({ data: { name: "Existing Reset", email: "known-reset@example.test", passwordHash: "test-hash" } });
    const existing = new FormData();
    existing.set("email", "known-reset@example.test");
    const missing = new FormData();
    missing.set("email", "missing@example.test");

    const existingResult = await requestPasswordResetAction({}, existing);
    const missingResult = await requestPasswordResetAction({}, missing);
    expect(existingResult).toEqual(missingResult);
    expect(existingResult.message).toMatch(/If an account matches/);
    expect(resetEmail.send).toHaveBeenCalledTimes(1);
  });

  it("removes the reset token if email delivery fails", async () => {
    resetEmail.send.mockReset().mockRejectedValue(new Error("provider unavailable"));
    const user = await db.user.create({
      data: { name: "Delivery Failure", email: "delivery-failure@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });

    await expect(requestPasswordReset("delivery-failure@example.test")).rejects.toThrow("provider unavailable");
    await expect(db.passwordResetToken.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("enforces membership permissions and rejects suspended accounts", async () => {
    const user = await db.user.create({
      data: { name: "Manager", email: "manager@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const owner = await db.user.create({
      data: { name: "Owner", email: "manager-shop-owner@example.test", passwordHash: "test-hash" },
      select: { id: true },
    });
    const shop = await db.shop.create({
      data: {
        name: "Manager Shop",
        createdBy: { connect: { id: owner.id } },
        memberships: {
          create: [
            { user: { connect: { id: owner.id } }, role: "SHOP_OWNER" },
            { user: { connect: { id: user.id } }, role: "MANAGER", canManageProducts: true },
          ],
        },
      },
      select: { id: true },
    });
    await createSession(user.id);

    await expect(requireShopPermission(shop.id, "canManageProducts")).resolves.toMatchObject({ membership: { role: "MANAGER" } });
    await expect(requireShopPermission(shop.id, "canManageSettings")).rejects.toThrow("permission");

    await db.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });
    await expect(getCurrentUser()).resolves.toBeNull();
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("allows platform admin role checks only for SUPER_ADMIN", async () => {
    const admin = await db.user.create({
      data: { name: "Platform Admin", email: "admin@example.test", passwordHash: "test-hash", globalRole: "SUPER_ADMIN" },
      select: { id: true },
    });
    await createSession(admin.id);
    await expect(requireSuperAdmin()).resolves.toMatchObject({ id: admin.id, globalRole: "SUPER_ADMIN" });

    await db.user.create({ data: { name: "Regular", email: "regular@example.test", passwordHash: "test-hash" } });
    await db.session.deleteMany({ where: { userId: admin.id } });
    const regular = await db.user.findUniqueOrThrow({ where: { email: "regular@example.test" }, select: { id: true } });
    await createSession(regular.id);
    await expect(requireSuperAdmin()).rejects.toThrow("permission");
  });

  it("registers, logs in with session rotation, and logs out", async () => {
    const registration = new FormData();
    registration.set("name", "Auth Flow User");
    registration.set("email", "auth-flow@example.test");
    registration.set("shopName", "Auth Flow Shop");
    registration.set("password", "secure-password-123");

    await expect(registerAction({}, registration)).rejects.toThrow("redirect:/dashboard");
    const user = await db.user.findUniqueOrThrow({ where: { email: "auth-flow@example.test" } });
    expect(user.passwordHash).not.toBe("secure-password-123");
    await expect(db.shopMembership.findFirst({ where: { userId: user.id, role: "SHOP_OWNER" } })).resolves.not.toBeNull();
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);

    const oldToken = cookie.value;
    const login = new FormData();
    login.set("email", "AUTH-FLOW@example.test");
    login.set("password", "secure-password-123");
    await expect(loginAction({}, login)).rejects.toThrow("redirect:/dashboard");
    expect(cookie.value).not.toBe(oldToken);
    const loginToken = cookie.value;
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);

    await expect(logoutAction()).rejects.toThrow("redirect:/login");
    expect(cookie.value).toBe("");
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(0);

    const authAudit = await db.auditLog.findMany({
      where: { actorId: user.id },
      select: { action: true, entityType: true, entityId: true, summary: true },
    });
    expect(authAudit.map(({ action }) => action).sort()).toEqual([
      "AUTH_ACCOUNT_REGISTERED",
      "AUTH_LOGIN_SUCCESS",
      "AUTH_LOGOUT",
      "AUTH_SESSION_CREATED",
    ]);
    const serializedAudit = JSON.stringify(authAudit);
    expect(serializedAudit).not.toContain("secure-password-123");
    expect(serializedAudit).not.toContain(oldToken);
    expect(serializedAudit).not.toContain(loginToken);
  });
});
