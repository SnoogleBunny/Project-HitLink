# Flowstate recovery evidence — BA / Sales

Date: 2026-07-20
Scope: buyer/operator value, customer fit, commercial assumptions, workflow completeness, sales risk, and demo-versus-pilot readiness
Evidence mode: read-only source inspection; no product code, schema, migration, ticket, Git, customer, Stripe, or production changes

## Customer / business outcome

Flowstate has a credible demo foundation for the daily loop a one-location gym owner cares about: migrate initial data, configure a weekly schedule, manage members and access products, let a member book, and see that booking in a roster. The current repository also contains substantially more migration-first onboarding code than the README and older roadmap documents acknowledge.

That is not yet the same as a pilot-safe Zen Planner replacement. The strongest currently evidenced surfaces are owner setup, recurring schedule templates, member/class access, attendance, forms, recurring monthly billing state, and member booking. The largest commercial risks are unfinished real-world schedule exceptions, coach acceptance and substitution, launch email delivery, guardian self-service, invoice/receipt depth, refunds/credits, and an unproven migration/cutover path against representative Zen Planner exports. No current test, build, browser, email-provider, live Stripe, or production-readiness run was performed by this read-only audit.

Why it matters: a polished happy-path demo can create interest, but a first paying gym will judge Flowstate on whether it can survive cancellations, substitute coaches, failed payments, family accounts, communications, and migration reconciliation without data loss or manual confusion.

Recommended next action: use this evidence in recovery synthesis, agree a narrow first-pilot contract, and verify the current HEAD end to end before making sellability or migration-confidence claims. Do not promise a complete Zen Planner replacement, automated email, or pilot-safe billing/migration until the blocking workflows below are verified or explicitly removed from pilot scope.

## Verdict

**needs revision**

Buyer/operator rationale: the current product direction fits the stated ICP and the repository contains a valuable demo core, but the approved MVP promise is materially broader than the verified operational surface. Pilot positioning and implementation plans need revision around daily exceptions, communications, billing safeguards, and migration proof.

## Evidence classification and status rules

- **Repository fact**: directly present in current code, schema, migrations, tests, Git, or current project documents.
- **Historical evidence**: a dated project report says a command or workflow passed; it is not treated as current verification.
- **Product decision**: approved intended behavior from the product or business decision ledgers.
- **Hypothesis**: buyer, market, commercial, or usability belief without customer or operating data in the inspected repository.
- **UNKNOWN** is used where the repository does not establish the answer.

Current-status vocabulary used below:

- **VERIFIED COMPLETE** — exercised successfully against the current candidate with appropriate runtime evidence.
- **IMPLEMENTED BUT UNVERIFIED** — a substantial end-to-end source path exists, with test source where noted, but this audit did not execute it.
- **PARTIAL** — meaningful pieces exist but an intended workflow or safeguard is absent.
- **SCAFFOLDED** — schema, helper, or placeholder exists without a complete operator/member workflow.
- **MISSING** — no material implementation evidence was found.
- **UNKNOWN** — the evidence inspected is insufficient.
- **BLOCKED** — a prerequisite or approval prevents a safe readiness claim.

No workflow is marked **VERIFIED COMPLETE** by this audit. `docs/04-demo/Working Demo State.md` records a historical successful audit dated 2026-05-23; current HEAD is a later 2026-06-09 migration-onboarding commit and was not rerun here.

## Intended customer and operator workflow inventory

