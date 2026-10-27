# HitLink

HitLink serves martial arts gyms and adult one-to-one coaching programs. Owners manage classes, members, forms and payments; members use a separate portal to book for themselves or verified family members. Coaching programs have their own plans, daily notes and optional appointments.

The approved behavior is defined in [the workflow specification](docs/approved-workflows.md), with a [replacement Word document](docs/HitLink_Product_Workflows_Shipping_Specification_v1_3.docx). [Implementation status and operational setup](docs/implementation-status.md) distinguish verified local behavior from remaining work and deployment requirements. Internal `flowstate` package names remain for compatibility.

The [current completion audit](docs/web-app-completion.md) records the October 25 web-app implementation, fresh checks and remaining acceptance work. Earlier release results are historical evidence and must not be treated as a fresh full-workflow certification.

The [reviewed interactive mockups](docs/mockups/README.md) include a browser preview, editable source and screenshots for the owner, member/guardian, coach, coaching client and visitor experiences. Start there when continuing the design in another Codex session.

## Current status

The owner and member applications include:

- owner signup, login, and session handling
- workspace onboarding for a single-location gym
- protected admin dashboard and coach roster surface
- staff invite, program, room, schedule template, booking, roster, and attendance workflows
- member and guardian records
- verified public trial and paid membership enrollment
- form upload, required-form assignment, signing, and signed-document tracking
- membership plans, member memberships, access products, punch cards, drop-ins, billing records, Stripe settings, Stripe webhooks, and failed-payment workflows
- member portal login, dated class booking and moves, household selection, accepted membership terms, payer-scoped payments, and forms/signing
- recurring classes with dated overrides and substitute coaches
- weekly and billing-month class limits, finite freezes, cancellation notice and payment recovery
- adult coaching programs, private drafts and separately published client notes
- program rank policies and promotion history
- owner website drafts and publishing, export/offboarding review, and time-limited support grants

Boundaries and deployment requirements:

- `apps/api` currently exposes a health endpoint only
- live payments and email require configured providers; local tests do not send or charge
- scheduled maintenance must be connected before relying on unattended delivery or billing recovery
- imports and account closure block incomplete financial, consent or entitlement evidence
- legal pages retain explicit business-detail placeholders
- events, private lessons, broader messaging and deeper reporting remain outside the approved implementation described above

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
- `packages/payments` - durable checkout, invoice, refund and subscription reconciliation
- `packages/ui` - shared UI components
- `docs/` - product and engineering reference docs

## Docker quickstart

With Docker Desktop running, a clean checkout needs no host Node.js, pnpm, database or `.env` file:

```bash
docker compose up --build
```

The image uses Node.js 22 and the locked pnpm dependencies, builds all four applications, waits for PostgreSQL, applies committed migrations, and initializes fictional demo data on the first empty database only. Subsequent starts preserve your edits. The bootstrap uses the existing disposable-database guard unchanged; it never runs a reset command. Generated signing/worker secrets persist in a private named volume.

