# QA recovery evidence

Date: 2026-07-20/21 UTC
Task: `t_9dc42987`
Candidate: `main` / `4dd55571d33814b687588163b53e48d7155ecfa4` (equal to `origin/main` at audit start)
Primary workspace: `C:/Users/Jacky/Documents/Project-HitLink`
Isolated runtime worktree: `C:/Users/Jacky/Documents/Project-HitLink-qa-runtime-t9dc42987` at the same detached commit
Verdict: **needs revision**

## Outcome

The repository contains a substantial, executable modular-monolith implementation. Fresh unit tests and lint pass, a clean generated-state typecheck passes, all four Next applications compile when Next is invoked directly, all 14 migrations apply to PostgreSQL 16, the demo seed is repeatable at the row-count level, and the migration-first onboarding browser flow passes end to end with screenshot evidence.

The candidate is not recovery-ready as a green baseline because four required paths are broken or inconsistent:

1. A clean migrated database differs from `schema.prisma` because an onboarding index name is truncated differently by PostgreSQL.
2. The demo seed does not satisfy the new migration-readiness gate, so the canonical demo E2E cannot reach `/dashboard` on a clean database.
3. Public trial booking accepts an occurrence after the class start/cutoff, while member booking correctly excludes it. This creates bookings on different dates and breaks roster truth.
4. The canonical root build and root E2E dependency graph are not reproducible on Windows/clean pnpm installation.

The mobile admin UI has no geometric overflow, but its full navigation block precedes the page content and makes operational work inefficient at narrow widths.

### Last coherent development point

The migration-first onboarding slice at `4dd5557` is **VERIFIED COMPLETE** for its scoped browser path: its exact current implementation builds directly and its isolated onboarding E2E passes. The repository-wide operational demo at the same commit is **BROKEN** by the seed/readiness and public-trial cutoff inconsistencies.

`b84e301` (`Refine Flowstate waitlist form layout`) is the last commit before the migration-first documentation/implementation pair (`11e2620`, `4dd5557`), but a whole-repository green baseline at `b84e301` is **UNKNOWN** because this audit did not alter Git state to check out and execute that historical commit. No historical commit should be called the last fully coherent repository baseline without its own clean replay.

## What passed

- Fresh forced lint: pass.
- Fresh forced Vitest run: 33 files, 162 tests, all passed.
- Typecheck from clean `.next` state: pass across all eight Turbo tasks.
- Prisma schema validation: pass.
- Clean PostgreSQL 16 migration replay: all 14 migrations applied.
- Prisma migration status: up to date.
- Demo seed run twice: stable counts after each run.
- Direct Next production compilation: admin, member, API, and landing applications pass.
- Isolated migration-first onboarding E2E: 1 test passed in 5.9 seconds.
- Migration-first behavior exercised: protected-route redirect, signup validation, onboarding validation/intake, migration gate, invalid/valid CSV validation, import/reconciliation, go-live scheduling, pre-readiness operational gate, handoff completion, and normal dashboard access.
- Responsive geometry at 390x844 and 768x1024: `scrollWidth` equals viewport width and no element bounds cross the viewport.
- Session and role boundaries are database-backed and covered by unit tests.

## What failed and why it matters

### P0: public trial booking bypasses class cutoff/start

At `2026-07-21T06:03Z`, the demo gym local time was `2026-07-20T23:03-07:00` in `America/Vancouver`. The weekly demo class starts at 23:00 local.

- Member self-service used the per-occurrence booking deadline and excluded July 20 (`apps/member-web/lib/self-service-bookings.ts:431-447`). It booked July 27.
- Public trial availability and creation accepted any matching weekday not before the local calendar date, without a start/cutoff check (`apps/member-web/lib/trial-booking.ts:202-216`, `apps/member-web/lib/trial-booking.ts:334-357`). It booked July 20 after the class had started.
- The isolated database contained two valid booking rows on different dates:
  - demo member: `2026-07-27`, source `MEMBER_PORTAL`;
  - public trial: `2026-07-20`, source `PUBLIC_TRIAL`.