| Domain | Intended workflow / business rule | Affected persona | Current status | Repository evidence and gap |
|---|---|---|---|---|
| Authentication | Owner signup, login, session, sign-out, protected routes | Owner | IMPLEMENTED BUT UNVERIFIED | Admin signup/login routes, `packages/auth/src/session.ts`, and auth tests exist. No current command or browser run was made. |
| Authentication | Password reset | Owner, coach, customer | MISSING | P0-02 includes password reset, but no reset route was found in the admin/member route inventory. |
| Onboarding | Create a one-location workspace and collect migration context rather than a greenfield setup checklist | Owner, Flowstate operator | IMPLEMENTED BUT UNVERIFIED | `apps/admin-web/lib/onboarding.ts`, onboarding actions/tests, `WorkspaceMigration`, and migration-first E2E source exist. Workspace starts `SETUP_INCOMPLETE`. |
| Migration gating | Keep daily operations unavailable until imported data is reviewed and the workspace is explicitly operationally ready | Owner, Flowstate operator | IMPLEMENTED BUT UNVERIFIED | `isWorkspaceMigrationReady` requires `ACTIVE` plus `operationallyReadyAt`; dashboard redirects to migration and booking creation is gated. |
| Workspace configuration | Single primary location, timezone, rooms, programs, and workspace settings | Owner | IMPLEMENTED BUT UNVERIFIED | CRUD libraries/pages/tests exist for rooms and programs; schema enforces one location per workspace. Logo depth is not established by inspected evidence. |
| Staff | Create, resend, revoke, and eventually accept coach invites | Owner, coach | PARTIAL | Invite-record actions/tests exist. `staff-invites/page.tsx` explicitly says email delivery and coach acceptance are deferred. Deactivation/decline handling is not evidenced as a complete workflow. |
| Scheduling | Create/edit/archive recurring weekly templates with program, room, coach, capacity, booking cutoff, and cancellation cutoff | Owner | IMPLEMENTED BUT UNVERIFIED | `class-templates.ts`, schedule pages/actions/tests, and Prisma `ClassTemplate` exist. |
| Scheduling | Edit/cancel/reschedule one occurrence and edit a recurring series | Owner, coach, members | MISSING | Schedule UI explicitly says one-off changes and per-date exceptions are deferred. Prisma now has `ClassInstance`, but the operational UI still derives occurrences from template plus date and says it does not create instance rows. |
| Staffing | Owner reassigns a class and coach requests a substitute | Owner, coach, members | MISSING | Default coach assignment exists on templates, but no substitute request or one-occurrence reassignment route/library was found. |
| Members | Create, search, view, edit, status, notes, tags, and portal access | Owner | IMPLEMENTED BUT UNVERIFIED | `members.ts`, member pages/actions/tests, and member portal provisioning helpers exist. |
| Family | Link a child to up to two guardians | Owner, prospect | IMPLEMENTED BUT UNVERIFIED | `Guardian`, `FamilyLink`, owner/member logic, and trial code enforce a two-guardian cap. |
| Family | Guardian pays, shares payment method, books for child, views child progress, and supports child-account upgrade | Guardian, child, owner | PARTIAL | Admin/trial booking can associate a linked guardian, but no guardian login/portal, guardian-led booking/payment, child upgrade, or progress-view workflow was found. |
| Trials | Public prospect selects a class, submits details, creates trial/member/guardian records, and receives confirmation | Prospect, guardian, owner | PARTIAL | Public trial routes, `trial-booking.ts`, unit tests, and E2E source exist. The booking path is substantial; launch email confirmation is not wired as an end-to-end delivery path. |
| Forms | Owner uploads/version-controls PDFs, assigns required forms, issues portal/magic-link requests, and tracks signatures against a version | Owner, member, guardian | IMPLEMENTED BUT UNVERIFIED | Admin/member routes, `packages/db/src/forms.ts`, tests, and form/signature models exist. Provider-grade signature polish is explicitly deferred by business decision. |
| Member portal | Login, browse schedule, view upcoming bookings, membership, billing state, and required forms | Member | IMPLEMENTED BUT UNVERIFIED | Member routes and libraries cover these surfaces; historical demo says core portal behavior passed on 2026-05-23. |
| Class access | Member books/cancels a dated class through membership, punch card, or paid drop-in rules | Member, owner | IMPLEMENTED BUT UNVERIFIED | `class-access.ts`, `self-service-bookings.ts`, admin booking, member schedule/actions, checkout support, and tests exist. Admin access priority is membership, punch card, then drop-in. |
| Waitlist | Join, preserve order, cancel, and promote when capacity is unavailable | Member, owner | IMPLEMENTED BUT UNVERIFIED | `WaitlistEntry`, class-access/self-service logic, UI states, and tests exist. Paid drop-ins cannot join waitlist yet. |
| Attendance | Coach opens today's roster and records present/late/absent/no-show | Coach, owner, member | IMPLEMENTED BUT UNVERIFIED | Coach today/roster pages, `rosters.ts`, attendance models, and tests exist. The product distinction between `ABSENT` and `NO_SHOW` remains an open decision. |
| Attendance | Walk-ins, added trial attendees, post-class notes, and history from member profile | Coach, owner | PARTIAL | Roster/attendance core exists; the full P0-20 completion set was not all evidenced as operator actions during source inspection. |
| Memberships | Create monthly plans, restrict programs, assign one current membership, sync/use Stripe identifiers, show billing state | Owner, member | IMPLEMENTED BUT UNVERIFIED | Membership plan/member-membership/Stripe libraries, pages, schema, webhook route, and tests exist. Weekly billing is not approved and no weekly plan path was found. |
| Membership lifecycle | Owner-approved period-end cancellation and immediate/scheduled freeze | Owner, member | PARTIAL | Owner billing actions call `cancelMembershipAtPeriodEnd` and `freezeMemberMembership`; plan policy fields are references only and do not automate notice/approval rules. |
| Membership self-service | Member requests freeze/cancel when owner enables it | Member, owner | MISSING | Portal displays current membership/freeze state but no member request workflow or owner-controlled request setting was found. |
| Access products | Owner enables/configures drop-ins and non-expiring, non-shareable punch cards; member can buy/use them | Owner, member | IMPLEMENTED BUT UNVERIFIED | Access-product admin, member commerce/checkout, class access, schema, and tests exist. Current source enforces access and late-cancel/no-show punch behavior in class-access logic. |
| Stripe | Connect settings, hosted checkout/portal, webhook processing, idempotent event records, subscription/invoice-state updates | Owner, member | IMPLEMENTED BUT UNVERIFIED | Stripe settings, webhook route, `stripe-billing.ts`, `StripeWebhookEvent`, and tests exist. Real credentials/webhook setup were not used. |
| Failed payments | Configurable grace period, recovery queue, retry invoice, and payment-method update request | Owner, member | PARTIAL | Queue/retry and member billing actions exist. Admin UI says the payment update request is marked as sent outside the app; automated notice delivery is absent. |
| Billing history | Member views invoices/receipts and owner sees current plus historical financial records | Owner, member | PARTIAL | Current billing state/records are visible and richer Invoice/Payment models exist, but no complete invoice/receipt portal surface or full-history toggle was found. |
| Refunds and credits | Partial refunds, account credits, and owner-controlled credit applicability | Owner, member | SCAFFOLDED | Prisma has `Refund`, `AccountCredit`, and `CreditRule`; no admin/member route or library usage was found. |
| Messaging | Staff/member 1:1 threads with guardian/child context | Owner, coach, member, guardian | SCAFFOLDED | Conversation/message models exist in schema; no application workflow usage was found. |
| Broadcasts | Owner sends announcements with email delivery | Owner, members | SCAFFOLDED | Announcement and notification models exist; no owner broadcast UI/action was found. |
| Launch email | Trial confirmation, booking confirmation, class reminder, failed-payment notice, announcement, payment-method update request | Owner, member, prospect | PARTIAL | `notification-outbox.ts` supports all six kinds and retry state. Only migration-completion code was found enqueuing a notification; adapter is development-only and no production delivery worker/provider wiring was found. |
| Events | Owner publishes prepaid events; member books/pays | Owner, coach, member | SCAFFOLDED | Event and EventBooking schema exist; no application route/library usage was found. |
| Private lessons | Owner exposes prepaid coach-assigned slots; member books/views them | Owner, coach, member | SCAFFOLDED | PrivateLessonSlot/Booking schema exist; no admin/member route/library usage was found. |
| Progress | Optional belts, current-belt stripes, promotion history, hidden UI when disabled | Owner, coach, member, guardian | SCAFFOLDED | Progress models and a program-level flag exist; no full progress management/view workflow was found. |
| Reporting | Active members, trials, attendance by class, failed payments, revenue, new members, cancellations | Owner | PARTIAL | Dashboard has classes/bookings/trials/billing attention and owner queues. Deeper reporting, revenue, acquisition, and cancellation surfaces were not found. |
| Migration | White-glove intake, CSV upload, validation, staging, import, reconciliation, review, go-live, and readiness marking | Owner, Flowstate operator | IMPLEMENTED BUT UNVERIFIED | `workspace-migration.ts` is a substantial implementation with UI/actions/tests/E2E source and reconciliation records. It is newer than stale README/domain descriptions. No current execution or representative export rehearsal occurred. |
| Migration | Dedicated Zen Planner preset/import semantics | Flowstate operator, owner | SCAFFOLDED | `ImportSourceType` includes `ZEN_PLANNER`, but current migration upload creates `sourceType: "CSV"`; no Zen Planner preset or adapter was found. |
| Migration | Full replacement-history breadth and cutover safety | Owner, Flowstate operator | PARTIAL | Models/kinds cover members, family, plans, memberships, billing history, punch balances, notes, staff, progress, attendance, and schedule templates. Proof against real export variants, duplicate edge cases, rollback, delta/cutover, and reconciliation sign-off is absent. |
| API | Public API/integration surface | Buyer/integrator | SCAFFOLDED | `apps/api` exposes health only. This is not an MVP blocker because public API and integration marketplace are explicitly deferred. |
| Security/operations | Role/workspace isolation, migration safety, operational monitoring, backup/recovery, production readiness | All | PARTIAL | Explicit owner/member access helpers and auth/role test source exist. This audit did not run security checks and found no evidence sufficient to claim production monitoring, backup/restore rehearsal, or pilot operations readiness. |

