# Recovery Synthesis and Stabilization Sequence

Audit window: 2026-07-20 to 2026-07-21 UTC
Kanban task: `t_f36a1ffb`
Repository state synthesized: `main` at `4dd55571d33814b687588163b53e48d7155ecfa4` (`feat: add migration-first onboarding operations`)

## Outcome

Flowstate is not a green repository-wide recovery baseline and is not pilot-ready. The migration-first onboarding slice is the last scoped implementation with current positive browser evidence, but the connected operational demo at the same commit is broken. The repository has substantial implemented owner, coach, member, booking, billing-state, forms, and migration foundations; schema presence and unit tests must not be described as complete operational workflows where runtime, provider, or browser proof is absent.

The immediate recovery objective is to restore a deterministic clean baseline before adding product breadth. The first five work packets below repair the known red paths and an unsafe migration activation invariant. Live Stripe, production email, customer data, deployment, and product-scope expansion remain outside this sequence.

## Timestamped board recovery fact

- Initial fact recorded when recovery mission `t_e140d719` was created on `2026-07-20T22:40:52Z`: the `hitlink` board was empty at orchestration start.
- As of `2026-07-21T06:39:50Z`, the board contains temporary recovery/audit work and prematurely created future-looking `[QA]` cards. Those cards are recovery coordination artifacts, not evidence of a pre-existing product backlog.
- No historical product-ticket history was reconstructed. Recovery cards must remain distinguishable from pre-existing product tickets in all later status reporting.

## Status vocabulary

This synthesis uses only:

- `VERIFIED COMPLETE`: exercised successfully for the stated scope with current command/browser/database evidence.
- `IMPLEMENTED BUT UNVERIFIED`: runtime code exists and may have unit coverage, but the stated integrated path was not exercised.
- `PARTIAL`: meaningful behavior exists, but a required path, safety property, or actor handoff is absent.
- `SCAFFOLDED`: schema or structural foundation exists without a complete operational workflow.
- `BROKEN`: the current documented or canonical path was exercised and failed.
- `MISSING`: an approved requirement has no implementation found.
- `UNKNOWN`: evidence is insufficient; no inference is made from historical claims or schema shape.

## Last coherent development point

- `4dd5557` is `VERIFIED COMPLETE` only for the scoped migration-first onboarding browser path exercised on a disposable database during the 2026-07-20 QA recovery audit. That isolated Playwright case passed.
- The repository-wide operational demo at `4dd5557` is `BROKEN`: the demo seed does not satisfy the new migration-readiness gate, and public trial booking can select a same-day occurrence after its class start/cutoff. The canonical connected E2E then sees bookings on different dates and fails its roster assertion.
- `b84e301` is the last commit before the migration-first documentation and implementation commits, but its repository-wide status is `UNKNOWN`; no recovery worker checked out and replayed that historical commit.
- Therefore no commit is currently proven as a whole-repository green baseline. Do not call `4dd5557` release-ready or call `b84e301` the last known-good commit without a clean historical replay.

## Current verified repository state

### Current run, 2026-07-21 UTC

- `pnpm --filter @flowstate/auth test`: `VERIFIED COMPLETE`, 1 file / 7 tests.
- `pnpm --filter admin-web test`: `VERIFIED COMPLETE`, 25 files / 126 tests.
- `pnpm --filter member-web test`: `VERIFIED COMPLETE`, 7 files / 29 tests.
- Total fresh Vitest assertions: 162 passed. Several other workspace test scripts are placeholders, and the database package test is Prisma validation rather than an integration suite.
- `pnpm --filter @flowstate/db test`: `VERIFIED COMPLETE` for `prisma validate`; it does not prove migration replay or data integrity.
- `pnpm run build`: `BROKEN` on the documented Windows host. The admin, member, and landing package wrappers exit before Next emits a diagnostic.
- Direct `next build` for admin, member, landing, and API: `VERIFIED COMPLETE`; all four compile and type-check. This isolates the current canonical build defect to package-script/environment/bootstrap behavior, not observed application compilation.

### Inherited disposable-environment evidence from peer audits