- The admin roster for the member occurrence correctly rendered `1 / 20 booked`, so the canonical E2E expectation of `2 / 20 booked` failed.

Why it matters: a prospect can book an already-started class, roster capacity is split across occurrences, and staff do not see the expected participant on the active roster. The temporal E2E is also nondeterministic around class start.

Follow-up: `t_bb027307` (hitlink-backend).

### P0: demo seed and migration-readiness gate disagree

`packages/db/prisma/seed-demo.mjs` creates an `ACTIVE` demo workspace but no `WorkspaceMigration` with `operationallyReadyAt`. The dashboard gate requires both active workspace status and migration readiness (`apps/admin-web/app/dashboard/page.tsx:98-105`).

On the clean isolated runtime, login succeeded but `/dashboard` redirected to `/dashboard/migration`. `tests/e2e/flowstate-demo.spec.ts:69` expects `/dashboard`, so the canonical core demo flow fails before operational workflows run.

Adding a completed migration record only in the disposable QA database allowed the test to proceed and independently expose the trial cutoff defect. No source or seed was altered for that diagnostic.

Why it matters: the documented demo login no longer demonstrates the operational product from a clean seed, and the primary demo smoke test cannot pass as committed.

Follow-up: `t_3f747d38` (hitlink-db).

### P1: migration replay and declared schema drift

All migrations apply and `prisma migrate status` reports up to date, but:

```text
[-] Removed index on columns (workspaceId, importedModel, importedRecordId)
[+] Added index on columns (workspaceId, importedModel, importedRecordId)
```

The only difference is the physical index name:

- Migration DDL: `migration_imported_records_workspaceId_importedModel_importedRecordId_idx` (`packages/db/prisma/migrations/20260720012837_migration_first_onboarding/migration.sql:85`).
- PostgreSQL 16 truncates it to `migration_imported_records_workspaceId_importedModel_importedR`.
- Prisma expects `migration_imported_records_workspaceId_importedModel_import_idx` from `packages/db/prisma/schema.prisma:1552-1568`.

`prisma migrate diff ... --exit-code` returned `2`.

Why it matters: clean replay does not produce the exact source-of-truth schema. Future migration generation can repeatedly drop/recreate an equivalent index and obscure real drift.

Follow-up: `t_2175852d` (hitlink-db).

### P1: canonical Windows build and clean E2E install are not reproducible

The repository requires Node `>=20 <23` and pnpm `10.33.0`. The audit host has Node `24.17.0` and global pnpm `8.10.2`; Corepack supplies the declared pnpm `10.33.0`.

- `pnpm exec turbo run build --force` failed for admin, member, and landing before Next began.
- Those packages wrap POSIX environment sourcing in single-quoted `sh -c` build scripts. They are not portable through the active Windows pnpm shell.
- Direct `next build` passed for admin (26 routes), member (13 routes), API (2 routes), and landing (3 routes).
- A clean Corepack/pnpm 10.33 install succeeded, but root E2E tests import `@prisma/client` while root `package.json` does not declare it. Only package-local manifests do. The original tracked/hoisted dependency artifacts mask this missing root dependency.
- Root E2E discovery required a worktree-only junction for diagnostic execution; no manifest was changed.

Why it matters: a new Windows checkout cannot prove the documented root build/E2E path without undocumented workarounds. Node 24 results are also outside the declared engine support range and cannot be treated as release qualification for Node 20/22.

Follow-up: `t_729bcd38` (hitlink-workflow).

### P2: mobile admin navigation delays page content

Actual 390x844 and 768x1024 captures show no horizontal overflow, clipping, or control overlap. However, the admin shell renders all 14 navigation links before the page body. At 390px, the migration page heading starts roughly 1,200px below the top of the document.

