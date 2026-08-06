# Final Recovery QA Review

**Verdict: BLOCKED**
**Kanban task:** `t_42dbac72`
**Reviewed at:** 2026-07-21T07:10:35Z
**Candidate:** dirty working tree on `main` at `4dd55571d33814b687588163b53e48d7155ecfa4`; `origin/main` resolved to the same commit.

## Outcome

The repository has a meaningful working core: fresh forced lint, typecheck, and unit tests passed; all four Next.js applications compiled when built directly; all 14 migrations replayed on a disposable PostgreSQL database; and the migration-first onboarding Playwright scenario passed in isolation after a local generated-client workaround.

The recovery cannot be certified. The two required canonical recovery artifacts do not exist, the recovery evidence directory is untracked, the canonical root build fails, a clean install cannot discover the E2E tests without an undeclared Prisma-generation workaround, the demo seed cannot enter daily operations, the connected demo E2E fails, Prisma detects migration/schema drift, and the five proposed implementation packets are explicitly frozen as non-canonical CEO-review inputs rather than an approved backlog.

Why this matters: a `PASS` would imply that a clean checkout can reproduce the documented demo and that the recovery plan is a traceable, approved source of truth. Neither condition is true.

**Next action:** keep the recovery blocked. Create and review the missing canonical matrix/audit, repair the reproducibility and runtime defects below, rerun this same gate set from a clean supported environment, and only then ask QA for a new binary verdict.

## What passed

1. **Fresh forced static/unit gates:** 29/29 Turbo tasks passed across lint, typecheck, and tests.
2. **Executable unit suites:** 162 tests passed: auth 7, admin 126, member 29. Several other packages still report `No tests yet` rather than exercising behavior.
3. **Direct application compilation:** admin, member, landing, and API Next.js builds each exited 0.
4. **Migration replay:** all 14 checked-in migrations deployed successfully to a fresh disposable PostgreSQL database; `prisma migrate status` reported the database up to date.
5. **Seed repeatability at the row-count level:** two seed runs both exited 0 and produced the same logical demo counts.
6. **Migration-first onboarding scenario:** the isolated onboarding Playwright test passed on Chromium after working around the clean-install Prisma client resolution defect. It created an `ACTIVE` workspace with a `COMPLETE` migration and a non-null operational-readiness timestamp.
7. **One-location database constraint:** `Location.workspaceId` is unique in `packages/db/prisma/schema.prisma:487-490`, consistent with the MVP one-location rule.
8. **Runtime guard for future attendance:** the product correctly refused an attendance write for a future class date (`apps/admin-web/lib/rosters.ts:722-729`). The E2E fixture/expectation is wrong, not this guard.

## What failed

### 1. Required canonical recovery inputs are absent

Both task-required files were absent from the working tree and from `HEAD`:

- `docs/PROJECT_RECOVERY_WORKFLOW_MATRIX.md`
- `docs/PROJECT_RECOVERY_AUDIT.md`

The available reports under `docs/recovery/evidence/` are untracked. They cannot substitute for the missing canonical artifacts or establish what was reviewed in Git history.

**Correction required:** create the exact two canonical files, make every claim traceable to schema/source/tests/Git/board evidence, review them, and check them into the intended candidate before final QA.

### 2. The canonical root build is red

`npx --yes pnpm@10.33.0 run build` failed in the current Windows workspace:

- Turbo scheduled four application builds.
- `landing-web`, `admin-web`, and `member-web` exited 1 immediately through their package `sh -c ... next build` wrappers.
- Turbo reported `0 successful, 4 total`; root exit 1.

Direct `next build` invocations succeeded for all four apps, which narrows this to root/package orchestration rather than an application compilation failure. Direct builds also warned that Next.js selected `C:\Users\Jacky\package-lock.json` as the workspace root instead of this repository.

**Correction required:** make the declared root build command pass from a clean Windows checkout, remove the ambiguous workspace-root/lockfile dependency, and keep direct builds only as diagnostic evidence—not as a replacement for the canonical gate.