## Approved product scope and business rules

### Repository facts and approved decisions

- Primary product: a one-location, web-only gym management platform for Muay Thai gyms and Hyrox/HIIT-style class studios, with owner, coach, and customer roles.
- Multiple rooms may exist inside the single primary location; multi-location, franchises, native mobile, SMS, push, public API, and integration marketplace are deferred.
- Stripe is the approved payment rail. The demo may degrade gracefully without credentials, but live checkout, Connect, billing portal, and webhooks require real configuration.
- Supported commercial product types are recurring **monthly** memberships, drop-ins, and punch cards. Weekly plans are explicitly unsupported.
- Punch cards do not expire, are not shareable, may be general or program-restricted, and consume a punch for late cancellation or no-show.
- Events and private lessons are intended to be prepaid; private lessons require coach assignment.
- Membership cancellation requires owner approval and takes effect at billing-cycle end; notice rules must eventually be owner-configurable.
- Freezes may be immediate or scheduled, require owner approval, and may expose an owner-controlled self-service request.
- Failed-payment grace period is owner-configurable; retry and payment-method update request are required.
- Partial refunds and account credits are approved MVP scope, with owner control over credit applicability.
- Email-only launch communications include trial/booking confirmations, class reminders, failed-payment notices, announcements, and payment-method update requests.
- Migration is white-glove and migration-first. Owners supply context/exports and review outcomes; Flowstate handles internal mapping, validation, staging, import, reconciliation, and go-live coordination.
- The product must not promise perfect one-click migration.