Why it matters: core owner/operator tasks require scrolling through the entire navigation on every page load. This is responsive in geometry but poor operational usability.

Follow-up: `t_f2e2064c` (hitlink-frontend-dev).

## Implementation and recoverability assessment

### Executable application surface

Inventory at the audited commit:

- 47 Next page routes.
- 26 server-action files.
- 5 route handlers.
- 35 tracked test/spec files: 33 Vitest files plus 2 Playwright E2E files.
- 14 Prisma migrations.
- 1 demo seed.
- 82 Prisma models.

Executable workflows found in source and/or tests include:

- owner signup and migration intake;
- owner/coach/customer authentication and separate cookies;
- staff invitations and acceptance;
- programs, rooms, weekly schedule templates, booking windows and roster capacity;
- member booking/cancellation/waitlist and trial booking;
- roster attendance and waitlist promotion;
- forms, signing, stored form documents and access controls;
- membership plans, access products, checkout boundaries and Stripe webhook route;
- member billing/membership views;
- migration CSV staging, validation, import, reconciliation, readiness and owner notification outbox.

The onboarding/migration slice is the strongest freshly proven browser workflow. The older operational demo flow is currently broken by the seed gate and trial cutoff defects.

### Authorization boundaries

Shared sessions use opaque random 32-byte tokens. Only SHA-256 token hashes are stored (`packages/auth/src/session.ts:132-134`, `packages/auth/src/session.ts:186-205`). Cookies are HttpOnly, SameSite=Lax, path `/`, and Secure in production (`packages/auth/src/session.ts:140-165`). Expired records are removed (`packages/auth/src/session.ts:208-228`).

The session repository selects only active workspace memberships and rejects sessions with more than one active membership (`packages/auth/src/session.ts:69-108`, `packages/auth/src/session.ts:168-183`). This is consistent with the one-location MVP but is an explicit behavior to revisit before any multi-workspace direction.

- Owner context requires an active OWNER membership and an ACTIVE workspace (`apps/admin-web/lib/owner-workspace.ts:49-96`).
- Operations context permits active OWNER or COACH memberships and rejects inactive workspaces (`apps/admin-web/lib/operations-workspace.ts:55-105`).
- Member context requires CUSTOMER plus a member record bound to the same user/workspace (`apps/member-web/lib/member-auth.ts:54-102`).
- Proxies only redirect based on cookie presence (`apps/admin-web/proxy.ts`, `apps/member-web/proxy.ts`). They are not authoritative, but page/server-action helpers perform database-backed verification.
- Fresh tests include role, route-decision, session, owner, operations and member-auth coverage.

No cross-workspace authorization bypass was demonstrated in this audit. This was source/test verification, not an exhaustive penetration test of every server action.

### Database and migration confidence

Positive evidence:

- Prisma schema validates.
- All 14 migrations replay on a clean PostgreSQL 16 database.
- Foreign keys, uniqueness and indexes are created.
- Demo seed can run twice with stable counts.

Limitations:

- Schema drift remains due to the truncated index name.
- The migration history contains destructive resets and explicit warning comments in earlier slices; this audit validated empty-database replay, not upgrade safety with populated historical production data.
- No production or developer database was mutated.
- The demo seed deletes and recreates the demo workspace, so IDs change between runs even though counts are stable.
- The demo seed currently creates no operational migration readiness record.

Migration confidence is **moderate for clean bootstrap, low for populated upgrade recovery until a representative snapshot/fixture upgrade is tested**.

### Test coverage and schema-only foundations

Fresh Vitest output covers 33 files / 162 tests. Two package test scripts are placeholders:

- `apps/api`: prints `No tests yet`.
- `apps/landing-web`: prints `No tests yet`.

They must not be counted as meaningful tests.

Static Prisma-client usage found 23 models with no direct runtime or test references:

