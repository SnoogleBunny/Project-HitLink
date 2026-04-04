
---

# Starter `CLAUDE.md`

```md
# CLAUDE.md

## Product summary
This repo is a Zen Planner replacement for Muay Thai gyms and Hyrox/HIIT-style class studios.

The product focuses on:
- usability
- reliability
- scheduling
- billing
- attendance
- member self-service
- migration confidence

## MVP constraints
- one location only
- web only for MVP
- owner, coach, customer roles only
- Stripe is the payment provider
- email only at launch
- native mobile is deferred
- optional modules must be cleanly disableable
- no multi-location assumptions in code

## Engineering rules
- modular monolith only
- no microservices
- no premature event bus
- no speculative distributed architecture
- prefer simple readable code
- keep business logic close to the domain module that owns it
- Prisma schema is the source of truth for DB structure

## Repo conventions
- shared UI goes in `packages/ui`
- DB code goes in `packages/db`
- auth helpers go in `packages/auth`
- docs live in `/docs`
- do not duplicate shared components across apps unless necessary

## Coding behavior
- read docs before making changes
- stay inside the current slice
- do not add out-of-scope features
- leave concise TODOs only where work is intentionally deferred
- add minimal tests for auth/role-sensitive flows
- use explicit role checks
- prefer concrete implementations over framework-heavy abstractions

## Files to read first
- `docs/product-decisions-ledger.md`
- `docs/feature-decision-sheet.md`
- `docs/mvp-ticket-board.md`
- `docs/domain-model.md`
- `docs/engineering-rules.md`

## Current slice
Slice 1:
- auth
- workspace onboarding
- admin shell
- staff invites scaffold
- initial schema only

## Avoid
- building features outside the current slice
- adding billing before billing slice
- adding members before member slice
- introducing multi-location logic
- inventing abstractions without repeated usage
- large refactors unless explicitly requested