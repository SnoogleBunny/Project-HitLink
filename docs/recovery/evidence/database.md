# Flowstate recovery evidence — database

Audit date: 2026-07-20
Kanban task: `t_fd5e3004`
Role: Database
Repository state inspected: `main` at `4dd5557` (`feat: add migration-first onboarding operations`)
Allowed scope: evidence only; no product schema, migration, seed, or operational code was changed.

## Data outcome

Flowstate has a substantial PostgreSQL/Prisma foundation for one-location operations. The database enforces one `Location` per `Workspace`, protects many row identities with foreign keys and unique indexes, separates migration staging from operational tables, and can replay all 14 committed migrations from an empty PostgreSQL 16 database. This enables a credible controlled demo and gives recovery work a concrete implemented source of truth.

It is not yet safe to treat the current persistence layer as pilot-ready. The most consequential integrity gaps are:

1. production import writes are not atomic and can leave a failed job with partially committed operational data;
2. tenant-bearing relations do not enforce that both rows belong to the same workspace;
3. class capacity is an application count-then-write rule, not a database invariant, and trial booking bypasses that capacity path;
4. `ClassInstance` is persisted in schema/migrations but is unused by runtime code and seed data;
5. multi-row membership, billing, webhook, and ledger transitions are often not transactional;
6. a database freshly replayed from committed migration history differs from `schema.prisma` by one index name;
7. the demo seed has no non-production guard and deletes by a non-unique workspace name/fixed demo emails.

Why it matters: these gaps can produce cross-gym references, oversubscribed classes, partial imports, missing or duplicate financial audit rows, and a dated-class record that disagrees with what owners, coaches, and members actually see.

**Recovery verdict: needs revision before a live pilot.** The schema is broad and replayable, but integrity and operational transaction boundaries need approved, migration-safe repair plus real PostgreSQL integration coverage.

## Evidence rules

- **Observed fact** means directly present in the current schema, ordered migration SQL, seed/runtime source, tests, Git state, or a disposable PostgreSQL verification performed in this audit.
- **Inference / risk** means a likely consequence of observed behavior. It is not a claim that a production incident has occurred.
- The current Prisma schema is the source of truth for the implemented client shape. Ordered SQL migrations are a separate source of truth for deploy history.
- No live, production, shared developer, or customer database was inspected. `prisma migrate status` and catalog findings below refer only to disposable audit databases.
- Product and roadmap documents were used to identify intended behavior and contradictions, not to override implemented shape.

## Sources inspected

Required operating and product context:

- `.hermes.md`
- `README.md`
- `CLAUDE.md`
- `docs/product_decisions_ledger.md`
- `docs/01-decisions/Business Decision Log.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/04-demo/Working Demo State.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/Database.md`

Database and implementation evidence:

- complete `packages/db/prisma/schema.prisma`
- all 14 `packages/db/prisma/migrations/*/migration.sql` files and `migration_lock.toml`
- `packages/db/prisma/seed-demo.mjs`
- `packages/db/src/client.ts`, `index.ts`, `occurrences.ts`, `class-access.ts`, `forms.ts`, and `notification-outbox.ts`
- database-facing admin/member libraries, especially migration, scheduling, booking, roster, membership, commerce, forms, and Stripe paths
- all 33 tracked `*.test.ts` files plus existing E2E specs by inventory
- current Git branch, HEAD, status, and database-focused diff
- Kanban task `t_fd5e3004`

## Implemented data shape

### Inventory

Observed from `schema.prisma` and a fresh migration replay:

- 48 Prisma enums
- 65 Prisma models
- 65 public application tables after replay, excluding `_prisma_migrations`
- PostgreSQL provider recorded in `migration_lock.toml`
- 151 foreign keys in the disposable replay database
- zero composite foreign keys
- one explicit `CHECK` constraint: `staff_invites_status_timestamps_check`

### Operational domains represented

The implemented schema covers:

- identity and access: `User`, `Session`, `Workspace`, `WorkspaceUser`, `StaffInvite`, and workspace settings;
- one-location facilities: `Location`, `Room`, `Program`, recurring `ClassTemplate`, and persisted `ClassInstance`;
- member/family operations: `Member`, `Guardian`, `FamilyLink`, bookings, waitlist, attendance, trials, and progress models;
- access and membership: membership plans/restrictions, member memberships, punch cards, drop-ins, access idempotency, and billing state;
- financial depth: billing records, invoices/line items, payments, refunds, account credits/rules, failed-payment cases, and Stripe event/settings state;
- forms: versioned documents, requirements, signature requests, and signed documents;
- communications/reliability: conversations, messages, announcements, notification preferences/jobs, email templates, audit logs, idempotency records, and integration deliveries;
- optional operations: events and private lessons;
- migration operations: workspace migration status, import jobs/source files, staging rows, validation issues, reconciliation reports, and imported-record identities.

### One-location shape

**Observed protection:** `Location.workspaceId` is unique (`schema.prisma:487-489`), so one workspace cannot persist two location rows. Rooms belong to that one location. Current owner/operations code consistently obtains a primary location and does not introduce a location switcher.

**Observed nuance:** multiple rooms inside the one location are supported and the demo seed enables `allowMultipleRooms`. This does not introduce multi-location architecture and is consistent with approved MVP scope.

### Operational versus schema-only models

Observed application delegate usage shows the active application uses recurring templates plus a date for schedule, booking, roster, waitlist, and attendance. It also primarily uses `MemberMembership`, `MembershipBillingState`, and `BillingRecord` for billing operations.

No runtime `.classInstance` or `classInstanceId` reference was found in application/package TypeScript, and the demo seed does not create one. No direct Prisma delegate usage was found for the deeper `Invoice`, `InvoiceLineItem`, `Payment`, `Refund`, `AccountCredit`, `CreditRule`, or `FailedPaymentCase` models. Those models are implemented persistence shape, not the current operational ledger.

## Ordered migration history

All committed SQL migrations were inspected in lexical/application order:

| Order | Migration | Implemented change |
| --- | --- | --- |
| 1 | `20260404043358_init_phase2_slice1` | users, workspace, unique primary location, rooms, workspace users/settings, initial invites |
| 2 | `20260404045000_auth_sessions_phase3` | sessions and auth constraints |
| 3 | `20260404050000_email_and_invite_constraints` | case-insensitive email/invite indexes and invite state constraint |
| 4 | `20260405090000_programs_and_room_archival` | programs and room archive fields |
| 5 | `20260406120000_class_templates_schedule_slice` | recurring class templates |
| 6 | `20260407120000_member_trial_booking_slice` | members, guardians, family links, initial trial booking |
| 7 | `20260408120000_booking_roster_attendance_slice` | class bookings and attendance; retires initial trial-booking table |
| 8 | `20260408130000_memberships_billing_slice` | membership plans/assignments, billing records/state, Stripe settings/events |
| 9 | `20260408220000_member_portal_slice` | member-to-user portal linkage |
| 10 | `20260409160000_access_products_waitlist_slice` | punch cards, drop-ins, restrictions, waitlist, access idempotency |
| 11 | `20260410120000_forms_signing_slice` | form documents/versions/requirements/signature records |
| 12 | `20260425120000_reliability_foundation` | class instances plus financial, migration, progress, messaging, notification, event, private-lesson, audit, and integration depth |
| 13 | `20260524030800_index_name_alignment` | renames six PostgreSQL-truncated indexes to Prisma-expected names |
| 14 | `20260530120000_migration_first_onboarding_ops` | workspace migration service state and imported-record identities |

### Fresh replay result

Observed on a disposable PostgreSQL 16 container/database:

- `prisma migrate deploy` discovered and applied all 14 migrations in order;
- exit code `0`;
- final output: `All migrations have been successfully applied.`;
- `prisma migrate status` then reported 14 migrations and `Database schema is up to date!` with exit code `0`.

This proves fresh replay of committed history in the disposable environment. It does not prove an existing deployment has no failed, edited, missing, or manually applied migrations.

### Schema-versus-migration drift

Observed after the fresh replay:

```sql
-- RenameIndex
ALTER INDEX "migration_imported_records_workspaceId_importedModel_importedRe"
RENAME TO "migration_imported_records_workspaceId_importedModel_import_idx";
```

`prisma migrate diff --exit-code` returned `2`, meaning a non-empty diff. PostgreSQL truncates the 73-character index name authored by the newest migration to the 63-character physical name ending in `importedRe`; current Prisma expects the shortened name ending in `import_idx`.

