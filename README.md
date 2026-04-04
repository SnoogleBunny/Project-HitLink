# Sahara Gym OS

A Zen Planner replacement for Muay Thai gyms and Hyrox/HIIT-style class studios.

## What this is
Sahara Gym OS is a one-location gym management platform focused on usability, reliability, billing clarity, scheduling, attendance, member self-service, and migration from legacy gym software.

## Who it is for
Primary ICP:
- Muay Thai gyms
- Hyrox/HIIT-style class-based studios

Secondary fit:
- One-location boutique class gyms with similar scheduling and billing needs

## MVP scope
The MVP includes:
- workspace setup
- owner / coach / customer roles
- staff invites
- schedules and class templates
- member profiles
- trial booking
- waivers/forms
- memberships
- drop-ins
- punch cards
- Stripe billing
- failed payment recovery
- member portal
- attendance
- events
- private lessons
- family support basics
- optional belt/stripe tracking
- Zen Planner / CSV migration

## Product guardrails
- one location only
- web only for MVP
- modular monolith
- email only at launch
- Stripe for payments
- native mobile later
- no multi-location assumptions in code

## Tech stack
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma
- Postgres
- Stripe
- pnpm
- Turborepo

## Repo structure
- `apps/admin-web` — owner and coach web app
- `apps/member-web` — member-facing web app
- `apps/api` — backend/domain APIs
- `packages/ui` — shared UI
- `packages/db` — Prisma schema, migrations, DB client
- `packages/types` — shared types
- `packages/auth` — auth/session helpers
- `docs/` — product and engineering docs

## Important docs
- `docs/product-decisions-ledger.md`
- `docs/feature-decision-sheet.md`
- `docs/mvp-ticket-board.md`
- `docs/domain-model.md`
- `docs/engineering-rules.md`

## Getting started
```bash
pnpm install
pnpm dev
```

Current workspace assumptions:
- No environment variables are required for the placeholder apps and packages in this repo.
- Root quality checks are `pnpm lint` and `pnpm check-types`.
- The apps boot on ports `3000` (`admin-web`), `3001` (`member-web`), and `3002` (`api`).
