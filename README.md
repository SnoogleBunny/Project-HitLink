# HitLink

HitLink is a gym management platform for Muay Thai gyms and Hyrox/HIIT-style class studios. The product goal is to replace older tools like Zen Planner with a calmer, more reliable operating system for scheduling, staff workflows, billing, attendance, and member self-service.

## Current status

This monorepo already includes the foundation for the first working admin slices:

- owner signup, login, and session handling
- workspace onboarding for a single-location gym
- protected admin dashboard
- coach invite scaffolding
- program management
- room management
- Prisma/Postgres schema and migrations for the current auth + workspace domain

Still intentionally early:

- `apps/member-web` is mostly a placeholder
- `apps/api` currently exposes a health endpoint only
- schedule building, member records, billing, messaging, and the broader MVP remain upcoming slices

## Product guardrails

- one location only in MVP
- owner, coach, and customer roles only
- web only for MVP
- modular monolith architecture
- Postgres as the application database
- Stripe planned for payments
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

- `apps/admin-web` - owner/admin app with auth, onboarding, dashboard, rooms, programs, and staff invites
- `apps/member-web` - future member-facing app
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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hitlink_dev?schema=public"
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

The current codebase is strongest in the admin foundation:

- auth and session support for owner login/signup
- onboarding that creates the workspace, primary location, owner role assignment, and workspace settings in one transaction
- owner-only dashboard shell and protected routing
- staff invite records with resend/revoke flows
- room CRUD with active/inactive and archive handling
- program CRUD with archive handling and progress-tracking flags

Upcoming slices in the docs focus on class templates, weekly schedules, member records, trial booking, forms, bookings, billing, messaging, family support, and migration tooling.

## Important docs

These docs are the best source of truth for product and architecture decisions:

- `docs/product_decisions_ledger.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/feature_decision_sheet.md`

## Notes

- The repo package name is `hitlink-monorepo`.
- `packages/db/prisma/schema.prisma` is the source of truth for the current database structure.
- The admin app currently depends on a working database; the member app and API app are still intentionally thin.