**Impact:** data and query semantics are unchanged, but migration history and current Prisma shape are not name-clean. A future generated migration or drift check can repeatedly propose the rename. The immediately preceding `index_name_alignment` migration fixed the same class of problem for earlier indexes, but the newest migration reintroduced it.

**Recommended repair:** create a forward migration containing the reviewed rename after Backend/Workflow coordination and QA verification. The reverse operation is a rename back, but normal recovery should stay forward-only. This is not a reason to edit or squash committed migration history.

## Integrity and transaction findings

### DB-01 — High: production import can partially commit a failed job

**Observed facts**

- CSV upload/staging creation is correctly grouped in a transaction (`workspace-migration.ts:1784-1896`).
- `runMigrationImport` marks a job `IMPORTING`, then iterates ready staging rows and calls per-kind operational import functions outside a surrounding transaction (`workspace-migration.ts:1908-2042`).
- Reconciliation creation, `COMPLETED`, and migration-stage update are separate writes (`workspace-migration.ts:2044-2064`).
- On exception, the code changes only the job to `FAILED` and returns an error (`workspace-migration.ts:2070-2088`); it does not roll back earlier row imports.
- Imported identity uniqueness provides useful retry/idempotency support, but it does not make the whole job atomic.
- There is no compare-and-swap claim that prevents two import calls from observing the same eligible job and running concurrently.

**Inference / risk**

A failure after one or more rows commit can leave a `FAILED` job whose members, memberships, products, templates, or imported identities already exist. Retry may reconcile some rows, but operators cannot assume failure means “no operational change.” Concurrent runs can also race on identities and summaries.

**Recovery requirement**

Choose and document a transaction/restart model before representative pilot migration: either a job-level transaction with bounded size, or explicit per-row checkpoints with resumable state, durable counts, compare-and-swap job claiming, and reconciliation that distinguishes committed, skipped, failed, and compensated rows. Exercise forced failure and retry against PostgreSQL. Material workflow changes require Backend and Workflow coordination, QA verification, and CEO approval where migration promises or cutover semantics change.

### DB-02 — High: workspace columns and relation targets can disagree

**Observed facts**

- The replay database has 151 foreign keys, all single-column; it has no composite foreign key that includes `workspaceId` plus the referenced id.
- Many rows persist both `workspaceId` and references to other tenant rows. Examples include `ClassTemplate` -> `Program`/`Room`/coach `WorkspaceUser`; `ClassBooking` -> `Member`/template/instance/access product; attendance/waitlist; memberships; billing; forms; and migration records.
- Application helpers generally validate workspace ownership before writing. That is valuable application protection, not a database invariant.
- A transaction-scoped disposable SQL test successfully inserted a workspace-1 class template pointing to a workspace-2 program, room, and coach. The test rolled back and a follow-up query confirmed zero audit workspaces remained.

**Inference / risk**

A missing application filter, future importer defect, maintenance script, or direct database write can create cross-gym joins while every individual foreign key remains valid. Such rows can leak or misattribute schedule, access, billing, or form data depending on query shape.

**Recovery requirement**

Inventory tenant-bearing relations, classify which require same-workspace enforcement, audit existing data before constraints, then add composite unique targets/FKs or another approved database-enforced tenancy pattern in small migrations. Do not add speculative multi-location keys; preserve one location per workspace. Coordinate the contract with Backend and verify cross-tenant rejects in QA against PostgreSQL.

### DB-03 — High: class capacity is not concurrency-safe at the database boundary

**Observed facts**

- `createAccessBackedBooking` uses an interactive Prisma transaction (`class-access.ts:1084-1100`). Inside it, active bookings are counted (`class-access.ts:868-874`) and the booking is written later (`class-access.ts:909-1014`).
- No explicit isolation level, row lock, advisory lock, capacity ledger, or serializable retry was found.
- The disposable PostgreSQL instance reported default isolation `read committed`.
- The database has duplicate-member occurrence uniqueness, but no constraint limiting total active rows to room/template capacity.
- A transaction-scoped SQL probe inserted two non-cancelled bookings for one capacity-one occurrence. The count returned `2`; the probe then rolled back.
- Admin trial booking performs duplicate lookup followed by update/create without the class-access capacity count (`apps/admin-web/lib/bookings.ts:453-524`). Public trial options and creation likewise do not count active seats (`apps/member-web/lib/trial-booking.ts:249-357, 620-700`).