- All 14 committed Prisma migrations replay on an empty PostgreSQL 16 database, but Prisma detects one index-name drift after replay: `PARTIAL`.
- The isolated migration-first onboarding E2E passed; the connected Flowstate demo E2E failed with 1 member versus 2 expected roster participants because the public trial and member booking landed on different dates: `BROKEN`.
- Current application code has zero runtime TypeScript references to `ClassInstance`/`classInstanceId` even though Prisma persists that model: `SCAFFOLDED`, not an implemented dated-class workflow.
- Notification jobs, retry fields, and a processor function exist, but no runtime caller or production provider adapter was found; failed jobs are not selected again by the current `PENDING`-only query: `SCAFFOLDED`/`BROKEN` for launch email delivery.
- Stripe abstractions and webhook processing exist, but live/test-mode provider fulfillment was not executed. Drop-in finalization has state/session/capacity risks and checkout completion does not explicitly require paid payment status: `PARTIAL`; live Stripe must remain disabled.

## Intended MVP baseline

The recovery baseline remains bounded to one location, web-only owner/coach/customer roles, a modular monolith, Stripe as the eventual payment rail, and email-only launch communications. It includes migration-first onboarding, workspace setup, recurring schedule, members/guardians as records, public trials, member self-service, booking/waitlist, roster/attendance core, plans/access products, billing state, and versioned forms/signatures.

The baseline does not gain implementation status from the reliability schema migration. Guardian self-service, one-off class operations, progress, messaging, announcements, events, private lessons, credits/refunds, richer reporting, and a public API are not proven complete. No multi-location or native-mobile work is allowed in recovery.

## Exact first five work packets

The five cards below replace, rather than complete, the prematurely created future-looking `[QA]` cards. Each implementation must stay on an isolated worktree, report exact tests/evidence, and block as `review-required`; no implementer may merge, deploy, push, use live credentials, or touch customer data.

### 1. M0 — Enforce public-trial cutoff and occurrence-date truth

Owner: Backend
Card: `t_bbab9bc8`

Allowed paths:

- `apps/member-web/lib/trial-booking.ts`
- `apps/member-web/lib/trial-booking.test.ts`
- `packages/db/src/occurrences.ts` only if a shared pure occurrence/cutoff helper is required
- the minimum directly related E2E fixture/assertion under `tests/e2e/flowstate-demo.spec.ts`

Forbidden paths: Prisma schema/migrations, unrelated booking/member UI, billing, email, seed data, product docs.

Acceptance:

- Public trial options exclude an occurrence after its workspace-local booking cutoff.
- Submission revalidates the selected occurrence and cutoff server-side using the same semantics as member booking; stale/tampered submissions fail without writing member, guardian, family, booking, or form-request rows.
- Tests cover immediately before/at/after cutoff and timezone/date boundaries.
- The connected demo places trial and member bookings on the intended same future occurrence.

Required proof: focused unit tests, member package test/lint/type gates, and the connected Playwright assertion against a disposable database after the seed-readiness packet lands.

External boundary: no email send, Stripe call, production credential, real prospect data, deploy, or remote push.

### 2. M0 — Seed a migration-ready demo workspace deterministically

Owner: Database
Card: `t_5492e427`

Allowed paths:

- `packages/db/prisma/seed-demo.mjs`
- focused database seed verification added under `packages/db/` if needed
- minimum E2E fixture expectation needed to prove the seeded readiness state

Forbidden paths: application authorization/gating logic, production migrations except through packet 3, live/shared databases, customer data.

Acceptance:

- A fresh demo reset creates the demo workspace and migration record in a state that satisfies the implemented `ACTIVE` plus `operationallyReadyAt` gate.
- Seed semantics represent a completed demo handoff without weakening production readiness checks.
- Two consecutive seed/reset runs produce stable logical counts and no duplicates.
- Owner login reaches the dashboard while pre-readiness behavior remains covered by the isolated onboarding E2E.

Required proof: disposable PostgreSQL migration/reset/seed twice, exact count/state queries, focused tests, and both readiness redirect assertions.

External boundary: disposable local database only; no production/shared database, destructive operation outside the namespaced demo fixture, credential capture, deploy, or push.

### 3. M0 — Eliminate Prisma migration-imported-record index drift

Owner: Database
Card: `t_b2b7f074`

Allowed paths:

- `packages/db/prisma/schema.prisma`
- one new additive migration under `packages/db/prisma/migrations/`
- focused migration verification documentation/test under `packages/db/`

Forbidden paths: editing applied migration history, destructive resets outside a disposable database, unrelated schema redesign, product application code.

Acceptance:

