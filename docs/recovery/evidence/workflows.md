# Recovery audit: end-to-end operational workflows

Audit date: 2026-07-20
Kanban task: `t_e534505d`
Role: Gym Workflow

## Operational outcome

Flowstate has a connected, unit-tested demo spine for one-location owner, coach, prospect, member, and guardian operations: owner onboarding, programs and rooms, recurring schedule templates, public trials, member records, PDF forms and signatures, membership/access assignment, dated bookings, waitlists, rosters, attendance, Stripe-backed billing state, and a guided CSV migration workbench. The strongest working chain is the dated class flow from member booking to owner/coach roster and attendance.

The highest-risk mismatch is the migration launch gate. The screen describes an "internal operator" approval, but the server action requires only the gym `OWNER` context; the activation mutation does not verify that any import job completed, that blocking issues are clear, or that reconciliation was approved. A gym owner can therefore mark a pre-launch workspace `ACTIVE` immediately and queue a notification to themself. Evidence: `apps/admin-web/app/dashboard/migration/page.tsx:344-374`, `apps/admin-web/app/dashboard/migration/actions.ts:116-143`, `apps/admin-web/lib/owner-workspace.ts:62-101`, and `apps/admin-web/lib/workspace-migration.ts:2132-2168`.

The second pilot-blocking mismatch is day-of schedule truth. `ClassInstance` now exists in Prisma and migrations, but no application path reads or writes it. Schedule, booking, roster, waitlist, trial, and attendance behavior still derives an occurrence from `ClassTemplate + scheduledForDate`. The UI explicitly says one-off overrides are deferred. A cancellation, reschedule, substitute coach, room change, or capacity change for one class cannot propagate reliably across actors. Evidence: `packages/db/prisma/schema.prisma:115-119`, `packages/db/prisma/schema.prisma:256-311`, `packages/db/prisma/migrations/20260425120000_reliability_foundation/migration.sql:73-105`, `packages/db/src/occurrences.ts:78-174`, `apps/admin-web/app/dashboard/schedule/page.tsx:71-117`, and `apps/admin-web/app/dashboard/schedule/[templateId]/edit/page.tsx:52-72`.

A third operational blocker is communications. Notification rows and an outbox processor exist, but there is no application caller for the processor and the only bundled adapter marks mail sent with a `dev:` id without delivering it. Failed jobs are written as `FAILED`, while the processor only queries `PENDING`, so the recorded `nextAttemptAt` cannot cause an automatic retry. Evidence: `packages/db/src/notification-outbox.ts:100-109`, `packages/db/src/notification-outbox.ts:140-172`, and `packages/db/src/notification-outbox.ts:196-233`.

Conclusion: suitable for controlled demo and workflow prototyping; not yet safe for a live one-location pilot whose daily operations depend on one-off schedule changes, trustworthy cutover approval, or email notifications.

## Audit basis and status legend

### Sources inspected

- Repository rules and current product truth: `.hermes.md`, `README.md`, `CLAUDE.md`, `docs/product_decisions_ledger.md`, `docs/01-decisions/Business Decision Log.md`, `docs/mvp_ticket_board.md`, `docs/domain_model.md`, `docs/engineering_rules.md`, `docs/04-demo/Working Demo State.md`, `docs/Agents/Agent Operating Model.md`, and `docs/Agents/Gym Workflow.md`.
- Current implementation: admin, member, API, auth, database helpers, server actions, route pages, Prisma schema, and tests.
- Persistence history: all 14 SQL migrations plus `migration_lock.toml`; PostgreSQL is the recorded provider.
- Current repository state and Git history/diff. Existing unrelated modifications were present in `docs/00-brain/Home.md` and `docs/README.md`; this audit did not alter them.
- Current shared board: nine recovery audits were `running` and five downstream synthesis/review/reconciliation tasks were `todo`. This report feeds the orchestrator's canonical synthesis task.

### Status meanings

- **Implemented and covered** — UI/action/domain/persistence path exists and relevant Vitest coverage passed.
- **Partial / demo-ready** — meaningful path exists, but an operational handoff, permission, recovery, integration, or live-provider step is absent.
- **Schema only** — Prisma/migration shape exists without an actor-facing application workflow.
- **Roadmap only / absent** — approved or ticketed behavior has no current application path.

Passing mocked unit tests prove branch behavior, not PostgreSQL concurrency, Stripe delivery, email delivery, or browser usability. Playwright specs exist, but `pnpm run test` does not execute them (`package.json:10-12`).

## Cross-actor truth model

Current live class identity is effectively:

`workspaceId + classTemplateId + scheduledForDate`

That composite is used by bookings, attendance, and waitlists. The persisted `classInstanceId` columns are nullable and unused by the application. Consequences:

1. The owner edits a recurring `ClassTemplate`; there is no separate owner operation for one occurrence.
2. Member/prospect options are generated from template weekday rules.
3. Bookings and waitlist entries persist the template and date.
4. Owner/coach rosters query the same template/date pair.
5. Attendance upserts the same template/date pair and synchronizes an active booking state.
6. The `ClassInstance` row that could carry a one-off coach, room, time, capacity, status, cancellation reason, or reschedule source does not participate.

This is internally coherent for an unchanged recurring schedule, but it is not a safe source of truth once a real gym makes a one-off change.

## Workflow 1 — owner signup, onboarding, and migration handoff

**Status: Partial / demo-ready; activation permission and readiness checks are unsafe.**
**Related tickets/decisions:** migration is guided, validated, and reviewable (`docs/product_decisions_ledger.md:221-239`, `docs/product_decisions_ledger.md:261-262`); current implementation aligns with P2 migration concepts but not the promised full Zen Planner depth (`docs/mvp_ticket_board.md:306-317`).

### Preconditions

- A signed-in `OWNER` has no active workspace membership.
- Required intake includes gym name, timezone, current software, and access instructions.
- One workspace and one primary location are created; the workspace remains `SETUP_INCOMPLETE` until the readiness mutation.