### 3. Clean install/E2E bootstrap is not reproducible

A Git archive of `HEAD` contains 17 tracked `node_modules` artifacts. A normal non-interactive frozen install stopped at pnpm's request to remove the existing modules directory. With `CI=true`, the frozen install exited 0 but warned that dependency build scripts were ignored.

Immediately afterward:

```text
CI=true npx --yes pnpm@10.33.0 exec playwright test --list
```

failed with:

```text
Cannot find module '.prisma/client/default'
...
tests/e2e/flowstate-demo.spec.ts:2
...
tests/e2e/migration-first-onboarding.spec.ts:2
No tests found
CLEAN_E2E_DISCOVERY_EXIT=1
```

The repository has no explicit root E2E preparation step that generates/exposes the Prisma client expected by the root specs.

**Correction required:** untrack dependency artifacts, declare the supported Node version in repository configuration, add a deterministic Prisma-generation/E2E preparation command, and prove a clean `install -> E2E discovery -> E2E run` without junctions or local workspace state.

### 4. Demo seed and daily-operations readiness contradict each other

On a freshly migrated disposable database, both seed runs returned these stable counts:

```text
workspace=1 location=1 workspace_user=2 member=1 class_template=1 booking=0 workspace_migration=0
```

`packages/db/prisma/seed-demo.mjs` has no `workspaceMigration` creation/upsert. The admin dashboard considers a workspace operational only when it is `ACTIVE` and has a non-null `operationallyReadyAt` (`apps/admin-web/lib/workspace-migration.ts:456-462`; `apps/admin-web/app/dashboard/page.tsx:22-30`). Therefore the documented demo owner logs in and is redirected to `/dashboard/migration`, not `/dashboard`.

This independently reproduces the connected Playwright failure:

```text
Expected URL: http://localhost:3000/dashboard
Received URL: http://localhost:3000/dashboard/migration
```

It also contradicts `docs/04-demo/Working Demo State.md:12-34`, which claims dashboard navigation, schedule, booking, and roster flows are verified working for the current demo.

**Correction required:** seed a valid migration/readiness row for the demo workspace (or deliberately use a separate onboarding fixture), and ensure the documented credentials and E2E fixture target the same operational state.

### 5. The connected demo E2E is still red after bypassing readiness

For diagnostic purposes only, QA inserted a readiness row into the disposable database and reran `tests/e2e/flowstate-demo.spec.ts`. The flow progressed through owner login, member booking, public trial booking, roster visibility, and attendance submission, then failed because it tried to mark attendance for `2026-07-27` while the test ran on `2026-07-21`.

The UI returned the correct error: `Attendance can only be recorded for today or a past class date.` No attendance record was persisted. This restriction is also explicit in `docs/smoke_test_checklist.md:210-212`.

**Correction required:** make the E2E use a today/past attendance occurrence or split future booking from attendance verification. Do not weaken the production future-attendance guard to satisfy the test.

### 6. Migration history is replayable but not schema-equivalent

On the disposable database:

- `prisma validate`: exit 0.
- `prisma migrate status`: exit 0; 14 migrations; up to date.
- `prisma migrate diff --from-url [REDACTED] --to-schema-datamodel prisma/schema.prisma --exit-code`: non-zero.

Prisma reported index-name drift:

```text
[*] Changed the `form_signing_requests` table
  [*] Renamed index `form_signing_requests_workspaceId_status_createdAt_idx`
      to `form_signing_requests_workspaceId_signerEmail_status_idx`

[*] Changed the `workspace_settings` table
  [*] Renamed index `workspace_settings_dropInPunchPaymentMethods_idx`
      to `workspace_settings_workspaceId_idx`
```

The diff command's raw exit was 2, surfaced by pnpm as exit 1.

**Correction required:** add/repair migrations so replayed history and `schema.prisma` are semantically equivalent, then require a zero-exit schema-diff gate.