- Use an explicit PostgreSQL-safe index mapping/name shorter than the identifier limit.
- Add an idempotent/additive migration path from the current physical truncated name; do not rewrite the existing migration.
- Fresh replay of the complete migration chain succeeds on PostgreSQL 16.
- `prisma migrate diff --from-url ... --to-schema ... --exit-code` reports no drift after replay.
- Existing-data upgrade path is exercised on a disposable pre-fix database and preserves rows.

Required proof: schema validate, fresh deploy/status/diff, pre-fix upgrade/diff, and catalog evidence for the final index name.

External boundary: disposable local PostgreSQL only; no production credentials, destructive production operation, deploy, or push.

### 4. M0 — Make Windows build and clean E2E bootstrap reproducible

Owner: Workflow
Card: `t_f6e91ecb`

Allowed paths:

- root and application `package.json` files
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `turbo.json`, and Playwright configuration only as required
- scoped setup documentation/tests for the canonical commands

Forbidden paths: application product behavior, Prisma domain schema/migrations, CI deployment, secrets, unrelated dependency upgrades.

Acceptance:

- On a clean Windows checkout using a supported Node 20/22 release and pnpm 10.33.0, frozen install plus explicit safe Prisma generation/bootstrap succeeds.
- `pnpm run build` succeeds without nested POSIX lifecycle wrappers and without requiring an `.env` merely to compile.
- Root E2E discovery resolves Prisma dependencies from declared manifests, not tracked/hoisted artifacts or a diagnostic junction.
- `pnpm exec playwright test --list` succeeds after clean install; full E2E execution may remain red only for a separately tracked product assertion until packets 1 and 2 land.
- Existing direct app builds remain green.

Required proof: clean-install transcript, declared Node/pnpm versions, canonical build, direct builds, E2E discovery, lint/type gates.

External boundary: no CI deployment, secret creation, production service, remote push, or unrelated dependency modernization.

### 5. M0 — Enforce migration handoff authorization and readiness invariants

Owner: Backend with Workflow review
Card: `t_0810eec9`

Allowed paths:

- `apps/admin-web/lib/workspace-migration.ts`
- `apps/admin-web/app/dashboard/migration/actions.ts`
- directly related access/readiness tests and minimal migration page state/copy needed to expose a blocked reason
- `packages/db/prisma/schema.prisma` only after explicit Database consultation if persistence is demonstrably required

Forbidden paths: migration breadth/presets, customer import files, unrelated onboarding redesign, live email delivery, production credentials.

Acceptance:

- An owner cannot activate daily operations merely by submitting the current action.
- Server-side readiness requires the approved migration stage and zero unresolved blocking validation/reconciliation conditions; checks and state transition occur atomically.
- The permitted actor is explicit and compatible with current owner/coach/customer role architecture. If an internal Flowstate operator role is required, block for CEO/product decision instead of inventing a role.
- Duplicate submissions are idempotent; failed checks leave workspace and migration state unchanged and return an operator-safe reason.
- Tests cover unauthorized actor, incomplete stage, blocking issues, duplicate completion, success, and rollback on failure.

Required proof: focused unit tests plus disposable PostgreSQL integration evidence; Workflow review confirms the cross-actor handoff and the owner-facing/internal-control boundary.

External boundary: no real customer migration, email send, production database, new role/product commitment, deploy, or push.

## Highest-risk launch gaps after M0

These are not authorized for silent implementation in the five-packet baseline:

1. Launch email worker/provider, retry/requeue/dead-letter behavior, producer coverage, operator visibility, and sandbox proof.
2. Stripe test-mode checkout/portal/webhook/payment-status/idempotency/capacity/reconciliation proof; live money movement remains disabled.
3. A canonical dated-class model plus one-off cancellation/reschedule/substitute workflow and affected-member notification.
4. Owner/member password reset and recovery abuse controls.
5. Product-specific loading/error/not-found recovery.
6. Guardian self-service or an explicit CEO-approved pilot exclusion for youth/family gyms.
7. Atomic/idempotent production migration import with representative Zen Planner fixtures, cutover, rollback, and sign-off.
8. Cross-tenant and concurrency integration tests for seats, punches, forms, webhooks, and migration retry.

Each needs a new scoped packet plus the affected specialist reviews. Pricing, pilot promises, supported migration breadth, guardian-market scope, and production operations remain CEO/Jacky decisions.

## Deferred, deprioritized, and rejected options