### Commercial decisions not present

- No approved price, packaging, contract term, discount, implementation fee, migration fee, trial policy, support SLA, refund promise, or guarantee was found.
- No customer commitment or approved claim that every relevant Zen Planner export variant can be migrated was found.
- No approved promise exists for native mobile, multi-location, weekly billing, SMS/push, public API, or advanced reporting.
- Pricing and packaging remain outside this agent's authority and require Jacky's explicit approval.

## Customer fit and buyer language

### Evidence

The repository defines the buyer as the owner/operator of a single-location Muay Thai gym or Hyrox/HIIT-style class studio. It records these pains: clunky tools, annoying scheduling/attendance, hard-to-trust billing, weak member self-service, and migration risk. It defines buyer-confidence moments as self-created workspace, schedule visible in member portal, member booking visible in roster, and understandable billing state.

The implementation maps well to that language in four areas:

1. **Migration without losing control** — status stages, validation issues, reconciliation summary, and explicit readiness gating support a managed-switch narrative.
2. **Calmer daily operations** — the owner dashboard, today's roster, capacity, attendance, trial, and billing attention cues support a “what needs attention now” narrative.
3. **Member self-service that reaches the floor** — schedule booking flowing to owner/coach roster is the strongest demo proof point.
4. **Billing state you can understand** — current membership/billing state, failed-payment queue, retries, and graceful no-Stripe mode are stronger claims than complete financial operations.

### Hypotheses requiring customer evidence