### Actor steps and state transitions

1. **Owner:** signs up, enters migration intake, and submits onboarding.
2. **Server action:** validates the owner session and creates workspace, location, owner membership, settings, and `WorkspaceMigration` in one onboarding path.
3. **Owner/operator screen:** `/dashboard/migration` shows intake, owner action, Flowstate responsibility, milestones, CSV staging, jobs, validation issues, and reconciliation.
4. **Upload:** an owner-scoped action accepts CSV up to 5 MB, parses it, creates `ImportJob`, `ImportSourceFile`, `StagingRecord`, and `ValidationIssue` rows in a transaction (`apps/admin-web/lib/workspace-migration.ts:1736-1896`).
5. **Validation:** blocking rows leave the job `MAPPED`; clean production-supported rows make it `VALIDATED`.
6. **Import:** a validated job moves `IMPORTING -> COMPLETED`, writes production records, creates a reconciliation report, and sets migration stage to `REVIEW_READY` (`apps/admin-web/lib/workspace-migration.ts:1908-2089`).
7. **Handoff:** the owner-visible button sets migration `COMPLETE`, records the acting owner user, changes workspace `SETUP_INCOMPLETE -> ACTIVE`, queues an announcement notification, and redirects to the normal dashboard (`apps/admin-web/app/dashboard/migration/actions.ts:116-143`; `apps/admin-web/lib/workspace-migration.ts:2132-2168`).

### Supported import scope

Production import is limited to `MEMBER`, `MEMBERSHIP_PLAN`, `MEMBER_MEMBERSHIP`, `PUNCH_CARD_BALANCE`, `DROP_IN_PRODUCT`, and `SCHEDULE_TEMPLATE` (`apps/admin-web/lib/workspace-migration.ts:89-96`). Other enum kinds—including guardians/family links, billing history, notes, staff, progress, and attendance—are staged for review only. There is no Zen Planner preset or field-mapping UI.

### Confused, exception, and recovery paths

- Invalid kind, empty/oversized file, malformed CSV, empty CSV, invalid field content, cross-workspace job id, blocking issues, review-only kind, and no ready rows return explicit errors (`apps/admin-web/lib/workspace-migration.ts:1736-1779`, `apps/admin-web/lib/workspace-migration.ts:1938-1963`).
- Import failure records `FAILED`, timestamp, and failure message; retry is a manual rerun (`apps/admin-web/lib/workspace-migration.ts:2070-2088`).
- Duplicate production records use imported-record mappings and per-kind create/update/skip behavior; reconciliation records summary counts.
- **Gap:** the run-import server action logs an error and redirects instead of presenting it in the UI (`apps/admin-web/app/dashboard/migration/actions.ts:95-114`).
- **Gap:** the completion button is disabled only after completion, not when jobs/issues/reconciliation are incomplete (`apps/admin-web/app/dashboard/migration/page.tsx:344-374`).
- **Gap:** the supposed internal migration operator is not a role. `OWNER` is the only principal that can use this screen and can approve their own cutover.
- **Gap:** queued owner notification is not delivered by a production email worker.

### Permissions and handoff

All migration page and action paths call `requireOwnerWorkspaceContext`; coaches and customers are denied. That protects tenant scope but does not distinguish gym owner from Flowstate migration staff. Product language assigns import quality to the migration team, while the code gives final approval to the gym owner.

### Test evidence

- Unit: `apps/admin-web/lib/onboarding.test.ts`, `apps/admin-web/app/onboarding/actions.test.ts`, and `apps/admin-web/lib/workspace-migration.test.ts`.
- Browser spec: `tests/e2e/migration-first-onboarding.spec.ts:65-269` covers protected signup, invalid and valid CSV, import/reconciliation, pre-ready booking gating, owner completion, and post-ready dashboard.
- The spec itself demonstrates the permission mismatch: the newly created gym owner clicks the "Complete handoff and notify owner" control (`tests/e2e/migration-first-onboarding.spec.ts:249-258`).

### Acceptance criteria before pilot

- A distinct, auditable Flowstate operator permission—or an explicit owner self-approval product decision—must gate completion.
- Server-side completion must require defined jobs complete, zero unresolved blocking issues, required data-scope checks, and a reconciliation approval record.
- Completion failure must remain on-screen with a recoverable error.
- Production notification delivery and retry must be exercised.
- Supported versus review-only migration kinds must be disclosed before upload.

## Workflow 2 — owner facility setup: programs and rooms

**Status: Implemented and covered for create/edit/archive constraints; restore/default-coach depth is incomplete.**
**Related tickets:** P0-07 and P0-08 (`docs/mvp_ticket_board.md:90-111`).

### Flow

1. Owner opens Programs or Rooms from the owner dashboard.
2. Owner creates or edits sanitized metadata; rooms are scoped to the single primary location.
3. Program/room rows persist with workspace/location foreign keys and archive/deactivation timestamps.
4. Active recurring templates can block archive/deactivation, preserving schedule references.
5. Owner receives inline validation for missing/invalid capacity, uniqueness, foreign-workspace references, or in-use resources.

### Permissions, edge cases, recovery

- Owner-only server actions use `requireOwnerWorkspaceContext`; coach/customer access is rejected.
- One workspace location is assumed throughout. No multi-location branch was found.
- Archived references remain for history; program and template restore are not a complete workflow. The template edit UI explicitly says restore is deferred (`apps/admin-web/app/dashboard/schedule/[templateId]/edit/page.tsx:143-147`).
- Program "default coaches" from P0-07 are not represented; coach assignment lives on each class template.

### Persistence and tests

- Models/migrations: `programs`, `rooms`, and `class_templates`; see `20260405090000_programs_and_room_archival` and `20260406120000_class_templates_schedule_slice`.
- Tests: `apps/admin-web/lib/programs.test.ts` and `apps/admin-web/lib/rooms.test.ts` cover workspace scope, uniqueness, capacity, and active-template blockers.

### Acceptance criteria before pilot