### 7. Migration handoff state is writable through the owner boundary

`apps/admin-web/app/dashboard/migration/actions.ts` exposes both `updateMigrationStageAction` and `markMigrationReadyAction` after only `requireOwnerWorkspaceContext()` (`:61-92`, `:116-143`). The underlying operations write arbitrary valid migration stages and mark `COMPLETE`/operationally ready without validating import blockers or a distinct internal Flowstate authorization (`apps/admin-web/lib/workspace-migration.ts:2092-2168`).

The product ledger allows owner migration approval, but that is not equivalent to letting an owner mutate Flowstate's internal service/handoff state. CEO-reviewed packet `t_bbab9bc8` specifically calls for separating those boundaries and is currently frozen pending roadmap reconciliation.

**Correction required:** retain an owner review/approval action, but protect internal stage transitions and operational handoff with a distinct internal authorization and blocker validation.

### 8. Public-trial date options ignore the booking cutoff

`apps/member-web/lib/trial-booking.ts:202-216` builds the next four recurrence dates from weekday/time only. Submission regenerates the same options and accepts a matching date (`:608-652`). The path does not use `bookingCutoffMinutes`; the unit tests cover recurrence/timezone behavior but not before/after-cutoff boundaries.

**Correction required:** use the workspace-local occurrence start and `bookingCutoffMinutes` in both option generation and submission validation, with boundary tests on both sides of the cutoff. CEO-reviewed packet `t_5492e427` is frozen until roadmap reconciliation.

### 9. Schema breadth is not runtime completeness

Fresh parsing found 65 Prisma models and 48 enums. This verifies inventory, not implementation. For example, `ClassInstance` is exported by the DB package but has no direct application runtime/test use in the searched TypeScript/TSX source. Historical billing, attendance, and notes migration kinds are explicitly staged for review rather than production import (`apps/admin-web/lib/workspace-migration.ts:72-85`). Stripe still requires real external configuration and was not exercised with production credentials.

**Correction required:** canonical workflow rows must distinguish `implemented`, `partial`, `staged-only`, `schema-only`, `external-credential-bound`, `unverified`, and `missing`. Do not convert model presence or route presence into an end-to-end completeness claim.

### 10. Proposed packet board entries are not an approved backlog

Board inspection found the five implementation packets referenced by the recovery synthesis:

- `t_bbab9bc8` — blocked/frozen
- `t_5492e427` — blocked/frozen
- `t_b2b7f074` — blocked/frozen
- `t_f6e91ecb` — blocked/frozen
- `t_0810eec9` — remains `todo`, but its CEO comment also says not to treat it as canonical execution backlog

The freeze instruction says the packets are non-canonical review inputs and must not be implemented until roadmap reconciliation and CEO approval. Therefore the claim that the recovery restored an executable backlog is false at this review point.

**Correction required:** reconcile proposed packets against approved roadmap/epics, define merge order and acceptance gates, then obtain explicit CEO approval before changing status to executable work.

## Claim reconciliation summary

| Claim | Independent result | Required wording now |
|---|---|---|
| Canonical workflow matrix and audit exist | **Disproved** | Both exact files are missing. |
| Repository gates are green | **Disproved** | Lint/type/unit pass; canonical root build and clean E2E discovery fail. |
| Current demo is operational | **Disproved** | Seeded owner is migration-gated; connected E2E fails. |
| Migration-first onboarding exists | **Verified, scoped** | Onboarding E2E passes with a generated-client workaround; internal handoff authorization remains unsafe. |
| Migration history is clean | **Partial** | All 14 migrations replay, but schema diff is non-zero. |
| Demo seed is idempotent | **Partial** | Logical counts are stable, but each run recreates IDs and no readiness row is seeded. |
| One-location MVP shape is enforced | **Verified** | `Location.workspaceId` is unique. |
| Schema equals implemented product | **Disproved** | Schema-only/staged-only and external-bound areas remain. |
| Five recovery packets form an executable backlog | **Disproved** | CEO froze them as non-canonical review inputs. |
| Working Demo State is current | **Disproved** | It says root build and connected operations pass; current fresh evidence says otherwise. |

