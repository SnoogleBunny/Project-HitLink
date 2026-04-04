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
- Stripe later, not in Slice 1

## Current slice
Slice 1:
- monorepo scaffolding
- auth
- workspace onboarding
- admin shell
- staff invites scaffold
- initial schema only

## Rules
- read docs in /docs first
- do not add out-of-scope features
- prefer simple readable code
- no microservices
- Prisma schema is source of truth
- add minimal tests for auth/role-sensitive code