- Deferred until an approved scope decision: progress, messaging, announcements, events, private lessons, credits/refunds, deep reporting, guardian portal breadth, public API/integrations, and non-English launch catalogues.
- Deprioritized behind deterministic recovery: shared UI-package cleanup, broad visual redesign, component-library consolidation, generalized reporting, and non-critical archival restore flows.
- Rejected for recovery: multi-location assumptions, native mobile, microservices, speculative distributed queues, live credential use, customer-data rehearsal without approval, rewriting applied migrations, and claiming schema-only models as shipped workflows.
- Not accepted as evidence: historical demo notes without replay, cached test output alone, direct Next builds as a substitute for the canonical root build, or queued notification rows as proof of received email.

## Documentation and ticket reconciliation after stabilization

After the five packets are reviewed and the integrated candidate is green:

- Update `README.md`, `docs/domain_model.md`, `docs/04-demo/Working Demo State.md`, and `docs/mvp_ticket_board.md` to match executable behavior and exact verification dates.
- Update `docs/product_decisions_ledger.md` only for CEO-approved scope decisions, especially migration actor/approval, dated-class semantics, email/Stripe pilot gates, and guardian scope.
- Keep this recovery evidence immutable as an audit snapshot; add a new dated verification record rather than rewriting failed observations.
- Retire or supersede temporary recovery and premature `[QA]` cards only through explicit board reconciliation; do not silently relabel them as historical product tickets.

## Review and merge policy

Every implementation candidate must receive QA and BA/Sales review before a CEO merge decision. Add Workflow review to packet 5; Database owns packets 2 and 3; packet 4 is owned by Workflow. User-visible changes require timestamped desktop/tablet/mobile evidence when they alter rendering. QA and BA/Sales approvals are evidence gates, not permission to deploy. Only `hitlink-ceo` may decide local merge, and remote push/deploy still requires Jacky's explicit approval.

Explicit review chains created:

| Implementation | QA | BA/Sales | Specialist | CEO decision |
| --- | --- | --- | --- | --- |
| `t_bbab9bc8` | `t_343dd71f` | `t_aa858695` | — | `t_22c0f9ca` |
| `t_5492e427` | `t_894b1e73` | `t_c5070167` | Database is implementation owner | `t_9b3803b9` |
| `t_b2b7f074` | `t_d243f12a` | `t_0b3c75a7` | Database is implementation owner | `t_b650ab0f` |
| `t_f6e91ecb` | `t_c2866ef9` | `t_176f0b8e` | Workflow is implementation owner | `t_85c22358` |
| `t_0810eec9` | `t_f3ae24ae` | `t_420a292b` | Workflow `t_eaca3d30` | `t_5ffd2712` |

Packet 5 is dependency-gated on packet 2 (`t_5492e427`) and packet 3 (`t_b2b7f074`). All new implementation cards are children of this synthesis task, so none becomes executable until this handoff completes. The existing premature `[QA]` cards were left unchanged and are not reused as approvals.

## Evidence / technical details

Primary peer evidence:

- `docs/recovery/evidence/backend.md`
- `docs/recovery/evidence/frontend.md`
- `docs/recovery/evidence/database.md`
- `docs/recovery/evidence/qa.md`
- `docs/recovery/evidence/workflows.md`
- `docs/recovery/evidence/localization.md`
- `docs/recovery/evidence/design.md`
- `docs/recovery/evidence/ux.md`
- `docs/recovery/evidence/ba-sales.md`
- `docs/recovery/evidence/ceo-local-verification.md`

Current commands run by synthesis:

- `git status --short`; `git rev-parse HEAD`; `git log -5 --oneline --decorate`
- `pnpm run test` (green but Turbo-cached)
- fresh direct package tests: auth 7, admin 126, member 29; 162 assertions total
- `pnpm --filter @flowstate/db test` (Prisma schema valid)
- `pnpm run lint` (9/9 tasks passed from local Turbo cache)
- `pnpm run check-types` (9/9 tasks passed from local Turbo cache)
- `pnpm run build` (exit 1; canonical Windows wrapper failure)
- `pnpm --filter admin-web exec next build`
- `pnpm --filter member-web exec next build`
- `pnpm --filter landing-web exec next build`
- `pnpm --filter api build` (all four direct builds passed)

No product code, schema, migration, seed, credential, production data, deployment, remote branch, or external system was changed by this synthesis task.