- The stated pains and confidence moments are repository assumptions; no interview transcripts, survey results, CRM notes, win/loss evidence, signed pilot criteria, usage analytics, or validated buyer quotes were found.
- “Zen Planner replacement” is a product thesis, not a currently proven parity or migration claim.
- Muay Thai and Hyrox/HIIT may share class operations, but their differences in family accounts, progress/ranks, event/private-lesson mix, attendance policies, and billing expectations have not been validated in inspected evidence.
- White-glove migration may be attractive, but the acceptable owner effort, turnaround time, data-loss tolerance, and willingness to pay are UNKNOWN.
- The code contains copy promising an initial migration review within one business day after exports/access are received. No approved staffing model or service-level commitment was found, so this should be treated as a commercial risk rather than a safe promise.

### Safe current buyer language

- “Flowstate is being built for one-location Muay Thai gyms and class-based HIIT/Hyrox studios that want calmer scheduling, attendance, billing visibility, member self-service, and a guided move from legacy software.”
- “The current demo connects owner setup, recurring schedules, member booking, rosters, attendance, forms, and core billing state.”
- “Migration is designed to be guided, validated, and reviewable rather than one-click.”

### Unsafe current buyer language

- “Complete Zen Planner replacement.”
- “Your full history will migrate automatically.”
- “Pilot-ready” or “production-ready.”
- “Automated email reminders are live.”
- “All billing, refunds, credits, receipts, family accounts, events, private lessons, and schedule exceptions are complete.”
- Any price, migration turnaround, uptime, support, data-loss, or go-live guarantee.

## Demo readiness versus pilot readiness

### Demo readiness

**PARTIAL**

Historical evidence dated 2026-05-23 records passing lint, type checks, tests, build, API health, and successful admin/member demo workflows through booking and roster. Current source expands the demo with migration-first onboarding and operations. However, the current HEAD was not rerun in this audit, and the historical demo predates the latest migration commit.

A bounded demo can responsibly show:

- owner signup/login and migration-first onboarding;
- migration status and representative CSV staging/reconciliation, clearly labeled as a demo;
- programs, rooms, recurring schedules, members, memberships, punch/drop-in products;
- public trial intake without claiming delivered confirmation email;
- member login, schedule, booking/cancel/waitlist, membership/billing state, and forms;
- owner/coach roster, attendance, and failed-payment queue in non-live or test mode.

### Pilot readiness

**BLOCKED**

Material blockers or scope decisions:

1. Current tests/build/E2E/browser evidence must be rerun on the exact candidate, including the new migration-first path.
2. A representative, sanitized Zen Planner export must be mapped, dry-run, imported, reconciled, and cut over with rollback/delta handling documented.
3. One-occurrence class edit/cancel/reschedule and substitute-coach handling are required for real daily operations.
4. Staff invite acceptance and role onboarding need a complete path or a documented manual pilot procedure.
5. Launch email needs real provider/worker wiring, event triggers, retries, observability, and safe content review.
6. Stripe test-mode onboarding/webhooks and failure recovery need end-to-end verification; invoices/receipts, partial refunds, and credits need either implementation or explicit pilot exclusion/manual procedures.
7. Guardian booking/payment, self-service freeze/cancel requests, and family account boundaries need a pilot-scope decision.
8. Backup/restore, monitoring, support ownership, incident handling, privacy/data-retention, and production security evidence are UNKNOWN.
9. Approved MVP includes messaging, broadcasts, events, private lessons, progress, and reporting depth that are not complete. Jacky must either narrow first-pilot scope or fund those workflows before broad replacement claims.

## Migration and launch-email readiness

### Migration

**PARTIAL** for commercial readiness; **IMPLEMENTED BUT UNVERIFIED** for the current CSV-oriented source path.

Positive evidence:

- Migration-first onboarding is an accepted business decision.
- Workspace readiness is gated until migration is complete and explicitly marked operational.
- Current code provides intake fields, stages, CSV upload, staging records, validation issues, import jobs, imported-record tracking, reconciliation reports, and owner/operator UI.
- Migration imports are separated from production models and use record-kind-specific logic.
- The current schema and latest migration add `WorkspaceMigration` and `MigrationImportedRecord`.

Risks:

- Current upload jobs are hardcoded as CSV even though the schema supports `ZEN_PLANNER`.
- No evidence was found for a maintained Zen Planner field preset, export-version compatibility matrix, attachment handling, or a real-export fixture.
- Reconciliation source exists, but no current run demonstrates full historical count/financial agreement or go-live rollback.
- The owner-facing one-business-day review expectation is not backed by an approved operating capacity/SLA.
- README and `domain_model.md` are stale: they describe migration or reliability-foundation entities as upcoming/planned despite current schema and committed implementation.