**Inference / risk**

Unless the deployed database is configured more strictly than the code expresses, concurrent bookings by different members can both observe an available seat and commit, oversubscribing the class. Trial bookings can exceed capacity even without concurrency. Waitlist promotion uses the same count-first pattern and can race with new bookings or another promotion.

**Recovery requirement**

Define one database-backed capacity arbitration strategy—such as a locked/materialized class instance, serializable transaction with bounded retry, or atomic seat allocation—and route membership, punch-card, drop-in, admin trial, public trial, and waitlist promotion through it. Add real PostgreSQL race tests; mocked unit tests are insufficient.

### DB-04 — High: `ClassInstance` exists but is operationally dormant

**Observed facts**

- `ClassInstance` exists in Prisma (`schema.prisma:753-787`) and was added by `20260425120000_reliability_foundation`.
- It can store a concrete date, one-off title/room/coach/time/capacity/cutoffs, status, cancellation reason, and reschedule source. It is unique by workspace/template/date.
- `ClassBooking`, `AttendanceRecord`, and `WaitlistEntry` have nullable `classInstanceId` relations while retaining template/date uniqueness.
- Source searches found zero application/package TypeScript references to `.classInstance` or `classInstanceId`.
- `seed-demo.mjs` does not create instances.
- `packages/db/src/occurrences.ts` and current application flows synthesize dates from `ClassTemplate`; the effective identity remains `workspaceId + classTemplateId + scheduledForDate`.
- `docs/domain_model.md` says class instances are not persisted, which is stale relative to schema/migrations but accurate about current runtime behavior.

**Inference / risk**

Rows inserted into `class_instances` would not affect current scheduling, booking, trial, roster, waitlist, or attendance behavior. A one-off cancellation, reschedule, substitute, room/time/capacity override, or recurring-template edit can therefore disagree with existing dated bookings and actor views. The model is not missing from the database; the missing piece is an approved operational source-of-truth transition.

**Recovery requirement**

Backend, Workflow, Database, QA, and CEO should first approve whether `ClassInstance` becomes the canonical dated-class identity. A migration-friendly rollout should avoid a destructive cutover: define deterministic materialization/upsert, backfill relevant dated records, dual-read or dual-write during transition, attach bookings/waitlist/attendance, reconcile unmatched dates, then enforce non-null/uniqueness only after QA proves owner/coach/member agreement. Do not drop template/date columns until rollback and historical-query needs are resolved.

### DB-05 — Medium-high: membership, billing, and webhook transitions can split

**Observed facts**

- Membership assignment creates `MemberMembership` with nested `MembershipBillingState`, then writes `BillingRecord` separately (`member-memberships.ts:543-577`).
- Freeze/clear/cancel flows update membership, billing state, and billing record in separate calls (`member-memberships.ts:726-945`).
- Stripe webhook invoice processing separately upserts billing state, updates membership, appends `BillingRecord`, and finally marks `StripeWebhookEvent` processed (`stripe-billing.ts:950-1059, 1205-1265`).
- `StripeWebhookEvent.stripeEventId` is unique, but `BillingRecord.stripeEventId` is indexed rather than unique.
- The richer invoice/payment/refund/credit models are not the active application ledger.

**Inference / risk**

A process/database failure between calls can leave state without its audit record, an audit record without final event status, or a replay that appends duplicate billing records. External Stripe actions cannot be rolled back with PostgreSQL, so explicit idempotent state-machine boundaries are required rather than a single long transaction around network calls.

**Recovery requirement**

Choose the canonical local ledger, document state transitions, isolate external calls from short local transactions, add dedupe keys for append-only effects, and test crash/replay at every boundary. Do not activate schema-only invoice/refund/credit tables opportunistically without an approved ledger migration and reconciliation plan.

### DB-06 — Medium: value-domain constraints are mostly application-only

**Observed facts**

