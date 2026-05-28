# Flowstate

Flowstate is a gym management platform for Muay Thai gyms and Hyrox/HIIT-style class studios. The product goal is to replace older tools like Zen Planner with a calmer, more reliable operating system for scheduling, staff workflows, billing, attendance, and member self-service.

## Current status

This monorepo includes working admin, member, and billing slices for the MVP:

- owner signup, login, and session handling
- workspace onboarding for a single-location gym
- protected admin dashboard and coach roster surface
- staff invite, program, room, schedule template, booking, roster, and attendance workflows
- member and guardian records
- public trial booking
- form upload, required-form assignment, signing, and signed-document tracking
- membership plans, member memberships, access products, punch cards, drop-ins, billing records, Stripe settings, Stripe webhooks, and failed-payment workflows
- member portal login, schedule browsing, bookings, membership/billing views, checkout support, and forms/signing

Still upcoming or intentionally thin:

- `apps/api` currently exposes a health endpoint only
- messaging, broadcasts, and automated email reminders
- events and private lessons
- progress tracking
- migration tooling
- deeper reporting

## Product guardrails

- one location only in MVP
- owner, coach, and customer roles only
- web only for MVP
- modular monolith architecture
- Postgres as the application database
- Stripe Connect and billing integration are present for the current billing slices
- email only at launch
- no multi-location assumptions in code

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Prisma
- PostgreSQL
- Vitest
- pnpm workspaces
- Turborepo

## Repo structure

- `apps/admin-web` - owner/coach app with auth, onboarding, dashboard, staff invites, programs, rooms, schedule templates, bookings, rosters, attendance, members, forms, memberships, access products, billing, and Stripe settings
- `apps/member-web` - member-facing app with login, schedule, bookings, membership, billing, checkout, public trial booking, and forms/signing
- `apps/api` - API app; currently includes `GET /api/v1/health`
- `packages/auth` - shared auth and session helpers
- `packages/db` - Prisma schema, migrations, and Prisma client export
- `packages/ui` - shared UI components
- `packages/types` - shared TypeScript types
- `packages/config` - shared config package
- `docs/` - product and engineering reference docs

## Local development

### Prerequisites

- `pnpm`
- Docker Desktop or another way to run PostgreSQL locally

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create the local env file

```bash
cp .env.example .env
```

The default local database URL is:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowstate_dev?schema=public"
```

### 3. Start Postgres

```bash
pnpm db:up
```

### 4. Run Prisma migrations

```bash
pnpm db:migrate
```

Optional Prisma helpers:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:studio
```

### 5. Start the apps

```bash
pnpm dev
```

Default local URLs:

- admin web: [http://localhost:3000](http://localhost:3000)
- member web: [http://localhost:3001](http://localhost:3001)
- API app: [http://localhost:3002](http://localhost:3002)
- API health check: [http://localhost:3002/api/v1/health](http://localhost:3002/api/v1/health)

For the current end-to-end flow, start at the admin app and create an owner account at `/signup`.

## Workspace commands

Root scripts:

- `pnpm dev` - run all app dev servers through Turbo
- `pnpm build` - build all workspaces
- `pnpm lint` - run ESLint across the monorepo
- `pnpm check-types` - run TypeScript checks across the monorepo
- `pnpm test` - run workspace tests
- `pnpm db:up` - start local Postgres via Docker Compose
- `pnpm db:down` - stop Docker Compose services
- `pnpm db:migrate` - run Prisma development migrations
- `pnpm db:migrate:deploy` - apply Prisma migrations without creating new ones
- `pnpm db:studio` - open Prisma Studio

## Current implemented slices

The current codebase is strongest in the admin and member self-service foundations:

- auth and session support for owner login/signup
- onboarding that creates the workspace, primary location, owner role assignment, and workspace settings in one transaction
- owner/coach dashboard shells and protected routing
- staff invite records with resend/revoke flows
- room CRUD with active/inactive and archive handling
- program CRUD with archive handling and progress-tracking flags
- recurring class templates, admin booking creation, rosters, attendance, and waitlists
- member/guardian management and member portal access setup
- public trial booking and member self-service booking
- forms, versioned PDFs, required-form assignment, signature requests, and signed documents
- membership plans, member memberships, punch-card/drop-in products, Stripe Connect settings, billing state, billing records, and failed-payment handling

Upcoming slices in the docs focus on messaging, events/private lessons, progress tracking, migration tooling, deeper reporting, and additional billing polish.

## Important docs

These docs are the best source of truth for product and architecture decisions:

- `docs/product_decisions_ledger.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/feature_decision_sheet.md`

## Notes

- The repo package name is `flowstate-monorepo`.
- `packages/db/prisma/schema.prisma` is the source of truth for the current database structure.
- The admin and member apps currently depend on a working database; the API app is still intentionally thin.