| Service | Local URL | Demo sign-in |
| --- | --- | --- |
| Owner/coach | [localhost:3000](http://localhost:3000) | `demo-owner@flowstate.local` / `DemoPass123!` |
| Member portal | [localhost:3001](http://localhost:3001) | `demo-member@flowstate.local` / `MemberPass123!` |
| API readiness | [localhost:3002/api/v1/health](http://localhost:3002/api/v1/health) | Database-backed readiness check |
| Public landing page | [localhost:3003](http://localhost:3003) | No sign-in |

All ports bind to this computer's loopback interface. PostgreSQL is available at `localhost:55432` with database `hitlink_demo`, user `postgres`, and password `postgres`. To avoid occupied ports, set `HITLINK_ADMIN_PORT`, `HITLINK_MEMBER_PORT`, `HITLINK_API_PORT`, `HITLINK_LANDING_PORT`, or `HITLINK_POSTGRES_PORT` before running the same command; public app URLs are rebuilt to match. A separate copy can use `docker compose -p another-name up --build` with distinct ports.

PDF uploads, signed documents and exports are stored in the persistent PostgreSQL volume. Landing-page waitlist submissions have their own volume. `docker compose down` stops the stack and keeps its data; `docker compose up` starts it again. Use `docker compose ps` for health and `docker compose logs bootstrap admin-web maintenance` for startup/worker diagnostics. Removing the named volumes deletes this local data and its generated secrets.

See [local operations and recovery](docs/local-operations.md) for isolated restore commands, verification boundaries and the local recovery rehearsal.

The maintenance service calls the application's authenticated maintenance endpoint every minute and follows its workspace cursor, including retries. Provider credentials are deliberately empty in this local configuration: payment-dependent actions remain pending/unavailable and emails remain queued. The seed provides a clearly labelled fictional class-pack grant, without a fabricated payment. Actual Stripe/Resend activation, verified public origins, legal details, backups and production deployment remain separate operational work. Building the image downloads its base images/dependencies and the landing page's Google Fonts; it requires internet access initially.

### Run the automated checks in Docker

```bash
docker compose --profile test run --build --rm checks
```

This builds the same application image and runs the unit tests, all PostgreSQL integration suites, tooling checks, lint and TypeScript checks against a separate disposable test database. It never resets the application database. A failed check exits with a nonzero status; the integration URL is explicitly configured so those tests cannot silently skip. Browser workflow tests remain a separate Playwright gate.

## Local development

### Prerequisites

- Node.js 22.23.4 or later in the 22.x line (`nvm use` reads `.nvmrc`)
- pnpm 10.33.0 (pinned by `packageManager`)
- Docker Desktop or another way to run PostgreSQL locally

### 1. Install dependencies

```bash
pnpm install --frozen-lockfile
pnpm db:generate
```

Prisma Client generation is intentionally explicit rather than a `postinstall`
side effect. Run `pnpm db:generate` after a clean install and whenever the
Prisma schema changes. Installation and client generation do not require a
local `.env` file.

### 2. Create the local env file

```bash
cp .env.example .env
```

For development outside Docker, generate a private value with `openssl rand -hex 32` and put it in `.env` as `HITLINK_AUTH_THROTTLE_SECRET`. Both portals must use the same value. Compose generates and persists this secret automatically. Leave `HITLINK_AUTH_TRUST_PROXY=false` unless the app is reachable only through a controlled reverse proxy that replaces client IP headers.

The default local database URL is:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55432/hitlink_demo?schema=public"
```

### 3. Start Postgres

```bash
pnpm db:up
```

### 4. Run Prisma migrations

```bash
pnpm db:migrate
```

Additional Prisma helpers:

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
- Public landing page: [http://localhost:3003](http://localhost:3003)
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

## Maintenance checks

Pull requests run `.github/workflows/checks.yml`: the existing Docker checks profile runs package tests, PostgreSQL suites, lint and types; a separate job runs the maintained canonical browser gate. Both use disposable databases and empty provider credentials.

`pnpm test:e2e:preflight` checks actual Playwright discovery against the feature ledger before building or resetting data. It uses the same guarded environment as `node tests/e2e/canonical-playwright.mjs`: `FLOWSTATE_E2E_SERVER_MODE=development-clean`, a loopback database on port `55435` whose name contains `canonical_repair`, matching `FLOWSTATE_DEMO_DATABASE_NAME`, and `FLOWSTATE_DEMO_DATABASE_ACKNOWLEDGEMENT=I_ACKNOWLEDGE_THIS_DATABASE_IS_DISPOSABLE`. The workflow contains a complete local-fixture example. Never point the browser gate at a retained workspace database.

The browser gate reserves ports 3300–3303 by default. Set `FLOWSTATE_CANONICAL_PORT_BASE=3400` for the alternate owned 3400–3403 quartet when another local stack uses the default ports. Other port families and mismatched overrides are rejected.

Reuse the shared password validator, strict date primitive, database-failure reader and UI controls when adding callers. Keep constraint matching, retry budgets, authorization and immutable replay evidence in their domain commands. Shared login setup can support browser tests; each test still owns its business assertions.

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