- The disposable catalog contains one explicit `CHECK` constraint, for staff-invite state/timestamps.
- Prisma types, enums, nullability, unique indexes, and FKs protect structure, but no database checks enforce positive capacities/prices/punch counts, valid time ordering, date ordering, remaining punches <= original punches, or financial arithmetic.
- A transaction-scoped SQL probe accepted a `ClassTemplate` with end time before start time, negative capacity, and negative booking/cancellation cutoffs; it was rolled back.
- Application form parsers reject many such values on normal UI paths.

**Inference / risk**

Importers, maintenance scripts, new code paths, race recovery, or direct writes can persist states that normal forms reject. Financial and balance errors can then spread into eligibility, reporting, or reconciliation.

**Recovery requirement**

Prioritize checks where invalid values have high blast radius and low legitimate ambiguity: non-negative money/counts, time bounds/order, punch-card balance bounds, and date ordering. Audit/backfill first; add constraints as `NOT VALID` then validate where PostgreSQL/version strategy permits. Preserve business-policy rules in application code when they cannot be expressed as stable row-local checks.

### DB-07 — Medium: migration lineage is partly polymorphic and unenforced

**Observed facts**

- Staging/import tables are separate from operational models. This is the correct broad boundary.
- `MigrationImportedRecord.importJobId` and `stagingRecordId` are nullable strings without Prisma relations/FKs to `ImportJob` or `StagingRecord` (`schema.prisma:1552-1571`).
- `importedModel + importedRecordId` is intentionally polymorphic and cannot use a normal FK.
- Production import currently supports only `MEMBER`, `MEMBERSHIP_PLAN`, `MEMBER_MEMBERSHIP`, `PUNCH_CARD_BALANCE`, `DROP_IN_PRODUCT`, and `SCHEDULE_TEMPLATE` (`workspace-migration.ts:89-96`). Billing history, attendance, and notes are staged for review only; other enum kinds have no current upload option.

**Inference / risk**

Lineage ids can dangle or refer to the wrong job/staging row, and reconciliation cannot rely on the database to prove imported-record provenance. Product documents can overstate migration breadth if schema enum presence is mistaken for production import support.

**Recovery requirement**

Add ordinary FKs for job/staging lineage if retention rules allow, or document why lineage must survive source deletion and preserve immutable source identifiers another way. Validate imported-model identities in reconciliation code. Keep review-only staging separate from operational writes.

### DB-08 — Medium-high: demo seed safety depends on operator discipline

**Observed facts**

- `seed-demo.mjs` has no production/environment/database-name allowlist or explicit confirmation.
- `removePreviousDemoData` uses `findFirst` on the non-unique workspace name `Demo Flowstate Gym`, deletes that workspace with cascades, then deletes users by fixed demo emails (`seed-demo.mjs:75-103`).
- The seed operations are not wrapped in one transaction.
- `db:seed` loads the repository `.env` when present, so its target is whichever database URL that environment supplies.
- The seed logs known demo credentials (`seed-demo.mjs:369-371`).
- Seed coverage is useful but narrow: one workspace/location, owner and customer users, settings, one program/room/template, one member/membership/billing state, access products/card, one form/version, and one staff invite.
- It does not seed `ClassInstance`, bookings/attendance/waitlist, migration staging/reconciliation, canonical invoice/payment/refund/credit rows, events/private lessons, progress, or communications.

**Inference / risk**

An accidental seed against a non-demo database can delete a real workspace that happens to share the demo name and can leave partial fixtures if creation fails. The seed cannot by itself prove newer migration, occurrence, concurrency, or deep-ledger behavior.

**Recovery requirement**

Require an explicit demo-seed opt-in plus a database/environment allowlist, use immutable demo identifiers or a dedicated fixture namespace rather than non-unique name matching, group local data replacement in a transaction where practical, and test on a disposable database. Never run it with production credentials.

## Existing protections worth preserving

The recovery should preserve, not replace, these observed safeguards:

- unique location per workspace;
- case-insensitive user/member/invite email indexes where implemented;
- staff-invite status/timestamp `CHECK`;
- unique member/template/date booking, attendance, and waitlist identities;
- one current membership slot per workspace/member;
- unique Stripe webhook event identity;
- unique signature/request/version relationships;
- unique import source row and imported external identity keys;
- explicit application workspace filters and role checks;
- optimistic `updateMany` balance/state guards in punch-card and booking operations;
- staging/validation/reconciliation tables separate from operational records;
- cascade/restrict/set-null choices that generally preserve historical references or clean a deleted workspace.

