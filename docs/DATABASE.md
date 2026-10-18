# Database design

**Status:** The Prisma datasource targets PostgreSQL for Supabase. The checked-in baseline at `prisma/migrations/20261016180000_supabase_postgresql_baseline/` has been applied to the configured app project and Prisma reports the schema is up to date. All 57 tests across 11 files passed against a separate disposable Supabase test project. That project uses a session-pooler connection with `connection_limit=1`; the test runner still requires explicit reset confirmation. Invoice finalization sets a 30-second interactive transaction timeout to accommodate the multi-write operation on this remote pooler. Never point its destructive preparation step at the application schema. Prior SQLite migrations are preserved in `prisma/sqlite-migrations-archive/` and are not part of the active migration history.

## Entity map

```text
User ──< ShopMembership >── Shop ──< Subscription >── SubscriptionPlan
  │                           ├──< Customer ──< Invoice ──< InvoiceItem
  │                           │                      └──< CustomerPayment
  │                           ├──< Product ──< InventoryMovement
  │                           ├──< Quotation ──< QuotationItem
  │                           ├──< Expense
  │                           ├── ShopSettings / InvoiceTemplate
  │                           └──< AuditLog
  ├──< SubscriptionPayment (submitted/verified against a subscription)
  └──< PasswordResetToken
```

## Tables and key fields (planned)

- **User:** id, normalized unique email, password hash, global role (`SUPER_ADMIN` or regular user), active/suspended state, timestamps.
- **Shop:** id, display/legal name, status, owner-independent identity, timestamps.
- **ShopMembership:** userId, shopId, role (`SHOP_OWNER`, `MANAGER`, `CASHIER`), permission overrides if needed, active state. Unique `(userId, shopId)`.
- **SubscriptionPlan:** name, monthly/yearly prices, trial/grace settings, limits/features, active state.
- **Subscription:** shopId, planId, start/end dates, status and renewal state. Preserve history rather than overwriting past terms.
- **SubscriptionPayment:** subscriptionId, submitted amount/currency/method/reference, status, reviewedBy, reviewedAt. Only approved payments count as received revenue.
- **Customer:** shopId, name, normalized email/phone where available, address, notes, archive state. Email is unique within a shop in the draft schema; cross-shop duplicates are allowed.
- **Product:** shopId, name, SKU, barcode, description, purchase cost, selling price, stock quantity and low-stock threshold in thousandths of the unit, unit/category, active state.
- **InventoryMovement:** shopId, productId, type, signed quantity delta in thousandths, reason, source type/id, actorId, createdAt. Source reference/idempotency prevents duplicate adjustment.
- **Invoice:** shopId, customerId (nullable for walk-in policy), immutable per-shop number, status, dates, currency, subtotal/discount/tax/total snapshots, notes, createdBy, finalizedAt, void metadata. Paid amount and balance are derived from posted payments and reversals rather than stored on the current draft model.
- **InvoiceItem:** invoiceId, optional productId, description/SKU snapshot, quantity in thousandths, unit price, discount, tax rate and line totals. Product price/name are snapshots, not live joins.
- **CustomerPayment:** shopId, invoiceId, amount, date, method, external/manual reference, notes, idempotency key, status/reversal linkage, recordedBy.
- **Quotation / QuotationItem:** shopId, customer, immutable number, expiry/status, item snapshots (quantity in thousandths) and totals; convertedInvoiceId unique/nullable to prevent duplicate conversion.
- **Expense:** shopId, category, description, amount, date, method/reference/notes, recordedBy, status/reversal metadata.
- **ShopSettings / InvoiceTemplate:** one-to-one settings with business contact/tax/numbering/default terms/template/color/footer; store validated logo object key, not arbitrary executable path.
- **AuditLog:** actor, shop/platform scope, action, entity type/id, timestamp, safe structured change summary, request correlation id. Avoid secrets and unnecessary customer PII.
- **PasswordResetToken:** userId, hashed token, expiry, usedAt; only a single-use token hash is persisted.

## Constraints and indexes

- Every shop-owned row has a non-null `shopId` directly or is reachable through a shop-owned parent. Include `shopId` in unique keys and common indexes.
- Unique `(shopId, invoiceNumber)`, `(shopId, quotationNumber)`, `(shopId, sku)` where SKU is present, and `(shopId, barcode)` where barcode is present.
- Index customer, product, invoice, payment, expense, and movement queries by `(shopId, relevantDate/status/id)`.
- Foreign keys use restrictive deletion for financial history. Archive business entities; do not cascade-delete finalized invoices or recorded payments.
- Use integer minor units (cents) or Prisma Decimal with explicit precision and currency rounding rules. Never use binary floating-point for persisted financial arithmetic.
- Keep balances derivable/reconcilable from posted invoice totals, successful payments, refunds, and reversals. If cached, update atomically and provide reconciliation.

## Transaction boundaries

- Finalize invoice: allocate number atomically, persist immutable item/tax/discount snapshots, and create exactly-once stock movement according to the chosen stock policy.
- Record payment: validate shop authorization and remaining balance, enforce idempotency, create payment and update/recompute allocation in one transaction.
- Convert quotation: lock/claim conversion and create invoice once, preserving quotation records.
- Void/refund/adjust stock: record compensating entries and actor/reason; do not erase historical rows.

## Initial financial calculation policy

The pure calculation module in `src/server/domain/invoices/calculate-invoice.ts` establishes a first consistent rule set:

- Persist money in integer USD cents. Represent quantity as thousandths of a unit (`quantityMilli`) so fractional units do not require floating point.
- Calculate gross line cents from unit cents × quantity and round to the nearest cent, with exact half cents rounded up.
- Apply line discount first, then allocate an invoice-wide discount proportionally across remaining line values. Allocate residual cents by largest fractional remainder, breaking ties by original line order.
- Calculate tax per line after both discounts, using each line's basis-point tax rate and half-up cent rounding. Sum the rounded line taxes.
- Reject negative/non-integer monetary inputs, invalid quantities/rates, and discounts larger than the eligible amount.

This policy still needs review against the intended local tax/accounting rules before production use. It does not yet handle tax-inclusive pricing, multiple currencies, credit notes, or payment allocation.

## Supabase connection

Get both connection strings from the Supabase Dashboard's **Connect** dialog. Use the transaction pooler URL for serverless app traffic and include Prisma's `pgbouncer=true` option; use the direct IPv6 URL or session pooler for `DIRECT_URL` and migrations. If the database password contains URL-reserved characters, percent-encode it. The backend uses Prisma/PostgreSQL directly; a Supabase anon key or browser-side database access is not needed. See the [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) and [Prisma integration guide](https://supabase.com/docs/guides/database/prisma).

## Migration and seed policy

The active schema uses PostgreSQL through Supabase. Application money remains in integer cents and quantity remains in thousandths of a unit; existing validation keeps the former SQLite 32-bit amount ceiling until a separate business-limit change is reviewed. Product units are immutable after the first inventory movement so historical quantities retain their meaning. Cross-record tenant consistency (for example, an invoice customer must belong to the same shop) must be enforced in domain transactions; simple foreign keys alone do not enforce that condition.

The initial invoice workflow finalizes at submission and deducts tracked product stock immediately in the same transaction. Custom lines do not affect stock. Invoice submissions carry a shop-scoped idempotency key, and finalized item records preserve the selected description, SKU, cost, and price. Manual restock movements add stock transactionally and are idempotent; supplier purchase orders and purchase-cost allocation are not modeled.

## Payment, void and refund policy

Phase 5 expenses are posted ledger records. Reversal changes their status to REVERSED with actor audit and required reason; records are retained. Reports use finalized invoices, posted signed customer-payment rows and posted expenses, and compute invoice balances from all posted payments linked to invoices issued in the selected period. Profit is not reported because COGS and refund accounting remain unresolved. Logo files use opaque keys in `ShopSettings` and are kept under a private upload directory; production deployments must configure durable private storage before accepting uploads.

- Invoices use the shop's currently supported currency, USD. A recorded customer payment means funds were received manually; this does not call or verify a payment gateway.
- Only FINALIZED invoices can receive payments. Partial payments are allowed. The sum of POSTED payments cannot exceed the invoice total; the outstanding balance is derived from posted payments.
- Partial refunds are manually recorded by a SHOP_OWNER or MANAGER as a negative POSTED `CustomerPayment` row with method `REFUND`, the original payment ID as its reference, and the reason in notes. Cumulative refunds cannot exceed the original positive payment. Net collected amount is the sum of signed POSTED records.
- Payment methods are cash, mobile money, bank transfer, or other. A reference and notes are optional. The server records the acting member, timestamp, and audit event. A shop-scoped idempotency key makes retries safe.
- Until granular payment permissions are designed, SHOP_OWNER, MANAGER and CASHIER may record a payment, following the existing invoice creation policy.
- A full payment reversal must retain the original row, require a SHOP_OWNER or MANAGER and a reason, mark it REVERSED with timestamp, and create an audit record naming the actor. Reversing an original payment also reverses linked partial-refund ledger entries. Reversed payments stop counting toward collected totals and restore invoice balance. Cashiers cannot reverse payments. These actions record money returned outside the app; they do not send money or verify a gateway refund.
- A finalized invoice can only be voided after every POSTED payment and refund ledger row has been reversed. Voiding must create compensating inventory movements for tracked items and retain invoice and payment history. The app implements this as an audited owner/manager action; returned stock automatically reactivates an archived product so the quantity remains manageable.
- No profit reporting is valid until cost-of-goods, discounts/tax treatment, and refunds are reconciled.

The current manual payment implementation posts payment and audit rows transactionally, checks invoice and per-payment refundable balances, and displays signed payment/refund history and derived balance. Full reversal retains the original record and reverses its linked refund records. Invoice drafts can be created, edited, and finalized; voiding requires all posted payment/refund records reversed and creates compensating stock movements. Invoice PDF download and quotation lifecycle/conversion are implemented. The browser print route remains available. Refunds are ledger records only, not payment execution.

Subscription entitlements are checked on server operations. `maxUsers` counts active shop memberships (including the owner); `maxProducts` counts active products; `maxInvoicesPerMonth` counts finalized and void invoices by `issuedAt` in UTC calendar months. A plan's configured `trialDays` sets the trial end and limits administrator overrides; `graceDays` extends access after `endsAt`. Future subscriptions do not grant access before `startsAt`. Shops without a subscription remain grandfathered until a plan is assigned. Shop staff administration only attaches an existing active user account; email invitations are not implemented.

Use checked-in Prisma migrations. The active PostgreSQL baseline was generated from the validated schema with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`. `npm run db:deploy` uses `DIRECT_URL` for migration connections; the application uses `DATABASE_URL`, configured to Supabase's transaction pooler for serverless deployments. Apply and verify this baseline only after the project URL is configured and the target Supabase database is confirmed empty. Never run destructive resets against production. The test runner refuses to proceed without a dedicated disposable test URL plus the explicit `TEST_DATABASE_RESET_CONFIRM` value; earlier SQLite migrations remain archived for reference, not for Supabase deployment.
