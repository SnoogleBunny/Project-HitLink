# HitLink v1.3 test audit — 2026-10-26

Source checkout: `/Users/jackypham/Documents/Project HitLink Latest`.
This is an audit of maintained source and test entrypoints, not a production certification. A fresh schema 55 browser run completed all 60 configured cases with expected outcomes, zero unexpected failures, skips or flakes. The exact schema 55 distribution-image package suite, lint and package/E2E type checks passed without source mounts. Its 1,015 admin, 290 member, 41 auth and 23 payments tests include actual isolated PostgreSQL coverage. Production smoke passes 51 route/width cases; clean Compose initialization and two scoped upgrade drills pass. Earlier failed/interrupted runs remain separate receipts. The approved specification has **219 inventory entries, 22 critical flows, and 37 reviewed mockup screens**; these are different inventories.

Source56 host follow-up: all12 uncached package tasks pass with isolated PostgreSQL enabled (1,116 admin,330 member,46 auth,52 payments), followed by all17 tooling checks. Full10-package and E2E types and all10 integrated lint tasks pass. Source56 has not yet passed its browser/build/distribution/populated-upgrade acceptance, and the running checkpoint remains55. The whole219/22 scope remains open.

Source58 host follow-up: after coaching policy/disclosure/archive integration and the narrow canonical-producer fixture repair, all12 uncached package tasks pass (1,194 admin,351 member,46 auth,52 payments) plus all17 tooling checks with zero skips. Full10-package/E2E types and10 lint tasks pass. The full run includes all77 earlier focused cases, now passing, with schema/client/lock/package/inventory/test hashes unchanged. This supersedes the failed focused fixture result for source58 host acceptance only. Current browser/build/distribution/populated-upgrade and whole219/22 acceptance remain open; the running image is55.

Source59 host follow-up: membership grace disposition is integrated with SQL-only migration59 and unchanged 146-model schema/client/inventory. Fresh final package execution passes all 12 uncached tasks (1,238 admin, 351 member, 46 auth, 52 payments), including all 27 new grace cases, plus all 17 tooling checks with zero skips. Full package/E2E types and lint passed before a final test-only cleanup change; that file and its imports then passed fresh strict types/lint. The first full attempt passed every admin assertion but failed aggregate afterAll cleanup at the normal 10-second limit. Per-case canonical cleanup resolves it without changing production, assertions or shared timeouts. Earlier failure remains retained; final receipts and exact source hashes are in external `work/root-schema59-validation/`. Browser, distribution, worker/upgrade and full-product acceptance remain open; the main demo remains on the healthy schema55 image.

## Confirmed gate defects repaired

- `apps/api` and `apps/landing-web` previously printed “No tests yet” despite maintained tests. Their package test commands now run their app Vitest tests.
- The PostgreSQL-safe imported-record index regression existed but was absent from `@flowstate/db`'s test gate. It now runs with migration schema tests.
- Root `test` previously omitted Windows bootstrap and canonical Playwright execution-manifest regressions. It now runs `test:tooling` after Turbo; the tooling command includes both maintained files.
- Integration files conditionally skip without `TEST_DATABASE_URL`. New `test:integration` fails fast without that variable and runs all integration files, not only the old two-file migration command. Setting `TEST_DATABASE_URL` for root `test` also runs them.
- `@flowstate/payments` previously accepted zero tests. Direct checkout/provider-evidence tests now exist and its test command no longer passes an empty suite.
- Added member checkout status crafted-ID/payer/workspace isolation and payer credit-reservation projection regressions. These are unit evidence; the existing financial-adjustments suite supplies database evidence for payer scope.

## Critical-flow matrix

“Domain coverage” names maintained tests that exercise persisted rules, permissions, concurrency or provider adapters. A mocked provider adapter is not evidence of a live processor or inbox. “Browser gap” describes current maintained E2E source rather than October 16's historical verification narrative.

