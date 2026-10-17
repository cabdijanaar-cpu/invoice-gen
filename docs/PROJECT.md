# Project handoff: Invoice Generator SaaS

**Last updated:** 2026-10-17
**Status:** The Supabase cutover and PostgreSQL baseline are applied to the configured app project. A separate disposable Supabase test project is configured, the schema was synchronized, and the full PostgreSQL integration suite passed (39 tests across 7 files); TypeScript typecheck passed. The test project uses its reachable session pooler for both Prisma URLs with `connection_limit=1`, and its test hooks truncate only the dedicated test database. SQLite migrations remain archived. Super Admin audit-log review, auth event records, and exported cleanup functions are implemented and TypeScript-checked. Authenticated browser/responsive checks, production IP-level limiting and cleanup scheduling, approved audit retention, and production deployment work remain open.

**Phase 7 continuation (2026-10-17):** Integration assertions were added for authentication audit events and for excluding credentials/session/reset tokens from audit data. A bearer-protected GET/POST `/api/internal/maintenance/cleanup` endpoint runs expired-session, reset-token, and rate-limit cleanup, with route tests for authorization and results. The two focused route tests, typecheck, changed-file ESLint, and production build passed. The full test runner could not reach its configured Supabase test database, so database-backed assertions are unverified. Authenticated/responsive browser review remains unavailable; production IP limiting and scheduler configuration require a selected host/edge, and audit retention requires an approved policy.

**Vercel deployment preparation (2026-10-17):** Added a daily 03:00 UTC Vercel Cron schedule and authenticated GET handling for cleanup. Shop logos now use private Supabase Storage with server-only service-role credentials; local file keys remain supported in development. Focused storage/cron tests (5), typecheck, changed-file ESLint, and production build passed. The Storage bucket and Vercel secrets are not configured, and deployment was not started because this workspace has no Git repository, Vercel CLI, or Vercel token.
**Product language/currency:** English / USD.

**Phase 5 update (2026-10-16):** Expenses, reports/CSV, branding/settings, and private logo handling are implemented and locally verified. A new integration test covers tenant-scoped expense posting/reversal, balances that include payments recorded outside the invoice date range, and balance CSV export. Authenticated browser smoke and a live upload remain pending. `npm run db:generate` reports `EPERM` replacing the Windows query-engine DLL while another process holds it; the existing generated Prisma Client passed typecheck, integration tests, and build. See `ROADMAP.md` for check details.

This is the source of truth for current project state. On every development session, inspect the code and this handoff before continuing. Update the status and roadmap as work is completed; only mark work completed when it exists in the repository, and only mark it tested when the stated check was actually run.

## Product summary

Build a subscription-enabled SaaS for independent shops. Each shop manages its own customers, products, inventory, quotations, invoices, payments, expenses, staff, branding, and reports. A user can belong to multiple shops. A global Super Admin manages shops, plans, subscriptions, and manually submitted subscription payments. USD is the initial currency and English is the initial UI language.

## Requirements

### Tenant and roles

- Strict shop-level isolation for every business record and every server operation. A request-supplied shop or record ID never grants access by itself.
- `SUPER_ADMIN` administers platform shops, users, plans, subscriptions, verified payments, and platform reports.
- `SHOP_OWNER` administers assigned shops, shop settings, staff, and business functions.
- `MANAGER` receives operational access according to shop membership permissions.
- `CASHIER` creates invoices and records customer payments within assigned permissions; no platform administration or sensitive settings.
- Enforce role, membership, account status, and subscription gates on the server.

### Business functions