### Launch email

**PARTIAL**

Positive evidence:

- Notification job schema and outbox processing support pending/sending/sent/failed state, claim-before-send, retries, and the six approved email kinds.
- A development adapter exists.

Risks:

- No production email provider adapter, worker/scheduler entrypoint, or application-wide processing invocation was found.
- Only migration completion was found enqueuing a notification; trial, booking, reminder, failed-payment, announcement, and payment-update triggers are not wired end to end.
- Staff invite delivery is explicitly deferred.
- A queued job must not be presented as delivered email.

## Unresolved decisions requiring CEO / Jacky approval

1. Confirm whether the first paid pilot is a narrow demo-core pilot or must satisfy the full approved MVP ledger.
2. Confirm whether events, private lessons, progress, messaging/broadcasts, guardian self-service, refunds/credits, and full reporting are pre-pilot requirements or documented post-pilot scope.
3. Approve the operational definitions of `ABSENT` versus `NO_SHOW` and any downstream penalties/reporting.
4. Approve no dedicated make-up-class workflow for MVP, or define the manual/credit exception.
5. Approve owner-managed end-of-cycle membership upgrades with no automatic proration for MVP.
6. Approve re-inviting revoked/declined coaches through a new invite record and define decline handling.
7. Decide whether a dedicated emergency-contact field is required for pilot safety.
8. Decide minimum schedule-exception scope: at least cancel, reschedule, substitute, member notification, and impact on bookings/waitlist.
9. Decide the supported Zen Planner export versions/data quality, reconciliation tolerances, owner sign-off, rollback, and service turnaround; remove the one-business-day wording unless explicitly staffed and approved.
10. Decide pilot billing exclusions/manual procedures for refunds, credits, receipts, invoice history, freeze/cancel requests, and payment-update communications.
11. Approve pricing, packaging, migration fees, contract terms, support commitments, and any external claims separately; none are established by this audit.

## Recommended recovery tickets for synthesis

These are recommendations only; no board/product tickets were created or changed.

1. **M0 — Verify current HEAD and reconcile source-of-truth docs**
   Run lint, type checks, unit tests, build, both E2E specs, and desktop/tablet/mobile browser evidence on the exact candidate; update stale README/domain/demo claims only after results. Acceptance should record exact commands, current commit, fixtures, and screenshots.

2. **M1 — Complete real-world class occurrence and substitute operations**
   Implement one-occurrence edit/cancel/reschedule, recurring-series impact rules, coach reassignment/substitute requests, booking/waitlist consequences, member notification hooks, role boundaries, and tests.

3. **M2 — Make migration pilot-safe using a representative Zen Planner export**
   Add a versioned preset/fixture, field mapping, duplicate/idempotency rules, dry-run preview, record/financial reconciliation, delta/cutover checklist, rollback, operator runbook, and explicit owner sign-off. Avoid production/customer data until approved.

4. **M2 — Wire launch email as an observable operational workflow**
   Add approved provider configuration, worker/scheduler, triggers for all approved messages, staff invite delivery, retry/dead-letter handling, content review, audit visibility, and test-mode E2E proof.

5. **M2 — Close billing trust gaps or define manual pilot controls**
   Verify Stripe test-mode Connect/checkout/webhooks/failure recovery; implement member invoices/receipts, partial refunds, credits, payment-update notices, and policy-controlled freeze/cancel requests, or document explicit pilot exclusions with owner-safe manual procedures.

6. **M2 — Complete family access boundaries**
   Define guardian authentication, child selection, guardian booking/payment context, two-guardian permissions, form signing, and child account upgrade; test cross-family isolation.

7. **M3 — Commercial onboarding and pilot readiness package**
   After Jacky approves pricing/scope, define qualification criteria, supported migration inputs, responsibility matrix, support/escalation path, success measures, and claims checklist. Do not turn hypotheses into commitments without buyer evidence.

## Evidence / technical details

### Sources inspected