`ProgressModuleSetting`, `BeltDefinition`, `MemberProgressState`, `PromotionRecord`, `ConversationThread`, `ConversationParticipant`, `Message`, `Announcement`, `Event`, `EventBooking`, `PrivateLessonRequest`, `PrivateLessonBooking`, `HistoricalPaymentRecord`, `MemberCreditBalance`, `CreditLedgerEntry`, `BillingAdjustment`, `RefundRecord`, `FreezePolicy`, `CancellationPolicy`, `ClassInstance`, `JobLock`, `IdempotencyKey`, and `NotificationOutbox`.

This does not prove they should be deleted. It proves they are schema foundations rather than executable workflows at this commit. Recovery/status documents must not describe those modules as implemented product behavior without additional evidence. `ClassInstance` is especially notable because operational scheduling still queries recurring `ClassTemplate` plus date-only bookings; the newer persisted occurrence model is not used by runtime code.

Other midway/abandoned clues:

- `apps/landing-web/app/page.tsx:10` references `/landing-screenshot.png`, which was not present in public assets during the audit.
- Repository test/build behavior depends on tracked or hoisted dependency artifacts; 17 `node_modules` paths are tracked.
- Initial root typecheck failed on stale `.next/types/cache-life.d.ts`; deleting generated `.next` directories made the forced root typecheck pass. Generated-state cleanup is required for deterministic recovery.
- The 15 onboarding E2E screenshots were all 1280px wide; the committed E2E does not itself provide tablet/mobile evidence.

## Fresh gate evidence

| Gate | Fresh command | Result |
|---|---|---|
| Lint | `pnpm exec turbo run lint --force` | VERIFIED COMPLETE; 4 lint tasks executed, 0 errors |
| Unit tests | `pnpm exec turbo run test --force` | VERIFIED COMPLETE; 33 files, 162 tests |
| Typecheck | `rm -rf apps/*/.next && pnpm exec turbo run check-types --force` | VERIFIED COMPLETE; 8/8 tasks after clean generated state |
| Prisma validate | `pnpm run db:validate` | VERIFIED COMPLETE; schema valid |
| Canonical build | `pnpm exec turbo run build --force` | BROKEN; Windows shell build scripts exit before Next in 3 apps |
| Direct builds | app-local `pnpm exec next build` | VERIFIED COMPLETE; admin/member/API/landing |
| Clean install | Corepack pnpm 10.33.0 `install --frozen-lockfile --force` in detached worktree | VERIFIED COMPLETE; 446 packages, lockfile unchanged; lifecycle scripts intentionally ignored and Prisma generated explicitly |
| Migration replay | `prisma migrate deploy` against disposable PostgreSQL 16 | VERIFIED COMPLETE for clean bootstrap; 14 migrations |
| Migration status | `prisma migrate status` | VERIFIED COMPLETE; up to date |
| Schema drift | `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma --exit-code` | BROKEN; exit 2, equivalent index has different physical name |
| Seed repeatability | `node prisma/seed-demo.mjs` twice | PARTIAL; stable counts, BROKEN readiness contract |
| Onboarding E2E | isolated production build + `migration-first-onboarding.spec.ts` | VERIFIED COMPLETE; 1/1 in 5.9s |
| Core demo E2E | isolated production build + port-only copied `flowstate-demo.spec.ts` | BROKEN at demo migration gate; after disposable readiness setup, BROKEN at roster 1/20 |
| Responsive geometry | Playwright at 390x844 and 768x1024 | PARTIAL; no geometric overflow, BROKEN mobile navigation usability |

Notes:

- Initial `pnpm run lint` and `pnpm run test` replayed Turbo cache and were not counted. Forced runs above are the evidence.
- Initial forced typecheck failed on stale `.next/types/cache-life.d.ts`; only the clean generated-state rerun is counted as source correctness.
- Direct builds and runtime checks used an unsupported Node 24 host. Re-run release qualification on a declared Node version.
- API health in the fully isolated diagnostic was served from the exact-HEAD API build on port 3202.

## Screenshot evidence

