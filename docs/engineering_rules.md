# Engineering Rules

## Product constraints
- one location only in MVP
- owner, coach, customer are the only roles in MVP
- web only for MVP
- Stripe is the payment provider
- email only at launch
- native mobile is deferred
- multi-location assumptions must not leak into code

## Architecture rules
- modular monolith only
- no microservices
- no premature event bus
- no speculative distributed patterns
- prefer straightforward code over clever abstractions
- keep business logic close to the domain modules that use it

## Repo rules
- shared UI belongs in `packages/ui`
- shared DB code belongs in `packages/db`
- shared auth helpers belong in `packages/auth`
- Prisma schema is the source of truth for DB structure
- keep docs in `/docs`

## Coding rules
- read product docs before implementing a slice
- do not add features outside the current slice
- prefer small vertical slices
- leave concise TODOs only where work is intentionally deferred
- avoid generic abstractions unless already justified by repeated usage
- use explicit role checks
- favor readable naming over short clever names

## Schema rules
- prefer simple schemas first
- use nullable columns when still learning the domain instead of premature table explosion
- preserve migration-friendly models
- staging/import models must stay separate from production models
- optional modules should be disableable without leaking UI/state everywhere

## UI rules
- owner/coach UI should feel operational and efficient
- member UI should feel simpler and more consumer-like
- keep admin and member apps visually consistent but role-appropriate
- use shared components where possible
- avoid duplicated ad hoc components across apps

## Testing rules
- every slice should include minimal tests
- auth and role boundaries must be tested early
- route protection must not ship untested
- test business-critical workflows before polish

## AI-assisted development rules
- Codex is used for planning and review
- Claude Code is used for implementation
- both tools must be constrained by the docs in `/docs`
- prompts should reference the current slice only
- do not ask AI tools to build the entire app in one pass
- review generated code before moving to the next slice

## Current recommended order
1. auth and roles
2. workspace onboarding
3. staff invites
4. programs and rooms
5. schedule and class templates
6. member model and profiles
7. trial booking and forms
8. booking portal and waitlist
9. coach roster and attendance
10. memberships and billing
11. messaging and reminders
12. events and private lessons
13. family support
14. progress module
15. migration pipeline