- Confirm archive/restore policy and provide recovery if owners archive by mistake.
- Decide whether program-level default coaches are required or remove the ticket promise.
- Exercise resource archive/deactivation against real PostgreSQL data with existing bookings.

## Workflow 3 — coach onboarding and substitute coverage

**Status: Invite records are partial; substitute coach workflow is absent.**
**Related tickets:** P0-11 (`docs/mvp_ticket_board.md:140-150`); staff invites and substitutes are approved MVP scope (`docs/product_decisions_ledger.md:288-298`).

### Current owner flow

1. Owner opens `/dashboard/staff-invites`.
2. Owner enters coach email; action creates or refreshes a `StaffInvite` token/expiry.
3. Owner can resend (rotate token/expiry) or revoke.
4. Stale pending invites expire lazily when the list/actions run.

The UI truthfully labels this "Coach invite scaffolding" and states that email delivery and coach acceptance are deferred (`apps/admin-web/app/dashboard/staff-invites/page.tsx:17-38`). No invite-acceptance route or application handler was found.

### Substitute mismatch

- Recurring template editing allows an owner to replace `coachWorkspaceUserId`; active owner/coach membership is validated (`apps/admin-web/app/dashboard/schedule/actions.ts:12-26`; `apps/admin-web/lib/class-templates.ts:297-350`).
- That replacement changes the whole series, not one class.
- Coaches cannot request a substitute.
- There is no substitute state, offer/accept handoff, owner approval, conflict warning, or notification.
- Coach "today" queries only templates assigned to that coach; a true one-off reassignment cannot be reflected.

### Tests

`apps/admin-web/lib/staff-invites.test.ts` covers expiry, create/refresh, resend, revoke, and tenant scope. `apps/admin-web/lib/class-templates.test.ts` covers valid owner/coach assignment. No acceptance or substitute tests exist.

### Acceptance criteria before pilot

- Invite email, token acceptance, user/workspace membership creation, expiry/revoke UX, and duplicate-account recovery work end to end.
- One occurrence can be reassigned without changing the series.
- Original coach, substitute, owner, roster, and member schedule see one consistent assignment.
- Conflicts and declined/unfilled substitute requests have explicit recovery.

## Workflow 4 — recurring scheduling and one-off operations

**Status: Recurring template management is implemented; day-of one-off operations are schema only/absent.**
**Related tickets:** P0-09, P0-10, P0-11 (`docs/mvp_ticket_board.md:113-150`). Product decisions require one-off edits, cancellation, rescheduling, and substitutes (`docs/product_decisions_ledger.md:125-137`).

### Implemented recurring flow

1. Owner creates a class template after programs, rooms, and active owner/coach memberships exist.
2. Owner selects program, room, coach, weekday, start/end, capacity override, booking cutoff, and cancellation cutoff.
3. Server action validates tenant/location/reference state and persists `ClassTemplate` (`apps/admin-web/app/dashboard/schedule/actions.ts:29-72`; `apps/admin-web/lib/class-templates.ts:297-350`).
4. Weekly schedule reads active templates. Owner may edit the recurring series or archive it.
5. Prospect/member/coach operations derive upcoming dates from the template weekday and timezone (`packages/db/src/occurrences.ts:78-174`).

### Missing one-off flow and resulting failure modes

The schedule board says one-off overrides remain deferred (`apps/admin-web/app/dashboard/schedule/page.tsx:71-117`). Prisma supports `ClassInstance` with date, title, room, coach, time, capacity, cutoffs, status, cancellation reason, and reschedule source, but application code never reads/writes `classInstance` or `classInstanceId`.

Operational consequences:

- Cancelling today's class is impossible without archiving/changing the recurring series.
- Moving one date cannot preserve or reattach its bookings/waitlist/attendance.
- A substitute cannot be assigned for only today.
- A one-off room, time, or capacity change cannot propagate to member schedule and roster.
- Editing a recurring template after future bookings exist may make the booked date's displayed details change retroactively.
- No member/coach notification or acknowledgement exists for a change.

### Tests

`apps/admin-web/lib/class-templates.test.ts` and `apps/admin-web/app/dashboard/schedule/actions.test.ts` cover template validation and redirects only. There are no `ClassInstance` behavior tests.

### Acceptance criteria before pilot

- Materialize or deterministically upsert an occurrence before any mutation/booking and use `classInstanceId` as the cross-actor identity.
- Single-occurrence edit/cancel/reschedule and recurring-series edit are separate commands with explicit scope confirmation.
- Existing bookings/waitlist are retained or reconciled under an explicit policy.
- Substitution changes owner, coach, roster, and member views atomically.
- Notifications are queued with recipient and delivery state; failures are recoverable.
- Timezone/DST, overlapping room/coach, cutoff, and capacity regressions are integration-tested.

## Workflow 5 — public trial and guardian capture

**Status: Implemented and covered for public booking; confirmation delivery and guardian self-service are partial.**
**Related tickets:** P0-13 and P0-14 (`docs/mvp_ticket_board.md:166-190`).

### Flow and state

1. Prospect opens public `/trial/[workspaceId]`; no login is required.
2. UI lists the next generated dates from active recurring templates (`apps/member-web/app/trial/[workspaceId]/page.tsx:5-52`).
3. Prospect enters participant/contact details and optional guardian details.
4. Server validates the chosen template/date against generated workspace options, validates contact/DOB, and rejects arbitrary or cross-workspace selections.
5. Existing member match is reused; otherwise a `TRIAL` member is created. Optional guardian and `FamilyLink` are created.
6. Trial and class booking rows are created/restored for the date. Duplicate active bookings are rejected.
7. Required trial/guardian signature requests are issued, and the confirmation UI returns direct signing links (`apps/member-web/app/trial/[workspaceId]/actions.ts:19-68`).

### Exceptions and recovery