- Invoices: draft/finalize/edit draft/void with audit trail, immutable per-shop number, customer and item snapshots, discounts, tax, due date, partial payments, balance, PDF, print, and WhatsApp-ready sharing.
- Customers: contact details, archive, invoice/payment history, total invoiced, collected, and balance.
- Products/inventory: SKU/barcode, cost and selling price, stock, low-stock threshold, stock movements and authorized adjustments. Finalized sales must not double-deduct stock.
- Quotations: expiry and lifecycle states; accepted quotation conversion must preserve history and avoid duplicate stock movement.
- Payments: cash, EVC Plus, Zaad, transfer, or configured manual methods; partial allocation, receipts, reversals/refunds with authorization/audit, duplicate and concurrency protection.
- Expenses and reports: sales versus collected cash, invoice balances, payments, inventory, low stock, expenses, estimated profit and CSV export. Define COGS, refunds, and profit rules before reporting them.
- Branding: shop details/logo, invoice numbering and terms, taxes/discount defaults, template preview. Validate uploads and keep files out of executable/public paths by default.
- Subscriptions: monthly/yearly plans, configurable limits, trial/grace settings, manual payment submission/review, expiry and suspension. Unverified payments are never revenue.
- Dashboard statistics are computed from persisted records and scoped to the authorized shop.

### Quality and security requirements

- Responsive desktop/tablet/mobile UI, accessible forms, loading/error/empty/success states.
- Validate every mutation on the server; use decimal-safe money arithmetic and database transactions for financial and stock operations.
- Secure password hashing, protected sessions/cookies, rate limits on sensitive auth actions, account activation/suspension, reset tokens, environment validation, safe errors, audit events, backups, and recovery procedure.
- Keep secrets and private customer data out of client bundles and logs. Never claim hardware barcode/thermal integrations without testing on actual supported equipment.
- No online payment gateway in the initial release; payments are recorded manually. Supabase PostgreSQL is the selected database provider.

## Technology and architecture

Target: Next.js App Router + TypeScript + Tailwind, with server actions/route handlers as application boundaries, Prisma as the persistence layer, and Supabase PostgreSQL as the database. The active schema validates and the PostgreSQL client generates locally. The existing SQLite migration history is archived. A Supabase connection and PostgreSQL integration tests remain pending. Production deployment has not been verified.

Use a layered structure: route components render UI; server actions/handlers validate inputs and call domain services; domain services enforce authorization and business rules; repositories/Prisma query with explicit tenant scope. Keep secrets and Prisma server-only. Financial transactions should atomically create/update invoice, payment, and inventory records. Keep audit records for consequential changes.

Supabase PostgreSQL is the selected persistence target. Use the transaction pooler for serverless app connections and `DIRECT_URL` for Prisma migrations. Configure a separate disposable Supabase project for integration tests. Do not use the production database for test resets.

## Planned folder structure

The current source tree is under `src/`. Existing route groups and server modules are:

```text
src/
  app/
    (auth)/                 login/register actions and pages
    dashboard/              authenticated shop list and shop-scoped routes
      shops/[shopId]/        customers, products, invoices
  lib/                      Prisma client singleton
  server/
    auth/                    password, session, validation, rate limits
    domain/                  money and invoice calculations
    shops/                   tenant-scoped customer/product/invoice services
  test/                      Vitest setup
prisma/
  schema.prisma
  migrations/
docs/
  PROJECT.md, DATABASE.md, ROADMAP.md, SECURITY-DEPLOYMENT.md
```

New code should follow this actual layout; the expanded target below remains a roadmap for modules not built yet.

```text
app/                      Next.js routes, layouts, route handlers
  (auth)/                  login, registration, password recovery
  (workspace)/             shop dashboard and business modules
  admin/                   platform administration
components/                shared UI and feature components
lib/                       auth, validation, permissions, tenant context
server/                    domain services and database access
prisma/                    schema, migrations, development seed
docs/                      handoff, data model, roadmap, operations
public/                    static non-sensitive assets
```

This is a target, not a claim that these directories all exist yet. Prefer feature-local modules once implementation grows; keep server-only code separate from client components.

## Database overview