- `.hermes.md`
- `README.md`
- `docs/product_decisions_ledger.md`
- `docs/01-decisions/Business Decision Log.md`
- `docs/02-product/Customer And ICP.md`
- `docs/open-product-questions.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/04-demo/Working Demo State.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/BA Sales.md`
- `packages/db/prisma/schema.prisma`
- every SQL migration under `packages/db/prisma/migrations/`
- admin/member/API route inventory
- admin/member/auth/database domain libraries
- 33 unit-test source files and 2 E2E spec source files by inventory
- targeted migration, onboarding, booking, billing, forms, notification, access, roster, and portal source/tests
- current Git branch, HEAD, status, changed paths, and untracked paths
- Kanban task `t_a7a44662` and downstream synthesis task `t_f36a1ffb`

No Amber material was used.

### Database evidence

Current Prisma source contains 48 enums and 65 models across 1,884 lines. Fourteen SQL migrations were inspected:

1. `20260404043358_init_phase2_slice1` — users, workspace, one location, rooms, workspace users, staff invites/settings.
2. `20260404045000_auth_sessions_phase3` — auth sessions and user/workspace constraints.
3. `20260404050000_email_and_invite_constraints` — email/invite constraints.
4. `20260405090000_programs_and_room_archival` — programs and room archival.
5. `20260406120000_class_templates_schedule_slice` — weekly class templates.
6. `20260407120000_member_trial_booking_slice` — members, guardians, family links, initial trials.
7. `20260408120000_booking_roster_attendance_slice` — bookings and attendance; replaces the initial trial-booking table.
8. `20260408130000_memberships_billing_slice` — monthly membership/billing/Stripe state.
9. `20260408220000_member_portal_slice` — member-to-user portal link.
10. `20260409160000_access_products_waitlist_slice` — punch cards, drop-ins, waitlist.
11. `20260410120000_forms_signing_slice` — versioned forms/signatures.
12. `20260425120000_reliability_foundation` — class instances; deeper financial, migration, progress, messaging, notification, events, and private-lesson models.
13. `20260524030800_index_name_alignment` — index naming alignment.
14. `20260530120000_migration_first_onboarding_ops` — workspace migration status and imported-record idempotency.

Important conflict: `docs/domain_model.md` still says `ClassInstance` is not persisted and labels many current schema models planned. That document is stale relative to Prisma. Application scheduling is also stale relative to the schema: current booking UI explicitly continues to derive occurrences and not create class-instance rows.

### Implementation/test inventory evidence

- Admin routes cover signup/login/onboarding, migration, dashboard, staff invites, programs, rooms, weekly schedule, bookings, roster/attendance, members, forms, membership plans, access products, billing, and Stripe settings/webhook.
- Member routes cover login, trial, schedule, bookings, membership, billing, checkout, and portal/magic-link forms.
- API exposes health only.
- Current libraries include substantial domain logic for access products, bookings, class templates/access, dashboard, failed payments, forms, memberships, members/family, rosters, Stripe, member commerce, self-service booking, trials, notification outbox, occurrences, and migration.
- Test-source inventory found 33 `*.test.ts` files and two Playwright E2E specs: `flowstate-demo.spec.ts` and `migration-first-onboarding.spec.ts`.
- Tests were inspected but not executed because this task was a read-only recovery audit. Presence of test source is not a passing result.

### Git evidence

- Branch: `main`
- HEAD: `4dd55571d33814b687588163b53e48d7155ecfa4` (`feat: add migration-first onboarding operations`, committed 2026-06-09)
- Pre-report working tree already contained unrelated modified/deleted `node_modules` artifacts, modified documentation, and untracked `.hermes.md`, `docs/Agents/`, and `docs/status/` files.
- No existing product source-code diff was shown by `git status`; the audit did not alter or clean any pre-existing change.
- This report is the only file intentionally created by this task.

### Board evidence

- `t_a7a44662` is the running BA/Sales recovery evidence task.
- `t_f36a1ffb` is the downstream synthesis task and depends on this report plus eight peer evidence tasks.
- The synthesis task records that the hitlink board was empty at orchestration start and requires recovery cards to be distinguished from pre-existing product tickets.
- Current board evidence inspected here shows recovery coordination, not a reconciled executable product backlog. This audit did not create, edit, close, or reconcile tickets.

### Commands / operations actually used

Read-only file/search/Python inventory tools and read-only Git/board queries were used. Safe calculations counted schema enums/models, migration SQL files, unit-test files, and E2E specs. No tests, build, app server, database migration, email delivery, Stripe action, browser mutation, commit, push, deploy, production credential, or customer data operation was performed.