- No classes produces a safe empty state (`apps/member-web/app/trial/[workspaceId]/page.tsx:45-50`).
- Missing contact, invalid DOB/date, invalid guardian data, duplicate active trial, and two-guardian limit return inline errors.
- A cancelled exact-match trial row can be restored.
- **Gap:** dates still ignore one-off cancellation/reschedule because they are template-derived.
- **Gap:** there is no email confirmation delivery despite the launch decision.
- **Gap:** guardian pays/books-for-child is not implemented; guardian data is capture/link/signature only.

### Tests

`apps/member-web/lib/trial-booking.test.ts` covers dates, tenant/date validation, member reuse, guardian creation, duplicate restore, and contact validation. `apps/member-web/app/trial/[workspaceId]/actions.test.ts` covers friendly error and confirmation. The connected browser demo books a trial and then sees it on the roster (`tests/e2e/flowstate-demo.spec.ts:154-188`).

### Acceptance criteria before pilot

- Suppress cancelled/rescheduled instances.
- Deliver and retry trial confirmation email without exposing raw magic links to unauthorized users.
- Define guardian payer/booker/login scope or narrow the MVP promise.
- Verify minors, duplicate household contacts, and correction after a mistaken guardian link.

## Workflow 6 — owner member records, guardians, and portal provisioning

**Status: Core owner member record is implemented; family self-service is intentionally narrow.**
**Related tickets:** P0-12 and P0-13 (`docs/mvp_ticket_board.md:152-177`).

### Flow

1. Owner searches/lists workspace members.
2. Owner creates or edits profile, status, DOB, email/phone, notes, and tags.
3. Owner opens a profile showing guardians, trial history, attendance, forms, billing link, and portal state (`apps/admin-web/app/dashboard/members/[memberId]/page.tsx:38-124`).
4. Owner can create/link up to two guardians. Workspace and duplicate relationships are validated (`apps/admin-web/lib/members.ts:826-938`).
5. Owner can provision a linked `CUSTOMER` user for a member with unique email, or reset the linked password (`apps/admin-web/app/dashboard/members/actions.ts:112-171`).

### State, permissions, recovery

- Actions are owner-only and workspace-scoped.
- Missing member, invalid status/email/DOB, foreign guardian/member, duplicate relation, third guardian, or duplicate user email return explicit errors.
- Linked portal user email is synchronized only when uniqueness allows.
- Portal is deliberately one user to one member; member page says family account linking is unsupported (`apps/admin-web/app/dashboard/members/[memberId]/page.tsx:300-333`).
- There is no guardian login, guardian booking/payment for child, child upgrade, unlink guardian, merge duplicate members, or secure self-service password reset/email invitation.

### Tests

`apps/admin-web/lib/members.test.ts` covers CRUD/search/scope/profile/guardian constraints. `apps/admin-web/lib/member-portal-access.test.ts` covers create/reset and email collisions. `apps/member-web/lib/member-auth.test.ts` requires one linked member.

### Acceptance criteria before pilot

- Define and implement member deletion/archive/merge correction paths.
- Replace owner-chosen temporary passwords with invitation/reset token delivery.
- Explicitly scope guardian booking/payment promises to implemented behavior.
- Add unlink/relink audit behavior and household duplicate handling.

## Workflow 7 — forms, signatures, and activation gate

**Status: Implemented and covered for local PDF/version/signature records; external e-sign and email delivery are absent.**
**Related tickets:** P0-15 and P0-16 (`docs/mvp_ticket_board.md:192-216`).

### Owner/member/guardian flow

1. Owner uploads a PDF up to 10 MB, creating `FormDocument` and initial `FormVersion` (`apps/admin-web/lib/forms.ts:291-378`; `packages/db/src/forms.ts:336-367`).
2. Owner creates a new version; prior open signature requests are cancelled/superseded.
3. Owner activates required assignments by target (for example trial or membership activation).
4. Trial/member status resolution creates current signature requests.
5. Member opens authenticated `/app/forms`; guardian/prospect can open tokenized magic-link signing path.
6. Signer sees the current PDF, enters legal name, and records a `SignedDocument` tied to the exact version.
7. Member and owner profile show current status and signed history (`apps/admin-web/app/dashboard/members/[memberId]/page.tsx:128-236`; `apps/member-web/app/app/forms/page.tsx:17-108`).
8. Membership assignment refuses to proceed while current activation forms remain unsigned (`apps/admin-web/lib/member-memberships.ts:520-535`).

### Exceptions/recovery/security

- Invalid type/size/PDF, missing document, inactive/expired link, wrong member, stale version, or duplicate signature are handled in domain functions.
- Signed history is immutable by version; old signature becomes superseded rather than rewritten.
- Token paths are member/guardian specific; owner form access is workspace-scoped.
- **Gap:** no email worker delivers magic links.
- **Gap:** local typed-name signature is not a DocuSign-like provider integration and no provider audit certificate was found.
- **Gap:** no operational resend/revoke dashboard for stuck signatures beyond generated links shown to owner.

### Tests

`apps/admin-web/lib/forms.test.ts` covers document/version/assignment. `apps/admin-web/lib/forms-domain.test.ts` covers PDF limit, supersession, guardian links, sibling cancellation, and tenant access.

### Acceptance criteria before pilot

- Confirm legal sufficiency and required audit metadata for target jurisdictions.
- Deliver, resend, expire, and revoke links through production email.
- Prove exactly one current request per signer/version under concurrent submissions.
- Surface blocked membership/trial recovery to owner and signer.

## Workflow 8 — member/owner booking, cancellation, and waitlist

**Status: Implemented and unit-covered for template/date occurrences; unsafe under one-off change and not fully notification-backed.**
**Related tickets:** P0-17 and P0-18 (`docs/mvp_ticket_board.md:218-243`).

### Member flow