## Evidence / technical details

### Environment and scope

- Host: Windows 10 / Git Bash command environment.
- Node used: `v24.5.0`.
- pnpm used for QA: `10.33.0` via `npx --yes pnpm@10.33.0`.
- Git: `main` at `4dd55571d33814b687588163b53e48d7155ecfa4`; same as `origin/main` at review time.
- Worktree was dirty before this report. Existing tracked modifications, deletions under tracked `node_modules`, untracked agent documentation, recovery reports, and task worktrees were preserved.
- No production credentials, Stripe calls, remote push, merge, or deployment were used.
- Disposable PostgreSQL container: `hitlink-finalqa-t42` on a non-default local port; removed after testing. Connection data is `[REDACTED]`.
- QA-started servers on ports 3000-3002 were stopped; all three ports were non-responsive after cleanup.
- No new user-visible UI candidate was under review; responsive screenshot acceptance is therefore not applicable. The onboarding E2E did exercise its existing desktop screenshot assertions, but temporary diagnostics were removed during cleanup.

### Fresh command results

| Command | Result |
|---|---|
| `npx --yes pnpm@10.33.0 exec turbo run lint check-types test --force --output-logs=errors-only` | Exit 0; 29/29 tasks; 0 cached. |
| `npx --yes pnpm@10.33.0 exec turbo run test --force` | Exit 0; auth 7 + admin 126 + member 29 = 162 passing executable tests; 11/11 package test tasks. |
| `npx --yes pnpm@10.33.0 run build` | Exit 1; 0/4 application build tasks succeeded through root orchestration. |
| `npx --yes pnpm@10.33.0 --dir apps/admin-web exec next build` | Exit 0; 26 static pages generated plus dynamic routes. |
| `npx --yes pnpm@10.33.0 --dir apps/member-web exec next build` | Exit 0; 13 static pages generated plus dynamic routes. |
| `npx --yes pnpm@10.33.0 --dir apps/landing-web exec next build` | Exit 0; 3 static pages generated. |
| `npx --yes pnpm@10.33.0 --dir apps/api exec next build` | Exit 0; API health route compiled. |
| Clean Git archive + `CI=true npx --yes pnpm@10.33.0 install --frozen-lockfile` | Exit 0 with ignored-build-script warnings; non-CI install stopped at modules purge prompt. |
| Clean archive `CI=true npx --yes pnpm@10.33.0 exec playwright test --list` | Exit 1; Prisma client module missing; 0 tests discovered. |
| Fresh database `prisma migrate deploy` | Exit 0; all 14 migrations applied. |
| `prisma migrate status` | Exit 0; database schema reported up to date. |
| `prisma migrate diff ... --exit-code` | Non-zero; two index renames reported. |
| `node packages/db/prisma/seed-demo.mjs` twice | Both exit 0; stable logical counts; `workspace_migration=0` both times. |
| Targeted Chromium E2E after local generated-client workaround | 1 passed (`migration-first-onboarding`), 1 failed (`flowstate-demo`) at migration redirect. |
| `flowstate-demo` after diagnostic readiness insertion | 1 failed at future attendance; no attendance record persisted. |

### Inventory

- Prisma models: 65.
- Prisma enums: 48.
- Checked-in migration SQL files: 14.
- Tracked files under `node_modules`: 17.
- Required canonical recovery files: 0 of 2 present.

## Final decision

**BLOCKED.** The passing component gates are useful evidence, but they do not overcome the missing canonical recovery artifacts, red root/clean-E2E gates, non-operational demo seed, red connected flow, schema drift, unsafe migration handoff boundary, or frozen non-canonical implementation packets. No recovery `PASS` should be recorded against this candidate.