## Test and implementation coverage

### Source inventory

- 33 tracked `*.test.ts` files
- 162 tracked `it(...)`/`test(...)` cases across those files
- zero test files under `packages/db`
- `@flowstate/db`'s `test` script runs Prisma validation only
- no tracked test imports `PrismaClient`, supplies `DATABASE_URL`, or invokes migration/database commands
- database-facing app tests inject mocked database interfaces; they validate branch behavior, not PostgreSQL constraints, isolation, locks, cascades, or migration replay

Targeted unit-test inventory includes:

- class access: 5 tests
- admin bookings: 6 tests
- rosters: 5 tests
- member memberships: 6 tests
- Stripe billing: 3 tests
- workspace migration: 4 tests
- public trial booking: 9 tests
- member self-service booking: 7 tests

### Commands actually executed

| Command/check | Real result |
| --- | --- |
| `pnpm run db:validate` in `packages/db` | exit `0`; `The schema at prisma\schema.prisma is valid` |
| standard `pnpm run db:generate` | failed twice with Windows `EPERM` renaming a locked `query_engine-windows.dll.node` |
| `PRISMA_CLIENT_ENGINE_TYPE=binary pnpm exec prisma generate --schema prisma/schema.prisma` | exit `0`; Prisma Client 6.19.3 generated with binary engine |
| disposable `prisma migrate deploy` | exit `0`; all 14 migrations applied from empty PostgreSQL 16 |
| disposable `prisma migrate status` | exit `0`; 14 migrations, database reported up to date |
| disposable migration-to-schema diff | exit `2`; exactly one index rename shown above |
| disposable catalog inspection | 65 application tables, 151 FKs, 0 composite FKs, 1 explicit check |
| disposable rollback probe | cross-workspace/invalid template accepted; two bookings accepted for capacity one; transaction rolled back; zero probe workspaces remained |
| `pnpm --filter admin-web test` | 25 files, 126 tests passed |
| `pnpm --filter member-web test` | 7 files, 29 tests passed |
| root `pnpm run test` | 11/11 Turbo tasks successful, but output was cache replay; direct app runs above are the current execution evidence |

The standard Prisma library-engine generation failure is an environment/tooling blocker, not a schema validation failure. The binary-engine generation proves client code generation can complete without the locked DLL. The process holding the library engine was not killed because it may belong to unrelated work in the already-dirty workspace.

No Playwright/E2E suite, live Stripe call, email action, demo seed, destructive reset, production database command, commit, push, deploy, or customer-data operation was performed.

## Rollback and data-risk reasoning

This audit changed no schema, migration, seed, or operational source file. Disposable SQL probes ran inside explicit transactions and rolled back. Both disposable databases and their Docker container were removed (`AUDIT_CONTAINER_REMOVED`). No data rollback is required for the audit itself.

Future repairs should be forward-only and independently reversible:

1. **Index-name drift:** forward rename; rollback is reverse rename. Review lock behavior and confirm no duplicate target name.
2. **Tenant constraints:** first run read-only mismatch queries, repair/quarantine bad rows, add composite uniqueness, add/validate FKs, then update Prisma mappings. Rollback drops only the new constraint/index, not data.
3. **Import safety:** preserve source/staging/identity rows. Introduce claim/checkpoint semantics before changing retry behavior; test forced failure and resume. Avoid “rollback” that deletes potentially valid imported operational rows without reconciliation.
4. **Capacity arbitration:** add the new allocation/locking path while retaining current booking identities; compare counts and provide bounded retry. Rollback switches writers back only after verifying no new state depends on the new mechanism.
5. **ClassInstance adoption:** materialize/backfill and dual-read/dual-write before making foreign keys non-null. Keep template/date compatibility until reconciliation and rollback windows close.
6. **Financial state:** never rewrite external Stripe history. Use idempotent local transitions and compensating/reconciliation records rather than pretending a remote charge/subscription can roll back with PostgreSQL.
7. **Value checks:** audit existing rows, add constraints without immediate validation where safe, repair, validate, and only then make application assumptions stricter.
8. **Seed guard:** add guardrails without changing production data; validate solely on disposable fixtures.