1. Customer logs in; `requireMemberPortalContext` requires role `CUSTOMER` and exactly one linked member (`apps/member-web/lib/member-auth.ts:47-110`).
2. `/app/schedule` lists generated future occurrences within booking windows and evaluates membership, punch card, or drop-in access (`apps/member-web/app/app/schedule/page.tsx:6-33`; `apps/member-web/lib/self-service-bookings.ts:252-647`).
3. Member books an available class, joins a full waitlist if access allows, or starts Stripe Checkout for a paid drop-in (`apps/member-web/app/app/schedule/actions.ts:31-100`).
4. `ClassBooking` moves to `BOOKED` for membership/punch access or `PENDING_PAYMENT` for drop-in. A punch is consumed atomically; Stripe checkout success finalizes payment idempotently.
5. `/app/bookings` shows upcoming, payment-pending, waitlist, and history (`apps/member-web/app/app/bookings/page.tsx:6-24`).
6. Member cancels their own booking or leaves their own waitlist. Early punch cancellation refunds a punch; late cancellation does not. A released seat can be manually promoted from the waitlist.

### Owner/coach flow

- Owner can create a booking/trial for a selected member from `/dashboard/bookings`; booking controls are disabled until migration readiness (`apps/admin-web/app/dashboard/bookings/page.tsx:8-37`).
- Owner and assigned coach can view roster/waitlist. Owner/coach can manually promote or remove entries through operations-scoped actions.

### State and recovery

- Seat-holding states are `BOOKED` and `PENDING_PAYMENT` (`packages/db/src/class-access.ts:22-25`). Expired pending-payment holds are cleaned before capacity counts.
- Duplicate booking, invalid occurrence, cutoff passed, no access, full class, duplicate waitlist, and foreign member/booking/waitlist produce explicit errors.
- Full class permits waitlist only with membership/punch access; paid drop-ins cannot waitlist.
- Promotion is oldest-first and consumes eligible punch access when needed.
- Stripe finalization uses persisted event/session identity for idempotency.
- **Gap:** auto-promotion is not wired to cancellation; promotion is manual/helper-driven.
- **Gap:** no booking/cancellation/promotion email is delivered.
- **Gap:** all decisions use template/date, so a cancelled or changed one-off still appears/bookable.
- **Gap:** owner booking error/recovery UX is narrower than member inline flows.

### Tests

`apps/admin-web/lib/class-access.test.ts`, `apps/admin-web/lib/bookings.test.ts`, and `apps/member-web/lib/self-service-bookings.test.ts` cover stale holds, access choice, punches/refunds, duplicates, date/workspace validation, waitlist promotion/removal, and member scope. The connected browser spec covers a member booking flowing to owner roster (`tests/e2e/flowstate-demo.spec.ts:147-188`).

### Acceptance criteria before pilot

- Booking/waitlist/attendance key to the same persisted instance.
- Capacity and promotion are concurrency-tested in PostgreSQL.
- Cancellation automatically evaluates the head waitlist entry or creates an explicit owner task.
- Notifications have delivery/retry evidence.
- Late cancel/no-show policy is visible before confirmation and auditable afterward.

## Workflow 9 — coach roster and attendance

**Status: Implemented and covered for assigned recurring classes; walk-ins/trial-add/post-class-note and one-off assignment remain incomplete.**
**Related tickets:** P0-19 and P0-20 (`docs/mvp_ticket_board.md:245-269`).

### Flow

1. Owner or coach enters operations workspace context; customers are rejected (`apps/admin-web/lib/operations-workspace.ts:67-111`).
2. Coach "Today" lists only templates where `coachWorkspaceUserId` equals the signed-in coach (`apps/admin-web/lib/rosters.ts:269-270`, `apps/admin-web/lib/rosters.ts:350-441`). Owner sees all.
3. Actor opens a date-specific roster for template/date.
4. Roster shows booked participants, trial badges, member notes, attendance state, and waitlist.
5. Actor saves `PRESENT`, `LATE`, `ABSENT`, or `NO_SHOW` plus note.
6. Attendance is upserted for member/template/date with acting workspace user; matching active booking is synchronized to attended/absent/no-show (`apps/admin-web/lib/rosters.ts:654-778`).
7. Owner/assigned coach can manually promote/remove waitlist entries (`apps/admin-web/lib/rosters.ts:780-849`).

### Edge/recovery/permissions

- Coaches cannot open another coach's roster; owners can open any.
- Future attendance is rejected.
- Workspace/date/template/member scope is checked.
- Re-saving attendance updates the existing record.
- **Gap:** add walk-in and add trial attendee controls from P0-20 are absent.
- **Gap:** no class-level completion/post-class notes workflow exists.
- **Gap:** one-off substitute assignment cannot grant the substitute roster access.
- **Gap:** attendance still uses nullable, unused `classInstanceId` and template/date uniqueness.

### Tests

`apps/admin-web/lib/rosters.test.ts` covers today's list, owner/coach access, attendance sync, waitlist delegation, future rejection, and unassigned coach rejection. The browser demo records attendance and verifies roster state (`tests/e2e/flowstate-demo.spec.ts:176-188`).

### Acceptance criteria before pilot

- Persist and authorize against current instance coach assignment.
- Add audited walk-in/trial insertion or explicitly remove it from P0 acceptance.
- Define correction window and who may edit attendance after class completion.
- Verify member history/report aggregation after repeated corrections.

## Workflow 10 — membership plans, membership lifecycle, punch cards, and drop-ins

**Status: Owner lifecycle and member purchase paths are implemented; member freeze/cancel requests, credits/refunds depth, and provider-offline recovery are partial.**
**Related tickets:** P1-01 to P1-12 (`docs/mvp_ticket_board.md:287-298`).

### Owner/member flow

1. Owner creates a monthly plan with optional active-program restrictions.
2. Owner assigns it to a member only if no current membership and required activation forms are signed.
3. If Stripe is ready, customer/subscription linkage is created; otherwise membership persists `PENDING_PAYMENT_METHOD` with an explicit failure message (`apps/admin-web/lib/member-memberships.ts:538-584`).
4. Owner can schedule period-end cancellation, set a freeze window, or clear freeze.
5. Owner configures punch-card/drop-in products and grants cards.
6. Member views membership, freeze/cancel status, cards, and available card products (`apps/member-web/app/app/membership/page.tsx:24-161`).
7. Member buys punch cards via Stripe Checkout and can use membership/punch/drop-in access when booking.

