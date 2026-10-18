# Security and deployment notes

**Status:** initial authentication and tenant-authorization controls are implemented and covered by tests, including the PostgreSQL integration suite (44 tests across 9 files). This is not a production security review or deployment configuration.

## Authorization baseline

Resolve the authenticated user on the server. For every shop request, verify an active membership and permission for the requested operation, then scope every database query by the authorized shop. Ignore client-provided role claims and never fetch by record ID before proving it belongs to the authorized shop. Super Admin access is a separate explicit capability and should be audited.

Use server-only modules for secrets, Prisma, password verification, and authorization. Validate all actions with shared schemas. Return safe errors without stack traces, secrets, or cross-tenant existence leaks. Protect session cookies with HttpOnly, Secure in production, SameSite, and appropriate expiry/rotation. Hash passwords with a modern password hashing algorithm; hash reset tokens at rest, expire and consume them once. Rate limit login/reset flows.

The current auth foundation uses Node's `scrypt` (N=32768, r=8, p=1), SHA-256 hashes of random session tokens, and HttpOnly/SameSite=Lax cookies with a 30-day expiry. New sessions revoke the current browser token. Login, registration, and reset requests use a database-backed fixed one-minute bucket allowing five attempts per action and normalized email; the database stores an HMAC of the identifier using `AUTH_SECRET`, not the email itself. Reset links use 256-bit random tokens, are SHA-256 hashed at rest, expire in 30 minutes, can be consumed once, and invalidate the user's existing sessions. Reset email uses a configured HTTP endpoint (`EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_TOKEN`, `EMAIL_FROM`) that accepts `{ from, to, subject, text }`; no real provider is configured or verified here. Successful login, registration, logout, and password reset events are recorded without credentials or reset tokens. `GET` and `POST /api/internal/maintenance/cleanup` provide bearer-secret protected cleanup for expired sessions, reset tokens, and rate-limit buckets. `vercel.json` defines a daily 03:00 UTC Cron call, but it will not run until deployed with `CRON_SECRET` configured. IP/network-level limiting, audit retention, Super Admin provisioning, and production security review remain pending; do not expose the app as a production service yet.

The app sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive `Permissions-Policy` on all routes, and disables Next.js's `X-Powered-By` header. These were verified over HTTP against the local production build. HSTS and CSP are intentionally not set here: enable HTTPS policy at the selected deployment edge, and define/test CSP with the actual host and application behavior before enforcing it.

Financial operations need database transactions and idempotency. Keep immutable snapshots and compensating audit entries for finalized invoices, payments, reversals, and inventory adjustments. Do not count pending subscription payments as revenue.

Platform account and shop status mutations recheck Super Admin authorization in the server service and write audit events. Administrators cannot suspend their own account. Shop membership management is tenant-scoped, protects the owner membership, rechecks staff-management permission, and enforces active seat limits in the transaction that adds or reactivates a member.

Shop changes to products, customers, invoice/quotation lifecycle, payments/refunds, expenses, staff, settings, platform plans, subscriptions, and subscription payment reviews have transactional audit records. Manual stock adjustments and restocks now create both a movement record and audit event in the same transaction; idempotent retries do not add duplicate audit records. Super Admins can review the latest platform and shop events at `/admin/audit`, filter by action, and page through results. Audit records currently have no automated retention/deletion policy; establish retention after legal and operational requirements are selected.

## Data protection and operations

- Keep `.env` out of version control. Validate required variables at server startup; use separate secrets per environment.
- Restrict uploaded logo MIME/type/size, inspect content rather than trusting filename, generate opaque names, and store outside executable paths. Do not expose private files through guessable URLs.

Logo handling checks declared MIME against PNG/JPEG/WebP signatures, decodes the image with a pixel limit, stores opaque shop-scoped object keys in a private Supabase Storage bucket, authorizes uploads for settings managers, and serves logos only to active shop members. The server uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the service role key must remain server-only. Create a private bucket named `shop-logos` with a 1 MB file-size limit and allow only PNG/JPEG/WebP before enabling uploads. Legacy local logo files remain readable in local development but are not durable on Vercel. CSV exports are tenant authorized and escape formula-leading strings.
- Avoid logging credentials, session tokens, payment references beyond operational need, or unnecessary personal data.
- Define encrypted backups, retention, access controls, restore testing, and recovery objectives before accepting production data.
- Apply migrations through a reviewed release process. Back up before destructive or data-transforming changes.

## Database and hosting

Supabase PostgreSQL is the selected database. The configured app project is connected; `DATABASE_URL` uses the transaction pooler with Prisma's `pgbouncer=true` option, while `DIRECT_URL` is used for Prisma schema changes. The baseline migration is applied. The integration suite passed against a separate disposable Supabase project configured in `.env.test`; the test runner requires explicit reset confirmation and must never target the application schema. Production host, backup/restore, and production deployment remain unselected/unverified.

## Deployment checklist (pending)

- Select host and persistent database; validate backups and restore.
- Set production `DATABASE_URL`, high-entropy `AUTH_SECRET`, and canonical `APP_URL` in secret storage.
- Configure `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_TOKEN`, and `EMAIL_FROM` for a trusted HTTPS email endpoint, then verify reset delivery and expiry/replay behavior in a production-like environment.
- Apply reviewed migrations; create the first Super Admin through a secure one-time provisioning flow, not a seeded password.
- Configure HTTPS, trusted origins, rate limiting, request size limits, upload storage, monitoring, and retention.
- Set a unique `CRON_SECRET` in Vercel project secret storage before deployment. `vercel.json` schedules `GET /api/internal/maintenance/cleanup` daily at 03:00 UTC; Vercel sends `Authorization: Bearer <CRON_SECRET>`. The endpoint also accepts POST for manual checks. Keep the secret out of source control and scheduler logs.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel project secret storage, and create a private `shop-logos` Storage bucket in the same Supabase project. Never add the service role key to a `NEXT_PUBLIC_` variable.
- Configure IP/network-level auth rate limiting at the selected trusted edge. Do not trust client-supplied forwarding headers unless the hosting proxy overwrites them and direct origin access is blocked.
- Approve an audit-log retention period before adding automated deletion; the cleanup endpoint intentionally does not delete audit history.
- Verify tenant boundaries, subscription gates, financial transactions, and account recovery in a production-like environment.
- Run lint, type check, tests, and production build; document exact outcomes and roll-back procedure.
