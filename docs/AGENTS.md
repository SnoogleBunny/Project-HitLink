# AGENTS.md

## Product
This repo is a Zen Planner replacement for Muay Thai gyms and Hyrox/HIIT-style class studios.

## MVP constraints
- one location only
- web only for MVP
- owner, coach, customer roles only
- modular monolith
- Next.js + Prisma + Postgres
- no multi-location assumptions
- Stripe Connect is the payment provider for the current billing slices
- email only at launch

## Current implemented surface
- admin auth, owner signup, workspace onboarding, dashboard, and protected routing
- staff invites, programs, rooms, schedule templates, bookings, rosters, attendance, members, and guardians
- public trial booking and member portal access
- form documents, versions, required assignments, signature requests, signed documents, and signing routes
- membership plans, member memberships, punch cards, drop-ins, Stripe settings, billing state, billing records, failed-payment flows, and Stripe webhooks
- member portal login, schedule, bookings, membership, billing, checkout completion, and forms

## Product roadmap context
Docs may include roadmap concepts that are not implemented yet. `packages/db/prisma/schema.prisma` is the source of truth for the implemented database shape.

Before implementing a slice, read:
- `README.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/smoke_test_checklist.md`

## Rules
- read docs in /docs first
- do not add out-of-scope features
- prefer simple readable code
- no microservices
- Prisma schema is source of truth
- add minimal tests for auth/role-sensitive code