### State/recovery/permissions

- Current membership uniqueness is enforced in app and database.
- Archived/foreign plan or program, duplicate current membership, unsigned forms, invalid freeze range, and missing Stripe readiness produce explicit results.
- Cancellation calls Stripe when a subscription exists and records local state.
- Punch selection is oldest eligible non-expiring card; early cancellation refunds one punch.
- **Gap:** members can only view cancellation/freeze state; no self-serve request controls exist.
- **Gap:** schema has invoice/payment/refund/account-credit/failed-case depth, but current operations still rely mainly on `MembershipBillingState` and `BillingRecord`.
- **Gap:** partial refund/credit workflows promised in P1 do not have application routes/actions.

### Tests

`apps/admin-web/lib/membership-plans.test.ts`, `apps/admin-web/lib/member-memberships.test.ts`, `apps/admin-web/lib/access-products.test.ts`, `apps/admin-web/lib/class-access.test.ts`, and `apps/member-web/lib/member-commerce.test.ts` cover validation, lifecycle, gating, product restrictions, and Stripe checkout helpers.

### Acceptance criteria before pilot

- Define owner versus member request/approval rules for freeze/cancel.
- Reconcile Stripe and local state after provider timeout or partial failure.
- Implement or explicitly defer credits/partial refunds with ledger invariants.
- Show policy consequences before booking/cancellation/purchase.

## Workflow 11 — Stripe billing and failed-payment recovery

**Status: Meaningful Stripe/webhook and owner/member recovery helpers exist; live readiness depends on credentials/provider and deeper ledger models are unused.**

### Flow

1. Owner configures Stripe connection/settings.
2. Membership assignment may create Stripe customer/subscription linkage.
3. Webhook route verifies/processes account, subscription, invoice, and checkout events.
4. `StripeWebhookEvent` persists event id and processing status for idempotency.
5. Invoice failures update membership billing state and append `BillingRecord`.
6. Owner dashboard/billing queue lists actionable failure states; owner can mark payment update requested or retry latest invoice.
7. Member `/app/billing` shows status/failure/recent records, launches hosted payment-method update, and retries their own actionable invoice (`apps/member-web/app/app/billing/page.tsx:34-129`; `apps/member-web/app/app/billing/actions.ts:29-77`).

### Exceptions and recovery

- UI distinguishes not connected/read-only, member action required, and retryable failure.
- No invoice, non-actionable state, foreign member/item, or Stripe not ready returns an explicit error (`apps/admin-web/lib/failed-payments.ts:201-343`; `apps/member-web/lib/member-billing.ts:385-536`).
- Webhook errors persist `ERRORED` so Stripe can retry.
- **Gap:** full `Invoice`, `Payment`, `Refund`, `AccountCredit`, and `FailedPaymentCase` models added by the reliability migration are not the active app ledger.
- **Gap:** payment-update notices are local state/notification intent, not proven delivered email.
- **Gap:** no tested production Connect account or credentials in this audit.

### Tests

`apps/admin-web/lib/stripe-billing.test.ts`, `apps/admin-web/lib/failed-payments.test.ts`, `apps/admin-web/app/dashboard/billing/actions.test.ts`, and `apps/member-web/lib/member-billing.test.ts` cover idempotency, invoice failure mapping, error persistence, tenant/member scope, and retry preconditions.

### Acceptance criteria before pilot

- Run Stripe test-mode integration through assignment, failed payment, payment-method update, retry, cancellation, and webhook replay.
- Choose the canonical ledger and reconcile the duplicated current versus reliability-foundation models.
- Deliver failed-payment/payment-update emails and show delivery state to owner.
- Prove webhook and local command idempotency under retries and out-of-order events.

## Workflow 12 — communications and operational handoffs

**Status: Notification persistence/helper only; messaging and announcements are schema only.**
**Related tickets/decisions:** P1-13 to P1-15 (`docs/mvp_ticket_board.md:299-301`); launch email set and 1:1 messaging are approved (`docs/product_decisions_ledger.md:157-173`).

### Implemented pieces

- `NotificationJob` can be enqueued as `PENDING` with recipient, subject, body, and next attempt.
- Processor claims `PENDING -> SENDING -> SENT|FAILED` and stores attempts/provider id/error.
- Migration completion enqueues one announcement-style owner notification.
- Prisma contains conversation, participant, message, announcement, notification-job, and email-template models.

### Missing/broken handoffs

- No production delivery adapter or scheduler/worker caller was found.
- Development adapter does not send email (`packages/db/src/notification-outbox.ts:100-109`).
- Failed rows cannot be retried because selection is `PENDING` only while failures remain `FAILED` (`packages/db/src/notification-outbox.ts:151-172`, `packages/db/src/notification-outbox.ts:214-233`).
- Trial, booking, cancellation, waitlist promotion, class change, reminder, and failed-payment operations do not consistently enqueue jobs.
- No owner/member messaging or broadcast UI/action exists.

### Test state

No notification-outbox, announcement, or messaging test file was found. Existing action/domain tests generally stop at local state.

### Acceptance criteria before pilot

- Production email adapter, worker schedule, idempotent claim/retry, backoff, terminal failure, and operator requeue exist.
- Every promised trigger has explicit enqueue policy and dedupe key.
- Owner sees pending/sent/failed state and can recover failures.
- Messaging/broadcast promises are either implemented or removed from launch scope.

## Workflow 13 — events, private lessons, reporting, and progress

**Status: Mostly schema only/roadmap only.**
**Related tickets:** P1-16 to P1-18 and P2-01 (`docs/mvp_ticket_board.md:302-308`). Product decisions include prepaid events/private lessons and basic reporting (`docs/product_decisions_ledger.md:115-123`, `docs/product_decisions_ledger.md:264-277`).

### Evidence