| Flow | Existing domain coverage | Current maintained browser coverage and remaining proof |
| --- | --- | --- |
| CF-01 Trial to paid member | `public-enrollment.integration`, `public-trials.integration`, `public-membership.integration`, `forms-signing.integration`; trial action/form units | Trial recovery UI and form/PDF boundaries exist. Missing one maintained browser journey linking verified trial, child authority, attendance and paid conversion with persisted confirmation. Live hosted checkout requires configured test/live provider evidence. |
| CF-02 Recurring class / exception | `class-schedule.integration`, `class-occurrences`, `class-templates`, `staff-leave.integration` | Maintained CF02 browser cases passed: create/review/commit daily recurrence, one-date exception, unchanged neighbor, stale preview and capacity-reduction rejection with existing seats retained. Absolute provider/real-device acceptance remains separate. |
| CF-03 Capacity / waitlist | `bookings`, `rosters`, `membership-allowances.integration`, `class-schedule.integration` | Maintained CF03 browser passed: full capacity prevents promotion; earliest eligible consented FIFO member promotes once after an opening, ineligible head records skip, exact notice persists. The18-case waitlist DB suite supplies race/cutoff/legacy-consent/current-form/maintenance proof; no live inbox delivery inferred. |
| CF-04 Roster / correction | `rosters`, `forms-signing.integration`, `membership-allowances.integration`, `program-progress.integration` | Maintained CF04 and AT06 browser cases passed: future/unsigned attendance rejects, present and reasoned correction survive reload, original ledger remains correct, bulk close touches only unresolved eligible bookings after class end and displays immutable history. Attendance has8 PostgreSQL cases plus existing roster/dashboard tests. |
| CF-05 Membership / first payment | `public-membership.integration`, `invoice-reconciliation.integration`, `durable-checkout.integration`; new payments evidence units | Forms and provider-unavailable boundaries are exercised. No maintained complete hosted first-payment browser journey in current source. Canonical payment/authorization tests remain essential. |
| CF-06 Notice / billing stop | `membership-lifecycle.integration`, `member-memberships`, `membership-plans` | Billing routes are opened. No dedicated browser acceptance/withdrawal/verified-stop journey. Processor stop and old-debt flags require provider evidence. |
| CF-07 Freeze / resume | `membership-lifecycle.integration`, `membership-allowances.integration` | No maintained focused browser finite freeze/resume/seat non-restoration journey. |
| CF-08 Failure / recovery | `invoice-reconciliation.integration`, `invoice-retry.integration`, `failed-payments`, `member-billing`; new payer/checkout units | Provider-unavailable controls are truthful. Missing maintained UI first-failure/grace → card update → canonical retry/recovery journey across independent invoices. |
| CF-09 Pack consumption | `membership-allowances.integration`, `durable-checkout.integration`, `legacy-checkout.integration`, `bookings`, `rosters` | Current `flowstate-demo` browser case commits book → move → cancel, verifies one debit and final restoration in PostgreSQL. It does not cover attendance/no-show/correction or paid purchase in the browser. |
| CF-10 Refund / credit | `financial-adjustments.integration`, `financial-adjustment-form`, `migration-entitlements.integration`; new payer-credit and payments units | Billing route/control checks exist. Missing maintained owner review → uncertain/successful result → credit availability browser journey. Live processor settlement is separate. |
| CF-11 Guardian waiver | `forms-signing.integration`, `forms`, `forms-domain`, `family-portal-access.integration`, `public-enrollment.integration` | Maintained CF11 browser passed: current guardian consent and exact child request/PDF, revoked permission rejection, changed version and cross-tab selected-member independence. The same member-scoped request is reauthorized before document retrieval/signing. |
| CF-12 Dry migration | `workspace-migration.integration`, `workspace-migration-operations.integration`, `migration-entitlements.integration`, migration schema/index regressions | `migration-first-onboarding` exercises upload/import/reconciliation/gating and immutable acknowledgement; all maintained onboarding cases pass in the fresh schema55 full browser run. Real-customer migration and operator cutover evidence remain separate. |
| CF-13 Cutover / rollback | `migration-cutover.integration`, `workspace-migration-operations.integration`, `workspace-migration.integration` | Onboarding E2E includes persisted completed handoff/new owner session. No maintained actual backup restore or external-effects compensation rehearsal; operator evidence is required. |
| CF-14 Offboarding / export | `workspace-data.integration`, `workspace-billing-handover.integration`, `workspace-retention.integration`, `member-data.integration` | Settings/data and individual records routes are opened. Missing maintained export download/receipt → billing handover → revoke browser journey. External backup/storage deletion requires named real receipts. |
| CF-15 Incident response | `workspace-data.integration` (audited support/revocation), `coaching.integration` (withdrawal/exceptional-read), maintenance route tests, browser diagnostics tests | Diagnostics intentionally prove browser errors fail tests. They do not prove monitoring, real incident communications, backup recovery targets or external-provider incident response; these require operational rehearsal. |
| CF-16 Coaching enrollment | `coaching.integration`, `coaching-payments` | Catalog opens only the coaching list. Missing selected-client accepted plan/enrollment/payment browser journey; focused role views are being implemented separately. |
| CF-17 Coaching delivery | `coaching.integration`, `staff-leave.integration`, `coaching-payments` | Focused appointment browser passed actual booking/cancel and one-unit outcomes. Full delivery/outcome, conflict and provider-absence UI acceptance remains open; domain tests cover exact slot/unit conflicts and rollback. |
| CF-18 Coaching changes | `coaching.integration`, `financial-adjustments.integration` | Focused appointment cancellation browser passed. Timely/late move, disputed delivery, provider absence and no-show/grace UI acceptance remain open; domain tests cover atomic replacement failure and original unit consequences. |
| CF-19 Plan / daily notes | `coaching.integration` (draft/private/publish/history/withdrawal/authorization/export), `notification-outbox.integration` | Focused coach draft→explicit publication→named client read→My program navigation and owner/private isolation browser passed with strict diagnostics. Accepted enrollment/plan revisions, withdrawal/incident and live notice delivery remain separate acceptance boundaries. |
| CF-20 Continuity | `coaching.integration`, session revocation tests in `packages/auth/src/session.test.ts` | Missing maintained departure → immediate denial → adult-accepted replacement/history-scope → resume browser journey. |
| CF-21 Closure / records | `coaching.integration`, `member-data.integration`, `workspace-data.integration`, `workspace-retention.integration` | Missing maintained focused service closure independent of pending settlement/export and retrieval-window UI journey. |
| CF-22 Capped member booking | `membership-allowances.integration` (last-unit races, dual caps, windows, moves, originals), `family-portal-access.integration`, self-service booking/action tests | Maintained independent family browser passed: two verified siblings use distinct accepted weekly/monthly allowances, attributed guardian booking/cancellation, revoked grant removal and unchanged account/payer scope. Database assertions establish each beneficiary’s original allocation; no shared household pool is inferred. |