Any material schema change needs Database schema diff and SQL review, Backend/Workflow coordination, QA verification, data-risk notes, rollback evidence, and CEO approval before merge or deployment.

## Prioritized recovery recommendations

These are evidence recommendations only; this task did not create product tickets or alter approved scope.

1. **M0 — Make import execution restartable and truthful.** Prove partial-failure, concurrent-run, retry, reconciliation, and operator recovery behavior against PostgreSQL.
2. **M0 — Enforce one capacity arbitration path.** Cover admin/public trial, member booking, paid holds, punch cards, cancellation, and waitlist promotion with concurrent integration tests.
3. **M0 — Resolve the dated-class source of truth.** Approve and implement a migration-safe `ClassInstance` rollout, or explicitly remove/delay the dormant model and narrow operational promises. Do not leave schema and actor behavior divergent.
4. **M0 — Add seed target protection.** Require explicit non-production opt-in and immutable demo identity before anyone uses `db:seed` outside disposable local setup.
5. **M1 — Add database-enforced tenant consistency.** Start with schedule, booking/access, memberships/billing, forms, and migration lineage after mismatch audits.
6. **M1 — Make billing/webhook local effects idempotent and transactional.** Choose the canonical ledger and test process crashes/replays.
7. **M1 — Add high-value row checks.** Protect capacities, times, money/counts, punch balances, and date ranges.
8. **M1 — Add the index-alignment migration.** Remove the one-name drift without editing prior migrations.
9. **M2 — Expand real database coverage.** Add clean migration replay, drift check, constraints/cascades, importer failure/retry, concurrent booking/promotion, webhook replay, and seed-guard suites in CI.
10. **M2 — Reconcile stale data documentation.** Update `docs/domain_model.md` only after the approved operational decision; it currently disagrees with both schema and runtime in different ways.

## Unresolved decisions

1. Is `ClassInstance` the approved canonical dated-class identity for MVP, and what is the minimum one-off cancellation/reschedule/substitute scope?
2. Should imports be atomic per job, atomic per row with checkpoints, or another explicit model, and what must “FAILED” guarantee to an operator?
3. Which tenant-bearing relations must be enforced with composite database keys first?
4. Which ledger is canonical: current `MembershipBillingState`/`BillingRecord`, the deeper invoice/payment/refund/credit models, or a staged transition?
5. What database/environment identifiers are approved for demo seed allowlisting?
6. Which value invariants are stable enough for database `CHECK` constraints versus application policy?
7. What representative sanitized migration fixtures and reconciliation tolerances are required before pilot approval?

## Exact evidence for synthesis/review

1. Read this file back: `docs/recovery/evidence/database.md`.
2. Compare `packages/db/prisma/schema.prisma` with every ordered migration, especially `20260425120000_reliability_foundation`, `20260524030800_index_name_alignment`, and `20260530120000_migration_first_onboarding_ops`.
3. Reproduce fresh history in disposable PostgreSQL and run `prisma migrate diff --from-url <disposable> --to-schema-datamodel prisma/schema.prisma --exit-code`; expected current result is exit `2` with the single imported-record index rename.
4. Search application/package TypeScript for `.classInstance` and `classInstanceId`; expected current authored matches are zero.
5. Inspect `packages/db/src/class-access.ts:777-1100`, `apps/admin-web/lib/bookings.ts:453-524`, and `apps/member-web/lib/trial-booking.ts:249-357,620-700` for capacity behavior.
6. Inspect `apps/admin-web/lib/workspace-migration.ts:1784-1896` for transactional staging and `:1908-2089` for non-atomic production import.
7. Inspect `apps/admin-web/lib/member-memberships.ts:543-577,726-945` and `stripe-billing.ts:950-1059,1205-1265` for split billing/webhook effects.
8. Inspect `packages/db/prisma/seed-demo.mjs:75-103,369-371` and `packages/db/package.json` for seed targeting and credential logging.
9. Confirm app unit behavior with direct admin/member Vitest runs; do not treat those mocks as PostgreSQL concurrency or migration evidence.
10. Require QA to rerun disposable migration, drift, tenant, concurrency, import-recovery, and seed-guard checks for any proposed repair.