- Reliability migration creates `events`, `event_bookings`, `private_lesson_slots`, `private_lesson_bookings`, progress, messaging, richer billing, and import tables (`packages/db/prisma/migrations/20260425120000_reliability_foundation/migration.sql`).
- Prisma relations expose those models (`packages/db/prisma/schema.prisma:122-171`, `packages/db/prisma/schema.prisma:1122-1313`).
- No admin/member application module reads or mutates `EventBooking`, `PrivateLessonSlot`, `PrivateLessonBooking`, `ConversationThread`, or `Announcement`.
- No reporting route/action was found. Owner dashboard has operational counts/attention, not the approved attendance-by-class, revenue, new-member, or cancellation summaries.
- Progress models exist but no enabled/disabled owner or member workflow was found beyond program metadata.

### Acceptance criteria before claiming launch scope

- Event/private lesson lifecycle, payment, cancellation/refund, coach assignment, member visibility, roster/attendance, and notifications work end to end.
- Basic reports define source rows, date/timezone semantics, filters, permissions, and export/reconciliation.
- Optional progress module has enable/disable behavior and no UI leakage when disabled.
- Otherwise mark these as deferred in the canonical product truth.

## Permissions synthesis

### Owner

- Correctly required for workspace setup, programs, rooms, recurring schedule, member management, forms, plans/products, billing settings/recovery, staff invite records, and migration.
- Can also use operations roster/attendance.
- **Mismatch:** gym owner is treated as the internal migration approver.

### Coach

- Routed from owner dashboard to coach today view.
- Can open only assigned recurring rosters and record attendance/promote/remove waitlist.
- Cannot manage owner configuration.
- **Mismatch:** no one-off assignment/substitute model is used, so legitimate substitutes cannot acquire access.

### Customer/member

- Member cookie/session is separate; role must be `CUSTOMER` and link to exactly one member.
- Can see/book/cancel only own classes, waitlist, forms, membership, cards, and billing state.
- Cannot act for children or household members.

### Guardian/prospect

- Public trial and tokenized form-signing paths exist.
- No authenticated guardian account, child booking, shared billing, or progress view exists despite approved family language.

## State-transition summary

| Domain | Current transition | Recovery | Main mismatch |
|---|---|---|---|
| Workspace migration | `SETUP_INCOMPLETE -> ACTIVE` | owner can revisit migration page | completion is owner self-approval with no readiness predicate |
| Import job | `DRAFT -> MAPPED|VALIDATED -> IMPORTING -> COMPLETED|FAILED` | manual rerun | only six kinds reach production; action hides errors after redirect |
| Staff invite | `PENDING -> EXPIRED|REVOKED` | resend rotates pending token | no acceptance/email path |
| Class template | active -> edited/archived | no restore UI | series only; no instance mutation |
| Booking | none/cancelled -> `BOOKED|PENDING_PAYMENT`; active -> cancelled/attendance state | stale payment cleanup, cancellation, Stripe retry | instance cancellation/change cannot propagate |
| Waitlist | none/cancelled -> `WAITING -> PROMOTED|REMOVED` | manual promotion/removal/rejoin | no automatic promotion/notification |
| Attendance | none -> present/late/absent/no-show; subsequent save updates | actor can correct by resave | no class completion/correction policy; no instance key |
| Membership | none -> pending/active/frozen/cancel-at-period-end | owner clear freeze/retry billing | member request controls and richer ledger incomplete |
| Signature | open -> completed/expired/cancelled; old signed version -> superseded | new current request/link | no email/provider audit flow |
| Notification | `PENDING -> SENDING -> SENT|FAILED` | none wired for `FAILED` | no production sender/worker; retry bug |

## Highest-priority risks

1. **R0 — Unsafe migration activation permission and invariant.** Any active gym owner can complete handoff; no server-side data/reconciliation readiness predicate exists.
2. **R0 — No application-level class-instance truth.** One-off cancellations, reschedules, substitutions, room/time/capacity edits cannot propagate safely to booking/roster/attendance.
3. **R0 — Notifications are non-delivering and failed jobs are terminal.** Operational changes and payment/trial communications cannot be relied upon.
4. **R1 — Documentation/schema/implementation disagree.** `domain_model.md` says `ClassInstance` and richer operational models are not persisted/planned, while Prisma and migrations now contain them; conversely, schema presence can be mistaken for implemented behavior.
5. **R1 — Family promise exceeds implementation.** Guardian capture/signing exists, but guardian login, booking for child, shared payment, and progress view do not.
6. **R1 — Billing has competing representations.** Current workflows use membership billing state/records while richer invoice/payment/refund/credit models are unused.
7. **R1 — Migration support is narrower than approved scope.** Six production kinds, CSV only; no Zen Planner preset, mapping UI, dry run, or production import for guardian/history/staff/progress/attendance.
8. **R1 — Attendance P0 is incomplete.** Walk-in, add trial attendee, post-class notes, and completion/correction policy are missing.
9. **R2 — Test confidence is unit-heavy.** Browser specs exist, but normal `pnpm run test` excludes them; no concurrency/provider/email verification is part of the standard gate.

## Contradictions requiring canonical decisions

1. `docs/domain_model.md:50-99` calls `ClassInstance`, richer billing, messaging, events, progress, and migration models partial/planned; Prisma and the reliability migration contain all of them.
2. `docs/02-product/MVP Scope Brain.md:23-40` says migration beyond schema/planning is deferred; the admin application now has onboarding, staging, production import, reconciliation, and activation.
3. The same scope note correctly says instances are mostly derived and events/private lessons/deep reporting are deferred (`docs/02-product/MVP Scope Brain.md:29-40`), while the product ledger includes events/private lessons/email/messaging in MVP (`docs/product_decisions_ledger.md:115-173`, `docs/product_decisions_ledger.md:288-319`).
4. P0-20 says attendance is done when coaches can complete it end to end and includes walk-ins/trial-add/post-class notes (`docs/mvp_ticket_board.md:258-269`); current UI covers attendee-state recording only.
5. P0-11 requires coach substitute request and current assigned coach (`docs/mvp_ticket_board.md:140-150`); current owner template edit changes the recurring coach only.
6. Migration UI labels an internal operator handoff, but role architecture has only owner/coach/customer and the owner executes approval.
7. Email-only launch is a guardrail, but email delivery is not integrated.

