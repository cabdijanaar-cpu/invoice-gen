# Invoice Generator SaaS

Multi-store invoicing and operations platform. The product requirements and current delivery state live in [`docs/PROJECT.md`](docs/PROJECT.md); use that document as the ongoing handoff before making changes.

## Current state

Phases 1-6 are implemented and locally verified. The active Prisma schema targets PostgreSQL, and the Supabase baseline migration has been applied. The full PostgreSQL test suite passed all 57 tests across 11 files, including the Phase 7 audit, settings authorization, CSV formula-injection, and default-discount coverage. TypeScript typecheck, lint, schema validation, and production build passed at prior checkpoints. Invoice and quotation previews have also been reviewed in an authenticated local browser session; full responsive workflow review, email-provider setup, and production infrastructure remain pending. Earlier SQLite migrations are preserved in `prisma/sqlite-migrations-archive/`. Configure `.env` with Supabase `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` before starting the app. Integration tests use `.env.test` and refuse to reset a database without explicit confirmation. This is not a production deployment claim.

## Intended stack

- Next.js App Router, React, TypeScript
- Tailwind CSS
- Prisma ORM and Supabase-managed PostgreSQL
- Server-side authentication and authorization; tenant-scoped database access
- USD and English UI

## Prerequisites

Install Node.js 20.9 or newer (LTS recommended) with npm, then run:

```sh
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }   # Add the Supabase connection URLs and a random AUTH_SECRET
npm run db:generate
npm run db:validate
npm run db:deploy
npm run dev
```

The Prisma schema is `prisma/schema.prisma`; the fresh Supabase/PostgreSQL baseline is in `prisma/migrations/20261016180000_supabase_postgresql_baseline/`. Existing SQLite migrations are archived separately and must not be applied to Supabase. Configure `.env.test` to point to a dedicated disposable Supabase project before running `npm test`; the test runner resets that database only after an explicit confirmation value is set. Never point tests at the app's production database. Password reset delivery requires `EMAIL_DELIVERY_URL`, `EMAIL_DELIVERY_TOKEN`, and `EMAIL_FROM` set to a trusted endpoint documented in `docs/SECURITY-DEPLOYMENT.md`; no provider is preconfigured. Never commit `.env`, `.env.test`, or production credentials. The Node.js minimum follows the [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation).

## Documentation

- [Project handoff and requirements](docs/PROJECT.md)
- [Database design](docs/DATABASE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Security and deployment notes](docs/SECURITY-DEPLOYMENT.md)

## Vercel deployment

This Next.js app is prepared for Vercel with the scheduled cleanup route in `vercel.json`. Configure `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_URL`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the email delivery settings in Vercel's environment variables. Create a **private** Supabase Storage bucket named `shop-logos` with a 1 MB file-size limit and PNG/JPEG/WebP content types before accepting logo uploads. Keep service-role and email tokens server-side; never prefix them with `NEXT_PUBLIC_`. See `docs/SECURITY-DEPLOYMENT.md` for remaining production checks.

Update these documents when implementation scope or status changes. Record evidence for completed and tested work.