The isolated migration-first run generated and QA inspected 15 full-page screenshots. Every committed-test capture was 1280px wide, so that E2E is **PARTIAL** for responsive evidence. Separate transient Playwright captures were generated and inspected at 390x844 and 768x1024 with programmatic overflow measurements. The image files were removed after inspection because this packet permits only `docs/recovery/evidence/qa.md` as a durable output.

Visual findings:

- Desktop signup: readable, balanced, no clipping or overlap.
- Tablet migration: readable controls and cards, no horizontal overflow.
- Mobile signup: readable labels, large inputs/button and reasonable tap targets.
- Mobile migration: cards and controls fit, but full navigation pushes content far below the fold.
- Minor: the onboarding intake validation banner remains visible after fields are corrected until resubmission, so the screen can show a “required” error alongside visibly populated required fields.

No secrets or production data appeared in the transient captures. Test identities used the repository’s local `.flowstate.local` demo domain.

## Documentation contradictions

1. `README.md`, `docs/04-demo/Working Demo State.md` and the smoke checklist describe the main demo path as connected/green, but a clean current seed redirects to migration and the canonical demo E2E fails.
2. Migration status alone says up to date, but semantic drift is non-zero.
3. Broad entity/status documents can imply implementation from schema presence; 23 models have no direct runtime/test usage.
4. Root verification commands imply a portable build, but canonical package scripts fail on this Windows host while direct Next builds pass.
5. The repository declares Node `<23`, while this audit host runs Node 24. Results need confirmation on Node 20 or 22.
6. API and landing `test` scripts report success text but contain no tests.
7. The onboarding E2E saves 15 screenshots but all are 1280px wide; responsive claims require the separate evidence in this report.

## Unresolved decisions

1. Should the demo seed represent an operational post-migration gym or an intentionally gated pre-launch gym? The seed, demo docs and E2E must share one answer.
2. Is public trial booking governed by the same configurable booking-open/cutoff policy as member booking, or by a stricter product-specific rule? It must never accept an already-started occurrence.
3. Which schema-only foundations are approved near-term roadmap scaffolding, and which should be removed or explicitly marked deferred?
4. What populated database snapshot/fixture is the acceptance baseline for replaying destructive historical migrations?
5. Is the one-active-membership session rule a permanent MVP invariant or a temporary limitation to document? No multi-location behavior should be introduced without a product decision.
6. Should the mobile admin shell use a drawer, disclosure, or priority navigation? UX should select the pattern before implementation.

## Bounded recovery tickets created

- `t_bb027307` — Enforce class cutoff for public trial booking — hitlink-backend.
- `t_3f747d38` — Align demo seed with migration readiness gate — hitlink-db.
- `t_2175852d` — Eliminate MigrationImportedRecord index-name drift — hitlink-db.
- `t_729bcd38` — Restore clean Windows build and E2E reproducibility — hitlink-workflow.
- `t_f2e2064c` — Collapse admin navigation on mobile and tablet — hitlink-frontend-dev.

All are children of `t_9dc42987` and remain queued until this audit completes.

## Recommended next action

Do not treat the repository as a green recovery baseline yet. Fix the trial cutoff and demo readiness mismatch first, then the index drift and clean-build/E2E reproducibility. Re-run, on a declared Node version, all forced gates plus both canonical E2Es against a freshly migrated and seeded PostgreSQL database. The recovery synthesis should describe schema-only models as foundations, not shipped workflows, until implementation evidence exists.

## Environment and cleanup

- Host: Windows 10.
- Node: 24.17.0 (outside declared range).
- Global pnpm: 8.10.2; Corepack pnpm used for clean install: 10.33.0.
- PostgreSQL: disposable `postgres:16-alpine` container on localhost port 55434.
- No production credentials, external services, deployments, remote pushes, or non-QA databases were used.
- The isolated worktree, temporary screenshots/configuration, and disposable container were removed after report verification.