## Unresolved domain questions

### Product/BA/Sales

- Is migration completion a Flowstate staff action, gym owner action, or dual approval? Which data/checklist invariants block activation?
- Which migration kinds are promised for the first paying gym, and what is the human service fallback for review-only data?
- Are events, private lessons, messaging, progress, credits/refunds, guardian self-service, and basic reports launch commitments or post-pilot scope?
- Does a late cancellation consume membership entitlement, punch only, or produce a separate penalty/credit policy?
- What is the auto-promotion expiry/acceptance policy when a seat opens?

### UX/Content/Localization

- How must one-off versus series edits be explained and confirmed?
- What owner/coach/member acknowledgement is required for cancellation, reschedule, substitution, or promotion?
- How should partial migration/import failure and reconciliation discrepancies be presented without exposing raw internals?
- What wording accurately distinguishes Stripe disconnected, payment failed, action required, and retry in progress?

### Backend/Database

- When is `ClassInstance` created, and does every new booking require it?
- How are existing template/date rows backfilled and uniqueness transitioned without orphaning bookings/attendance/waitlist?
- Which billing representation is canonical?
- What idempotency/concurrency policy governs seats, punches, waitlist promotion, signatures, imports, and notifications?
- How are failed notification jobs returned to a claimable state?

### QA

- Which browser flows are mandatory in the standard gate, and can they run without destructive reset of a developer database?
- What PostgreSQL concurrency cases cover last seat, last punch, duplicate signature, webhook replay, and migration retry?
- What evidence is required for Stripe test mode and real email sandbox delivery?

## Recovery acceptance plan

### Gate A — pilot blockers

- Correct migration approver permission and enforce server-side readiness/reconciliation invariants.
- Integrate persisted class instances through schedule, booking, waitlist, roster, attendance, and coach authorization.
- Implement one-off edit/cancel/reschedule/substitute flow with notifications.
- Add production email worker/adapter and a real retry/requeue state machine.

### Gate B — operational completeness

- Finish staff acceptance, member invitation/reset, attendance extras/correction policy, and member freeze/cancel request decisions.
- Reconcile canonical billing ledger and migration scope.
- Either implement or explicitly defer guardian self-service, messaging, events, private lessons, reports, progress, credits, and refunds.

### Gate C — proof

- Standard unit, lint, type/build gates pass.
- Non-destructive browser tests cover owner, coach, member, prospect, guardian-signing, migration operator, and recovery paths.
- PostgreSQL integration tests cover concurrency and instance foreign-key use.
- Stripe test mode and email sandbox produce persisted provider ids and retry evidence.
- Canonical docs and ticket statuses match executable behavior.

## Evidence / technical details

### Current gates run for this audit

- `pnpm run test` — passed: 11/11 Turbo tasks; 25 admin test files / 126 tests, 7 member test files / 29 tests, and 1 auth test file / 7 tests; 162 Vitest tests total. Prisma schema validation passed. Several packages still report "No tests yet."
- `pnpm run lint` — passed: 9/9 lint tasks with zero reported warnings/errors (all replayed from the local Turbo cache).
- `pnpm run build` — failed before any app build completed. The three web package wrappers exited with status 1 while running their shell command that sources the root `.env`; Turbo reported `admin-web#build` as the failed task but emitted no underlying Next.js diagnostic. Direct, non-wrapper Next.js builds then passed for `admin-web`, `member-web`, `landing-web`, and `api`, including TypeScript and static-page generation. This narrows the repository gate failure to the wrapper/environment-loading path rather than an observed compile/type failure; the canonical build gate nevertheless remains red.
- Playwright was not run: `pnpm run test` excludes it, and `pnpm run test:e2e` starts with `db:reset:demo` (`package.json:10-18`), which would destructively reset local demo data. The two specs were inspected as code evidence, not reported as current execution evidence.

### Test surface inspected

- 33 `*.test.ts` files: auth; owner/member access; onboarding/migration; programs/rooms/templates; members/guardians; trials; forms; plans/memberships/products; bookings/waitlist/rosters/attendance; Stripe/billing; dashboard/actions.
- 2 Playwright specs: `tests/e2e/flowstate-demo.spec.ts` and `tests/e2e/migration-first-onboarding.spec.ts`.

### Migration inventory inspected

1. `20260404043358_init_phase2_slice1` — users, workspace/location/rooms, workspace users, invites, settings.
2. `20260404045000_auth_sessions_phase3` — passwords/sessions and user membership uniqueness.
3. `20260404050000_email_and_invite_constraints` — normalized email/invite constraints.
4. `20260405090000_programs_and_room_archival`.
5. `20260406120000_class_templates_schedule_slice`.
6. `20260407120000_member_trial_booking_slice`.
7. `20260408120000_booking_roster_attendance_slice`.
8. `20260408130000_memberships_billing_slice`.
9. `20260408220000_member_portal_slice`.
10. `20260409160000_access_products_waitlist_slice`.
11. `20260410120000_forms_signing_slice`.
12. `20260425120000_reliability_foundation` — class instances, richer billing, migration, progress, messaging, notifications, events, private lessons.
13. `20260524030800_index_name_alignment` — index renames only.
14. `20260530120000_migration_first_onboarding_ops` — workspace migration/imported-record control plane.
15. `migration_lock.toml` — PostgreSQL provider.

### Implementation-versus-roadmap rule used

Prisma/migration presence was counted only as persisted shape. A workflow was counted implemented only when an actor-facing route/action called domain logic that read or mutated that shape, enforced actor/tenant access, handled relevant failures, and had test evidence. This prevents schema-only events, private lessons, messaging, progress, richer billing, and class-instance models from being reported as live features.