Planned entities: User, Shop, ShopMembership, SubscriptionPlan, Subscription, SubscriptionPayment, Customer, Product, InventoryMovement, Invoice, InvoiceItem, CustomerPayment, Quotation, QuotationItem, Expense, shop settings/templates, AuditLog, and PasswordResetToken. See [`DATABASE.md`](DATABASE.md) for constraints, relationships, and money/data integrity rules. Role permissions may be represented by enums plus membership permission flags initially; avoid a generic permission framework until actual needs justify it.

## Route map (planned)

- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/dashboard` and `/dashboard/{shops,customers,products,inventory,invoices,quotations,payments,expenses,reports,users,settings,subscription}`
- `/admin` and `/admin/{shops,users,plans,subscriptions,payments,settings}`

Routes are proposals and should be reconciled with implementation. Route protection is not a substitute for authorization on every operation.

## Completed

- Phase 7 start (2026-10-17): added a read-only `/admin/audit` page with action filtering and 50-event pagination, guarded by a server-side Super Admin check. Targeted ESLint, `npm.cmd run typecheck`, and `npm.cmd run build` passed. No browser was available for authenticated UI verification.
- Phase 7 continuation (2026-10-17): successful login, registration, logout, and password reset now create audit events without credential/token data. Added maintenance functions for expired sessions and reset tokens; the existing rate-limit cleanup function covers expired buckets. Targeted ESLint, typecheck, and production build passed after these changes. The integration suite was not run. The full PostgreSQL integration suite subsequently passed (39 tests across 7 files; see `ROADMAP.md`). A scheduler and production IP-level limiter are not configured; browser inventory remained unavailable. See `ROADMAP.md` and `SECURITY-DEPLOYMENT.md` for remaining gates.

- PostgreSQL cutover verification (2026-10-17): all 39 tests across 7 files passed against the separate disposable Supabase test project, and `npm run typecheck` passed. The test setup now truncates test tables in one `CASCADE` operation and allows 120 seconds for remote database tests. Supabase's direct endpoint did not resolve from this environment, so `.env.test` uses the reachable session pooler for both Prisma URLs with `connection_limit=1`. Prisma's generate step still logs a Windows DLL rename `EPERM`; the existing client ran the complete passing suite. Authenticated browser smoke and production readiness remain pending; see `ROADMAP.md`.

- Phase 6 locally verified: platform administrators can manage plans, assign/update subscriptions, review submitted subscription payments, suspend/reactivate shops, and suspend/reactivate user accounts while preserving one active Super Admin and preventing self-suspension. Shop staff management supports registered accounts, manager/cashier roles, per-membership permissions, deactivation/reactivation, owner protection, audit events, and active-seat enforcement. Plan `maxUsers`, `maxProducts`, and `maxInvoicesPerMonth` limits are enforced; trial end dates use the configured plan duration. Automated coverage verifies platform authorization/status changes, trial defaults, staff permission boundaries and seat limits, and product/invoice limits. Typecheck, lint (3 pre-existing `<img>` warnings), 39 tests, and production build passed. Authenticated browser smoke remains pending; Prisma Client regeneration still reports Windows DLL `EPERM` even though the suite completes.

- Phase 6 continuation: added a Super Admin action to suspend/reactivate shops. The server rechecks Super Admin access, validates the status, changes it and writes a scoped `SHOP_STATUS_CHANGED` audit event in one transaction. Active shop memberships are resolved only for active shops, so suspended shops lose access immediately. `npm run typecheck` passed; authenticated browser smoke is pending.

- Phase 5 implementation: tenant-scoped posted expense ledger with audited reversals, date-range operations reports and CSV export (sales, signed collections/refunds, balances, expenses, inventory movements and low stock), invoice defaults and shop branding/template settings, and private PNG/JPEG/WebP logo upload/read routes with file-signature and image decode validation. No profit metric is reported. Local verification passed; browser checks remain outstanding. See `ROADMAP.md`.

- Inspected the workspace: initially empty directory, no application files or project `AGENTS.md` found.
- Recorded product scope, architecture direction, requirements, target folder layout, data model outline, security boundaries, and route proposal.
- Added Next.js/TypeScript/Tailwind app shell, root setup handoff, environment variable example, and ignore rules.
- Added a first-pass SQLite Prisma data model covering identities/sessions, memberships, shops, subscriptions, customers, inventory, invoices, payments, quotations, expenses, and audit records.
- Added a pure invoice calculation module using integer cents, thousandth-unit quantities, proportional invoice discount allocation, per-line tax rounding, and unit tests; calculation tests pass.
- Added registration/login actions, scrypt password hashing, database-backed opaque sessions, session cookies, shop membership checks, and a protected workspace shop list. Registration, login, session rotation, and logout are covered by an integration test.
- Added forgot-password and reset-password pages/actions. Reset tokens are 256-bit random values, SHA-256 hashed at rest, expire after 30 minutes, are single-use, and reset atomically updates the password while invalidating sessions. Responses avoid revealing whether an account exists.
- Added a configurable server-side HTTP email delivery adapter (`EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_TOKEN`, `EMAIL_FROM`) and tests for HTTPS production requirements and provider errors. No real provider is configured or claimed as tested.
- New login sessions revoke the current browser's previous token. Tests cover registration/login/logout, rotation, suspended-account rejection, manager permission enforcement, Super Admin checks, password reset/replay/session invalidation, and email enumeration behavior.
- Added database-backed login/registration attempt buckets keyed by HMAC of action + normalized email. Fixed windows permit five attempts per minute per email/action; expired bucket cleanup is an exported maintenance function but has no scheduler yet.
- Added a tenant-scoped customer list/create flow with server-side membership checks, owner/permission authorization, field validation, per-shop email uniqueness, and an explicit empty state.
- Added a tenant-scoped product list/create flow and stock adjustments. Opening stock and adjustment movements are transactional; signed adjustments use unique request keys, cannot reduce stock below zero, and require a reason plus permission.
- Added tenant-scoped customer search across name/email/phone and product search across name/SKU/barcode, each paged at 20 rows with result counts. Product cards show the five latest movements. Query limits and membership checks are enforced server-side.
- Added product editing and archive controls. Product updates require the shop product-management permission and write an audit event. Archiving requires zero stock, uses a conditional update to guard concurrent stock changes, writes an audit event, and preserves invoice/movement history.
- Added customer edit/archive. Both operations require customer-management permission, use shop-scoped writes and create audit events; archived customer records retain invoice/payment links. Archived emails remain reserved by the current shop/email unique constraint.
- Added customer and product edit/archive integration coverage. Verification: typecheck passed, ESLint passed on changed TS/TSX files, `npm test` passed (5 files, 24 tests), and `npm run build` passed with both shop routes included. A full-repository lint run did not produce a result in this environment.
- Completed Phase 3 customer/product/inventory workflows: customer duplicate review with explicit confirmation, per-customer finalized invoice and posted payment history/totals, paginated full product movement history, exact thousandth-unit parsing for opening stock/thresholds/adjustments, and a separately recorded `RESTOCK` movement.
- Product units can no longer be changed once inventory movements exist, so old quantity records keep the same unit meaning. Dashboard reconciliation integration coverage now checks sales, posted collections, expenses, invoice count, low stock, and recent invoices across two shops.
- Final Phase 3 verification: TypeScript passed; ESLint passed for changed TS/TSX files; `npm test` passed (6 files, 28 tests); `npm run build` passed and includes customer history and product movement routes. Full-repository lint and authenticated browser smoke testing were not completed.
- Reconfirmed Phase 3 before starting the next phase: TypeScript, changed-file ESLint, all 28 tests, and production build passed. After the Phase 4 payment test was added, the complete suite passed with 29 tests.
- Started Phase 4 with manual invoice payments. Invoice detail now lists posted payments, shows paid and outstanding totals, and accepts partial payment by cash, mobile money, bank transfer, or other. The server validates membership, invoice tenant/status, positive cents, remaining balance and idempotency; payment plus audit event are written transactionally. Added integration coverage for partial payment, retry, overpayment rejection, cross-shop rejection, detail history, and single audit record.
- Documented payment, refund and void policy in `DATABASE.md`: only finalized invoices receive manually recorded funds, overpayment is rejected, reversals are retained and audited, and voiding restores stock. This records the policy checkpoint before its server actions were implemented below.
- Implemented full payment reversal for SHOP_OWNER/MANAGER with a required reason and retained reversal timestamp/status; audited the acting member; restored the invoice balance by deriving it from POSTED records; and exposed reversal history on invoice/customer pages. Cashiers cannot reverse payments. This is ledger-only recording; no payment gateway is used.
- Added editable invoice drafts, transactional draft finalization and stock deduction, authorized invoice void with required reason and compensating `RETURN` movements, and retention of voided invoice/customer history. Void requires all posted payment/refund rows to be reversed.
- Added a tenant-checked invoice PDF route generated from invoice snapshots, separate printable payment/refund receipts, and a WhatsApp-ready invoice share link. The PDF renderer paginates long invoices.
- Added quotations with item/tax/discount snapshots, due dates, DRAFT/SENT/ACCEPTED/CANCELLED/EXPIRED/CONVERTED transitions, audit history, expiry enforcement, and an atomic accepted-quote conversion that creates one finalized invoice and deducts stock once.
- Added partial refunds as negative POSTED ledger entries linked to the original payment; SHOP_OWNER/MANAGER only, reason required, and cumulative refunds capped at the original collected amount. Full payment reversal also reverses associated refund ledger rows. No external money transfer or gateway refund occurs.
- Phase 4 final checks: typecheck passed, changed-file ESLint passed without warnings, all 35 tests passed (7 files), and production build passed. Tests cover draft edit/finalize exactly once, PDF content and authorization, payment/refund limits and roles, void stock restoration, and quotation expiry/conversion exactly once. Authenticated browser smoke test remains outstanding.
- Reversal milestone verification: TypeScript passed, ESLint passed for changed TS/TSX files, all 29 tests passed (6 files), and the production build passed. Authenticated UI smoke test remains outstanding.
- Added an initial invoice creation/finalization flow with tenant-scoped customer/product lookup, transactionally allocated invoice numbers, tax/discount calculation, stock deduction, item snapshots, audit event, idempotent submission, invoice list/detail, and browser print view.
- Added `/dashboard/shops/[shopId]` with membership-guarded database metrics for finalized sales, posted payments, posted expenses, invoice count, low stock and recent finalized invoices. Profit is intentionally omitted until cost and refund rules are implemented. The dashboard compiled in production build; no authenticated browser smoke test or aggregate reconciliation test has run.
- Added isolated SQLite test setup and tenant-isolation/session/rate-limit integration tests, plus `db:validate` and test database scripts. All 22 tests across five files pass.
- The test suite uses the ignored `prisma/phase2-test.db`, separate from development and migration-verification databases.

- Added and generated initial migration SQL at `prisma/migrations/20261016110000_init/`.
- Installed dependencies and generated `package-lock.json` / Prisma Client.
- Verified Prisma schema validation, TypeScript compilation, ESLint, production build, and 22 tests (5 files) covering financial arithmetic, password hashing/reset/email delivery, session rotation, rate limits, role authorization, and customer/invoice tenant isolation.
- Fixed TypeScript errors in scrypt callback typing and product action state, and lint errors in invoice/stock idempotency key handling and homepage navigation.
- Production build passed; the local app started and `/`, `/login`, `/register`, `/forgot-password`, and `/reset-password` each returned HTTP 200.
- Generated Next.js `AGENTS.md` during the dev-server check; read the current Next documentation under `node_modules/next/dist/docs/` before future framework-specific implementation.

## Pending

- Confirm schema/migration parity on a fresh database and repeat the migration workflow in the normal installed Node environment. In this sandbox, pre-creating an empty ignored SQLite file and setting `PRISMA_SCHEMA_ENGINE_BINARY` to the packaged Windows `.exe` allowed `migrate deploy` to apply successfully.
- Configure a trusted email provider endpoint and verify reset-mail delivery end to end; until then password reset is implemented but cannot deliver mail in this environment.
- Review role/permission checks for remaining server operations; registration/login/logout are covered by integration tests.
- Add a safe development-only seed strategy.
- Review the invoice rounding/tax policy against the shop's jurisdiction before production accounting use.
- Add IP/network-level authentication rate limiting, session cleanup, scheduled rate-limit cleanup, and reviewed Super Admin provisioning.
- Add a supplier/purchase-order workflow with cost allocation if procurement tracking is required; current restock records capture quantity and reason but do not model suppliers or purchase orders.
- Extend transaction/idempotency/audit behavior to payments, reversals, and future workflows; add backups/recovery operations.
- Expand financial, responsive, and authenticated browser verification; local integration coverage does not replace a production-like security review.
- Select and validate a production hosting/database configuration; deployment is not done.

## Known issues and constraints

- Phase 3 customer/product/inventory functionality is implemented and locally verified through integration tests and a production build. Broader financial, responsive, and authenticated browser verification remains incomplete.
- Customer and product lists use search and 20-row pagination. Customer edit/archive, likely-duplicate review, invoice/payment details, totals, and balances are implemented with tenant checks. Archived customer email remains reserved by the current unique constraint. Product edit/archive and full paginated movement history are implemented; product units become immutable after a stock movement. Opening stock, thresholds, adjustments, and restocks accept up to three decimals. Restocks record quantity and reason; supplier purchasing and cost allocation are not modeled. Archived product SKU/barcode values remain reserved by the current database unique constraints.
- Invoice drafts can be edited and finalized; finalized invoices can be voided after reversing all posted payment/refund rows, with stock returned through compensating movements. Partial refunds are signed ledger entries; PDF download, browser print, WhatsApp-ready sharing, payment receipts, and quotations are implemented. Browser interaction remains unverified; invoice filters/search and actual payment/refund processing are out of scope for this manual-payment release.
- The initial Prisma migration applied on a fresh SQLite database. The schema and business workflows still need extended review and regression coverage before production use.
- The invoice calculation unit tests pass. The calculation policy is an initial documented default, not a tax compliance determination.
- Registration/login depend on the generated Prisma client and applied development migration; registration/login/logout are covered by a server-action integration test. Email-keyed attempt limits exist but IP/network limits and Super Admin provisioning are absent. Password recovery code is implemented, but email delivery requires a configured trusted HTTP email endpoint.
- `migrate dev` returned an empty schema-engine error on this Windows setup. `migrate deploy` succeeded after creating an empty ignored SQLite file and explicitly pointing Prisma at its packaged Windows `.exe`; repeat with the normal local Node installation.
- Subscription access and plan limits are enforced for subscribed shops. Shops with no assigned subscription remain grandfathered until a platform administrator assigns a plan. Staff can be added only when they already have an active account; email invitation and delivery are not implemented.
- Node.js v26.12.0 and npm v11.20.0 are installed under `C:\Program Files\nodejs`, but the shell's execution policy blocks `npm.ps1`. Invoke `npm.cmd` explicitly from PowerShell or adjust PATH/execution policy outside this project. `git` remains unavailable on PATH.
- The actual deployment target is unknown. Persistence compatibility must be checked before choosing SQLite for production.
- Remaining business-policy decisions include cost-of-goods calculation, permission granularity, and jurisdiction-specific tax review. Stock deduction timing and invoice void/refund treatment are documented in `DATABASE.md`.

## Immediate next steps

1. Run authenticated browser smoke and verify private logo upload, report filters/CSV, shop staff permissions, platform account/shop controls, and subscription limits.
2. Configure a trusted email endpoint and verify reset-mail delivery as a deployment task.
3. Select durable production infrastructure, validate backups/restores, and finish Phase 7 security, responsive, and accessibility review.
