# Flowstate Home

Flowstate is a gym management platform for Muay Thai gyms and Hyrox/HIIT-style class studios. The product thesis is to replace clunky tools like Zen Planner with a calmer operating system for scheduling, billing, attendance, forms, staff workflows, migration, and member self-service.

## North Star

Help single-location class-based gyms run daily operations reliably without making owners, coaches, or members fight the software.

## Current Demo Snapshot

See [[04-demo/Working Demo State]].

The current local demo has working admin, member, and thin API apps:

- Admin app: owner signup, workspace onboarding, dashboard, programs, rooms, weekly schedule templates, bookings, roster/attendance, members, guardians, forms, membership plans, access products, billing settings, and staff invite records.
- Member app: member login, dashboard, schedule browsing, self booking, bookings, membership, billing readout, forms, and public trial booking.
- API app: currently health check only.

## Product Guardrails

- One location only for MVP.
- Web only for MVP.
- Roles: owner, coach, customer.
- Modular monolith.
- Next.js, React, TypeScript, Prisma, Postgres.
- Stripe for payments.
- Email only at launch.
- No multi-location assumptions.

## Map

- [[01-decisions/Business Decision Log]]
- [[01-decisions/Decision Record Template]]
- [[02-product/Product Strategy]]
- [[02-product/MVP Scope Brain]]
- [[02-product/Customer And ICP]]
- [[03-technical/Architecture Brain]]
- [[03-technical/Data Model Brain]]
- [[04-demo/Working Demo State]]
- [[04-demo/Demo Script]]
- [[99-inbox/Open Inputs Needed From Jacky]]