## Stale browser ledger

`tests/e2e/every-visible-feature-ledger.json` is a prior feature-control inventory (263 controls), not the 219 specification inventory. It still names three test titles absent from current `flowstate-demo.spec.ts`:

- `EVF-ADMIN-CONNECTED`: `admin, member, public trial, and API flows are connected`
- `EVF-MEMBER-SCHEDULE-RECOVERY`: `a lower schedule action keeps its pending and failure feedback in context`
- `EVF-MEMBER-SCHEDULE-RESPONSIVE`: `member schedule actions remain readable and responsive`

The execution-manifest verifier correctly refuses unmatched scenarios. Do not change titles alone to imply that a narrower current case establishes the older broader assertions. Either restore meaningful current journeys and map them or mark/review the changed inventory explicitly. A route/control catalog is useful layout evidence, not completion of every transactional flow.

## Exact commands

Use Node 22 and pnpm 10.33.0. From the Latest checkout, after migrated isolated PostgreSQL and Prisma generation:

```sh
# Put the actual Node 22 bin directory first on PATH.
# Supply DATABASE_URL and TEST_DATABASE_URL through the execution environment.
# Also supply disposable FORMS_MAGIC_LINK_SECRET, HITLINK_WORKER_SECRET and
# HITLINK_AUTH_THROTTLE_SECRET values; the Compose checks profile sets them.
TURBO_FORCE=true corepack pnpm test
corepack pnpm test:integration
corepack pnpm lint
corepack pnpm check-types
corepack pnpm build
```

`test:integration` is an explicit integration-only gate. It is unnecessary to rerun it after a complete uncached `test` with `TEST_DATABASE_URL` unless changes or failures justify it. The integration suites share one PostgreSQL database: root package tasks run sequentially, and admin/member use one file worker when that variable is set. This isolates unrelated fixtures and PostgreSQL predicate conflicts. Individual race tests still create their intended simultaneous transactions; their assertions are unchanged.

For E2E, use an explicitly disposable demonstration database, its required safety acknowledgement/name, and the canonical reset/build path. The default `test:e2e` resets demo data. Keep E2E database separate from the integration database when running concurrently. Set screenshot/report/output directories outside the repository per this task's constraint. Live Stripe, email, scheduler, legal business details and backups require separate actual configuration and verification.

## Fresh focused results

Node 22 focused checks passed: member unit regressions 11/11; API health 3/3; landing waitlist 7/7; database schema/index 6/6; tooling/canonical harness 17/17. New integration-only guard exits 1 with a clear `TEST_DATABASE_URL is required` message when the variable is absent. Root owns the fresh complete database suite and application builds. Payments direct tests and coaching UI changes are tracked separately as they complete.

## Subsequent verified repairs — October 26

- Both portals now pass three account-recovery browser cases, including generic requests, expired/reused fragments, password/session replacement, sign-out-all and mobile heading contrast. Auth domain coverage includes failed-storage secrecy and terminal outbox bearer purging.
- Staff role/deactivation and last-owner protection passed 15 focused checks, including immutable audit and reviewed purge. Locale now flows through actual workspace presentation while machine keys and accepted amounts stay canonical; final combined counts are recorded in `web-app-completion.md`.
- Member archival browser passed reviewed debt/unit retention, directory removal, reload and reactivation without new membership or pack. Timezone owner browser proof passed after correcting its 303-response acknowledgment; 69 affected domain/UI-action/render checks also pass.
- Schema 43 retention/business exports passed 13 checks and individual archives 11. A local fictional PostgreSQL restore matched 133 tables/142 rows; see `local-operations.md` for scope and actual commands.

Schema-51 full uncached gate passed all 12 package tasks: 827 admin, 290 member, 41 auth and 23 payment assertions, plus the other packages and all 17 tooling checks. Full lint and package/E2E types passed. New class-rule, profile/emergency and confirmation/retry browser cases passed in the 55-case full run plus focused repairs. Latest exact file/title/project reconciliation is55/55 expected, zero skipped/flaky/unexpected; this is combined evidence, not a new single55-case green run or55business flows. The final schema-51 distribution image separately passed all12 package tasks (832admin/290member), lint/types and tooling without source mounts; only its documented missing-Git-index check skipped. Payment disputes, confirmations and same-message retry now have domain implementations, while practical trial follow-up, scheduled-form recovery, other notification producers and operational/provider acceptance remain open in `workflow-acceptance-register.md`. These checks do not certify all 219 outcomes.
