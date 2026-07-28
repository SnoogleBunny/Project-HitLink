# Project Recovery Audit

Status date: 2026-07-21
Repository candidate: `4dd55571d33814b687588163b53e48d7155ecfa4` on `main`
Canonical companion: `docs/PROJECT_RECOVERY_WORKFLOW_MATRIX.md`

This audit reconciles the current repository, Prisma schema and migrations, automated tests, observed local commands, nine specialist recovery reports, final QA, final BA/Sales, CEO local verification, and the current recovery-board context. It does not authorize implementation, merge, deployment, external outreach, live Stripe, launch email, or production credentials.

Status semantics are strict and use only the recovery assignment's vocabulary: `VERIFIED COMPLETE`, `IMPLEMENTED BUT UNVERIFIED`, `PARTIAL`, `SCAFFOLDED`, `BROKEN`, `MISSING`, `BLOCKED`, `DEFERRED`, and `UNKNOWN`. Source code plus focused tests can support `IMPLEMENTED BUT UNVERIFIED`; an incomplete path is `PARTIAL`; schema or UI without a material runtime path is `SCAFFOLDED`; an observed defect is `BROKEN`; an unmet approved workflow is `MISSING`; an external or decision hard stop is `BLOCKED`; approved later scope is `DEFERRED`; and insufficient evidence is `UNKNOWN`. No whole cross-functional workflow currently has enough evidence for `VERIFIED COMPLETE`.

## 1. Executive summary

Flowstate is not an empty prototype. It is a substantial one-location, web-only modular monolith with owner, coach, customer, public-trial, member-portal, booking, waitlist, attendance, forms, membership, access-product, Stripe, migration, landing, and database surfaces. The current schema contains 65 models and 48 enums, and 14 committed migrations replayed on disposable PostgreSQL. The recovery evidence also records 162 current Vitest tests passing, Prisma validation passing, root lint and type checks passing in the audited environment, and direct Next builds passing for admin, member, landing, and API.

That implementation depth does not equal a safe demo or pilot. The connected demo is currently broken by migration-readiness fixture state and a public-trial cutoff/date defect. The canonical Windows build and clean E2E dependency bootstrap are not reproducible. A clean database replay has one Prisma index-name drift. The current migration handoff can be self-approved by an owner without proved blocking-condition checks. Launch email has an outbox helper but no production adapter, scheduled caller, complete event producers, or functioning retry path. Stripe code is broad but unsafe to enable for real money until paid-state, idempotency, capacity, transaction, replay, and reconciliation gaps are closed.

Commercially, the present state supports a guided code-backed product walkthrough, not an unattended pilot and not a claim of live billing, email delivery, complete migration, or 12–18 concurrent client readiness. Before technical work resumes, CEO/user review should impose a commercial containment gate: keep live payments and launch email disabled; do not promise pilot capacity or completed Zen Planner migration; and approve, revise, or remove the public 15% grandfathered-pricing promise.

The immediate recovery sequence is:

1. `M0 Recovery/stabilization`: repair the broken connected demo and repository/DB reproducibility without widening product scope.
2. `M1 Demo-ready core`: prove owner and member authentication, recurring schedule, trial, booking, waitlist, attendance, forms, and non-paid member portal as one connected local demo.
3. `M2 Pilot-safe`: close payment, launch email, authorization, data-integrity, account-recovery, guardian, migration, operational, accessibility, and policy gates.
4. `M3 Repeatable commercial onboarding`: prove white-glove migration, Zen Planner presets, repeatable cutover/support, and remaining approved MVP depth.
5. Expansion later: multi-location, native mobile, SMS/push, public API, integrations marketplace, and advanced analytics remain outside the MVP.

## 2. Where development appears to have stopped

The current HEAD is `4dd55571d33814b687588163b53e48d7155ecfa4`, committed 2026-06-09 with subject `feat: add migration-first onboarding operations`. The preceding product commit is `11e262040a31fe70476e7b6f7899c6cecbd03877` on 2026-05-30, `docs: add migration-first onboarding initiative`. The last three landing-focused commits are from 2026-05-28. This history, the source diff described by the recovery reports, and the isolated migration-first Playwright success all point to migration-first onboarding as the last coherent development slice.

The May 23 working-demo document is useful historical evidence, but it predates the June migration gate and cannot establish current readiness. On the current candidate:

- the isolated migration-first onboarding spec passes;
- the connected demo spec fails because the seeded demo owner is redirected to migration and because trial/member bookings resolve to different occurrence dates;
- the public trial path accepts a dated class after its booking cutoff;
- the current database schema physically replays but differs from Prisma expectation by one truncated index name;
- canonical build and clean E2E discovery fail on the declared Windows workflow even though direct app builds pass.

Therefore development appears to have stopped after landing the migration-first operational machinery, before fully reconciling it with the prior demo fixture, shared occurrence semantics, portable repository bootstrap, migration drift, privileged handoff boundaries, and provider-backed launch flows. No commit is presently proven as a whole-repository green baseline.

## 3. Current architecture

Flowstate is a pnpm/Turborepo TypeScript monorepo built as a modular monolith:

- `apps/admin-web`: Next.js 16 owner/coach administration, public signup/onboarding, migration, schedule, roster, members, products, forms, billing, and Stripe webhook route.
- `apps/member-web`: Next.js 16 customer portal, public trial booking, self-service booking, billing, purchase, and form-signing routes.
- `apps/landing-web`: public marketing and waitlist capture.
- `apps/api`: currently a health-oriented Next application rather than an implemented public product API.
- `packages/auth`: cookie/session primitives shared by web apps.
- `packages/db`: Prisma client, schema, migrations, occurrence/form/notification helpers, and demo seed.
- configuration/UI packages: shared tooling exists, but recovery review found app-local design systems still diverge and the shared UI package is not the controlling application design layer.

The implemented data shape is PostgreSQL through Prisma. `packages/db/prisma/schema.prisma` is authoritative for current structure. It contains a unique `Location.workspaceId`, so the physical model enforces one location per workspace while allowing multiple rooms. The schema also contains future or dormant domains such as `ClassInstance`, refunds, credits, messaging, events, private lessons, and progress. Their presence does not establish working product behavior.

Most business behavior is implemented through Next server actions and app-local libraries rather than a separate HTTP domain API. Authentication and authorization use server-side session/context helpers. Stripe webhook handling is inside the admin app. Migration import logic is concentrated in `apps/admin-web/lib/workspace-migration.ts`. This is consistent with the approved modular-monolith boundary and does not justify microservices.

Important architectural gaps are not a reason to redesign the platform wholesale. Recovery should preserve the monolith and make boundaries explicit: one shared occurrence truth, one safe workspace/actor resolution path, transactional product writes around provider events, an operational notification worker/adapter boundary, and a clearly separated migration operator versus owner-review boundary.

## 4. Current working workflows

No row in the canonical workflow matrix is marked `VERIFIED COMPLETE`. The following workflows nevertheless have meaningful current implementation, focused tests, and enough evidence to retain rather than rebuild. They are `IMPLEMENTED BUT UNVERIFIED` until their connected runtime, authorization, recovery, and persistence paths are exercised on the current candidate:

- Owner signup, login, session, logout, and role-based routing.
- Migration-first creation of one workspace, one location, owner membership, and migration intake.
- Room and program CRUD.
- Recurring weekly class-template CRUD with room, program, coach, capacity, booking cutoff, and cancellation cutoff.
- Owner member directory/profile and portal credential provisioning.
- Family-link creation with up to two guardians.
- Owner manual booking and the non-paid member self-service schedule/booking/cancellation source paths.
- Ordered waitlist data and owner/coach promotion/removal source paths.
- Coach-today, roster, attendance states, and notes source paths.
- Monthly membership-plan configuration and owner assignment source paths.
- Versioned PDF forms, requirements, member signing, and tokenized guardian signing source paths.
- Core member portal routes for schedule, bookings, membership, billing state, forms, and attendance history.
- Local API health response.

The strongest current automated evidence is scoped rather than end to end: 162 Vitest tests passed across auth/admin/member packages; Prisma validation passed; all 14 migrations replayed on disposable PostgreSQL; direct Next builds passed for all four apps; and the isolated migration-first onboarding Playwright spec passed. These facts protect existing implementation from being mislabeled as absent, but they do not override the final connected failures.

## 5. Partially working workflows

The following approved workflows have useful pieces but lack required behavior or a safety property. They are `PARTIAL` in the matrix:

- Workspace migration readiness: route gating works, but the current owner action can activate operations without proved operator authority or complete readiness invariants.
- Ongoing primary-location/timezone settings and billing/cancellation/freeze policy configuration.
- Staff invite records: create/resend/revoke exists; delivery and acceptance do not.
- Public trial lifecycle: form and data writes exist; cutoff enforcement, shared date truth, delivery, and end-to-end confirmation do not.
- Walk-ins, full post-class notes/history, and correction/audit behavior.
- Membership freeze/cancellation: owner actions exist; scheduled behavior, owner-configurable policy enforcement, customer requests, and provider rollback are incomplete.
- Punch-card and drop-in commerce: configuration and access logic exist; safe provider fulfillment does not.
- Stripe subscription/invoice synchronization and failed-payment recovery: source paths exist; provider replay, transactional integrity, notification, and reconciliation are incomplete.
- Invoice/receipt history: current records render, but the approved actionable/default versus full-history behavior is not complete.
- Guardian magic-link signing: tokenized signing exists, but secure delivery and recovery are absent.
- CSV migration: staging/import/reconciliation is substantial, but import atomicity, representative export proof, actor separation, and cutover safety are incomplete.
- Landing waitlist: form and persistence-aware helper exist; production durability, consent, abuse prevention, and operational ownership are unproven.
- Localization: workspace-local calculations exist, but no i18n runtime, catalog, preference, or launch-language baseline exists.
- Role/workspace isolation: explicit access helpers exist, but cross-workspace adversarial integration and same-workspace relational integrity are not proved.
- Owner reporting: operational aggregates exist, but the approved revenue, new-member, cancellation, and reconciliation set is incomplete.

## 6. Broken workflows

These are observed failures or hard safety stops on the current candidate. Reproduced defects map to `BROKEN`; unresolved external, authorization, or safety gates map to `BLOCKED`; and incomplete but not directly failed paths remain `PARTIAL` in the canonical matrix:

1. Public trial booking ignores the workspace-local booking cutoff. Final QA booked a trial after the occurrence start/cutoff. Listing and submission both require server-side correction.
2. The connected demo does not produce one occurrence truth. Trial and member bookings land on different dates, so the intended combined roster assertion fails.
3. The demo seed does not satisfy the new migration-readiness gate. Demo owner login redirects to `/dashboard/migration` instead of `/dashboard`.
4. The canonical Windows root build fails because package lifecycle wrappers assume a POSIX shell and environment sourcing. Direct app builds passing does not repair the canonical command.
5. Clean E2E bootstrap/discovery is not reproducible from declared manifests. Recovery evidence required a dependency/junction workaround.
6. Clean PostgreSQL replay reports one Prisma drift caused by an authored index name longer than PostgreSQL's identifier limit.
7. Notification jobs moved to failed state are given a next-attempt time, but the processor selects only pending jobs. There is no runtime caller or production adapter, so failed email is not retried or delivered.
8. Live Stripe use is blocked. Checkout fulfillment does not yet prove confirmed-paid gating, provider idempotency, final capacity/session validation, atomic entitlement/booking creation, replay, and reconciliation.
9. Migration handoff authority is broken as a pilot boundary. `markMigrationReadyAction` requires an owner and directly marks the workspace active; current code does not prove an authorized Flowstate operator decision or zero unresolved blocking issues.

## 7. Missing workflows

The following approved MVP workflows are either `MISSING` (no material application path) or `SCAFFOLDED` (schema or fragments without a usable runtime workflow) in the matrix:

- Owner, coach, and customer forgotten-password recovery.
- Coach invite email acceptance and first-login journey.
- One-off class edit, cancellation, rescheduling, and per-date room/coach/capacity changes despite the dormant `ClassInstance` schema.
- Substitute-coach request and one-occurrence reassignment.
- Guardian self-service to select a child, book, pay, view progress, and support child-account upgrade.
- Optional belts, current-belt stripes, promotion history, and complete disabled-module hiding.
- Prepaid event creation, discovery, purchase, booking, cancellation, and refund.
- Prepaid private-lesson availability, coach assignment, purchase, booking, and portal view.
- Partial refund and account-credit workflows despite schema models.
- Staff-member one-to-one messaging with family context.
- Owner broadcast creation and delivery.
- Dedicated Zen Planner preset/import semantics and representative fixtures.

Launch email is not classified as simply absent because an outbox and template kinds exist, but the operational delivery workflow is `BLOCKED` and must not be claimed as launch-ready.

Approved deferred scope remains `DEFERRED`: weekly billing, multi-location, native iOS/Android, SMS, push, public API, integrations marketplace, POS/retail, payroll/commissions, and advanced BI.

## 8. Database risks

The schema is broad and the migration history is recoverable, but it is not yet pilot-safe.

- Inventory: 65 Prisma models, 48 enums, and 14 committed SQL migrations.
- One-location invariant: `Location.workspaceId` is unique, which is consistent with MVP scope.
- Replay: all 14 migrations applied successfully on disposable PostgreSQL 16 and migration status was current.
- Drift: Prisma diff returned a difference for one migration-imported-record index because PostgreSQL truncated a 73-character authored name. This needs an explicit mapped name and additive rename; applied migration history must not be rewritten.
- Tenant integrity: 151 foreign keys exist, but the database audit found no composite same-workspace foreign keys. App scoping therefore carries more of the cross-workspace safety burden than database constraints.
- Capacity concurrency: the database can accept more active bookings than occurrence capacity. Current paths use count-then-write without proved isolation/locking, and the trial path bypasses equivalent cutoff/capacity truth.
- Dormant occurrence model: `ClassInstance` is related from bookings, waitlist and attendance but has no application runtime usage. Current operations derive occurrences from templates and dates, creating two competing future architecture shapes.
- Partial transactions: migration import can create operational rows before a job is marked failed; membership/billing/webhook state and audit writes can split across failures.
- Seed safety: the demo seed lacks a proven non-production target guard and deletes by names/fixed fixture identities. It must be tested only against disposable databases.
- Generated client: default Prisma generation encountered a locked Windows DLL in one audit path, while binary-engine generation passed. Clean bootstrap policy must be explicit rather than relying on existing artifacts.

Database changes require `hitlink-db` review, disposable PostgreSQL upgrade and fresh-replay evidence, row-preservation proof where relevant, QA review, BA/Sales review, and CEO decision before merge.

## 9. Authentication and authorization risks

The implemented auth helpers are a useful base, but the current evidence does not prove complete identity and tenant safety.

- Owner, coach, and customer are the only approved MVP roles. A separate front-desk role is not approved. Migration recovery cannot silently invent an internal product role.
- The migration page combines owner-visible status with internal upload/import/stage/readiness controls. The existing owner-authorized readiness action violates the intended service boundary and needs an explicit decision: external operator capability, tightly scoped internal process, or another approved mechanism.
- Cross-workspace reads and writes rely heavily on application filters. There is no comprehensive adversarial PostgreSQL integration suite proving guessed-ID and relationship-swap resistance.
- Coach scope is primarily tied to assigned templates. One-off reassignment is absent, so future occurrence work could accidentally broaden or deny coach access.
- Member portal identity is provisioned/reset by staff. There is no user-driven password recovery, and no approved guardian authentication model.
- Magic-link form signing has hashed token and expiry concepts, but secure delivery, reissue, revocation, relationship proof, rate limiting, and legal/evidentiary requirements are not proven as one workflow.
- Provider callbacks are high-trust boundaries. Stripe signature validation exists, but workspace/account mapping, event order, duplicates, atomic state writes, and replay require test-mode proof.
- No production security assessment, secret rotation evidence, rate-limit baseline, privacy request procedure, or audit-log review was found.

M0 should define the cross-workspace isolation test plan and resolve migration handoff authority. M2 must close identity recovery, guardian auth, token lifecycle, provider callback, and operational security findings before pilot.

## 10. Scheduling-model assessment

The current scheduling implementation is template-first. `ClassTemplate` stores weekday, times, program, room, default coach, capacity override, booking cutoff, and cancellation cutoff. Booking, waitlist, and attendance records pair a template with `scheduledForDate`. That model supports the existing recurring schedule and current roster logic.

`ClassInstance` was later added with per-date status, room, program, coach, time, capacity, cancellation reason, and reschedule origin. It is structurally capable of one-off operations, but recovery search found no runtime references under `apps`. The schedule page explicitly says one-off changes and per-date exceptions are deferred. The database relation therefore represents schema readiness, not a usable occurrence workflow.

The immediate correction is not to rewrite scheduling around instances during M0. M0 should establish one shared pure occurrence/cutoff calculation and repair public-trial and connected-demo date truth. M1 should verify recurring templates, owner/member booking, waitlist, and roster against the same date semantics. M2 should then make an explicit architecture decision for `ClassInstance`: materialize on exception, materialize all near-term occurrences, or remove/delay its runtime use. That decision must cover:

- one-off cancellation and rescheduling;
- per-date room, coach, time and capacity changes;
- series edits and future bookings;
- substitute requests and permissions;
- notification fan-out;
- booking/waitlist/attendance foreign-key consistency;
- imported historical and future occurrences;
- capacity locking and audit history.

Until that decision and implementation land, do not claim one-off edits, substitute coverage, or per-date cancellation/rescheduling.

## 11. Payment-readiness assessment

Payment breadth in source is materially ahead of payment safety evidence. Monthly memberships, drop-ins, punch cards, Connect settings, Checkout, customer/portal actions, webhook events, invoice/payment models, failed-payment queues, grace days, refunds and credits are represented at different depths. Weekly plans are explicitly `DEFERRED`.

Live payments must remain disabled. The recovery evidence identifies these pilot-blocking requirements:

1. Checkout fulfillment must require a confirmed-paid provider state, not merely a completed-looking return.
2. Provider event IDs and business operations must be idempotent across duplicate and out-of-order delivery.
3. Paid drop-in fulfillment must revalidate member, product, occurrence, cutoff, and final capacity after payment, with an explicit remedy if the class became unavailable.
4. Entitlement, booking, billing, payment, and audit writes need a transactional or compensating boundary.
5. Connect account/workspace mapping and capability state need Stripe test-mode proof.
6. Subscription and invoice changes need replay and reconciliation evidence.
7. Failed-payment retry, grace enforcement, payment-method update, and member/owner status must be proven together.
8. Partial refunds and account credits need approved applicability rules before implementation; schema presence is insufficient.
9. Invoice/receipt history must distinguish actionable current records from full imported/provider history.
10. No production or real-customer credentials may be used during recovery.

Before any payment implementation packet, `hitlink-db`, `hitlink-backend`, `hitlink-workflow`, QA, BA/Sales, and CEO must review the relevant transaction and product boundaries. Test-mode evidence is required before any pilot recommendation.

## 12. Migration-readiness assessment

Migration-first onboarding is the newest substantial slice and a genuine differentiator, but it is not a proven commercial migration service.

Implemented source covers intake, file upload, validation/staging, multiple import kinds, imported-record tracking, issues, reconciliation, stage updates, and readiness gating. The isolated onboarding Playwright spec passed. The schema includes migration jobs, files, issues, imported records, reconciliation and operational readiness state. This is stronger than stale repository notes that describe only greenfield setup.

Pilot readiness is nevertheless `BLOCKED` because:

- current upload identifies the source as generic CSV even though the schema has a Zen Planner source enum;
- no dedicated Zen Planner preset, sanitized representative fixtures, or export-version matrix exists;
- import execution is not proved atomic and may leave operational rows after failure;
- no delta/cutover strategy handles changes between export and go-live;
- no backup/restore/rollback rehearsal is documented;
- duplicate, missing-field, history, invoice/receipt, progress and schedule variants are not proved against realistic exports;
- owner-facing progress and internal import/readiness controls are mixed;
- owner self-approval can activate operations;
- the demo seed does not represent a completed migration handoff;
- migration completion enqueues a message into a non-operational email path.

M0 should fix the demo fixture, index drift, and readiness authority/invariants. M2 should make generic CSV import atomic and operator-safe and rehearse cutover/rollback. M3 should add and prove a Zen Planner preset with representative, sanitized export variants. Do not promise one-click migration; the approved promise is guided, validated, reviewable white-glove migration.

## 13. UX and design consistency assessment

The public shell is credible. UX review exercised seven guest routes at 1440×900, 768×1024, and 390×844 with no observed horizontal overflow. Login/signup/unauthorized pages have clear hierarchy and usable controls. The landing page has a coherent visual direction. The admin dashboard and member portal have meaningful task-oriented surfaces rather than placeholder screens.

Authenticated operational UX is not yet sufficiently evidenced. The most material findings are:

- migration owner status and internal operator controls are combined on one long page;
- mobile admin navigation can push operational content far below the fold;
- member detail, migration, roster, forms and billing pages are dense and action-heavy;
- no authored `loading.tsx`, `error.tsx`, or `not-found.tsx` exists in admin/member applications, so slow, failed and unknown routes rely on framework behavior;
- consequential actions such as cancellation, promotion, freeze, retry, import and readiness lack a consistent confirmation/outcome pattern;
- member UI focus-visible and reduced-motion behavior is less complete than admin/landing;
- the shared UI package is not the effective source of app components, allowing local design systems to drift;
- no skip-link, comprehensive live-region/field-error association, screen-reader run, zoom/contrast calculation, or authenticated mobile matrix was proved;
- the public landing page publishes a 15% grandfathered-pricing promise in visible copy and structured data without a recorded approval in the canonical decision ledger.

M0 requires CEO review of the pricing copy and separation of migration status from privileged controls. M1 requires screenshot evidence for connected owner/member workflows at desktop, tablet and mobile. M2 requires route recovery states, accessibility acceptance, consequential-action patterns, and authenticated responsive coverage. Design and UX review are mandatory for user-visible candidates; localization review is mandatory when copy, date/time, currency, validation, or email changes.

## 14. Test and build health

The recovery evidence must be read as a mixed result, not a green badge.

| Gate                                  | Observed result                                                 | Interpretation                                                   |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Current commit                        | `4dd55571d33814b687588163b53e48d7155ecfa4`                      | Candidate under audit; no whole-repository green baseline proven |
| Vitest                                | 162 tests passed across auth, admin and member in recovery runs | Good scoped behavior evidence; not provider/database E2E proof   |
| Root lint                             | Passed in the audited environment                               | Static quality gate currently healthy                            |
| Root type check                       | Passed in the audited environment                               | Type gate currently healthy                                      |
| Prisma validate                       | Passed                                                          | Schema parses and validates                                      |
| PostgreSQL migration deploy/status    | 14 of 14 migrations applied; status current                     | Physical history replays                                         |
| Prisma drift diff                     | Non-zero with one truncated index-name difference               | M0 database reproducibility defect                               |
| Direct admin build                    | Passed                                                          | App compiles directly                                            |
| Direct member build                   | Passed                                                          | App compiles directly                                            |
| Direct landing build                  | Passed                                                          | App compiles directly                                            |
| Direct API build                      | Passed                                                          | App compiles directly                                            |
| Canonical `pnpm run build` on Windows | Failed                                                          | Root workflow is not portable/reproducible                       |
| API health                            | Local HTTP 200 with `{ok:true}`                                 | Narrow local health proof only                                   |
| Unauthenticated protected routes      | Redirected to login                                             | Basic guest guard proof                                          |
| Isolated migration-first Playwright   | Passed                                                          | New onboarding slice works in its controlled fixture             |
| Connected demo Playwright             | Failed                                                          | Demo seed/readiness and occurrence-date assertions are broken    |
| Public-trial cutoff probe             | Accepted booking after cutoff                                   | Safety defect reproduced                                         |
| Clean E2E discovery/bootstrap         | Failed without a workaround                                     | Declared dependency graph/bootstrap is incomplete                |
| Stripe and email provider E2E         | Not executed                                                    | Unsafe and unauthorized without approved test setup              |

The current dirty working tree includes pre-existing and concurrent documentation/tooling changes. Recovery must preserve them. Canonical documentation is the only output of this task.

M0 exit requires a clean-checkout transcript on supported Node 20 or 22 and pnpm 10.33.0, canonical build, direct builds, explicit Prisma bootstrap, Playwright discovery, disposable PostgreSQL fresh and upgrade paths, focused trial boundary tests, and the connected demo passing without junction/hoisting tricks.

## 15. Existing-ticket reconciliation

Board history must not be mistaken for product history.

- Reconciliation scope: all 26 product-looking cards that existed before `t_49de7fba` were inspected against this audit and their task history: the 21 synthesis-created implementation/review/CEO cards and the five Stage-1 QA cards. Temporary recovery coordination/history remains non-product evidence. Final live board verification was recorded at `2026-07-21T07:56:04Z`.
- Canonical roadmap size after reconciliation and CEO freeze enforcement: **81 tickets** — **57 `todo`** (dependency-held) and **24 `blocked`**. Reopened: **0**. Reused and updated in place: **22**. Newly created: **59**. Duplicate-closed: **4**. Archived: **4** (the same four duplicate cards; no historical recovery evidence card was archived). The blocked canonical set is **24** tickets, enumerated below; no canonical implementation or review ticket is `ready` or `running`.
- Reused/updated M0 implementation packets (**5**): `t_bbab9bc8` (`blocked`, M0-REC-01), `t_5492e427` (`blocked`, M0-REC-02), `t_b2b7f074` (`blocked`, M0-REC-03), `t_f6e91ecb` (`blocked`, M0-REC-04), `t_0810eec9` (`todo`, M0-REC-05). Canonical reconciliation comments add milestone, business reason/evidence, data/auth impact, risks, estimate and decision dependencies without erasing the original scoped packets.
- Reused/updated M0 review and CEO gates (**16**, all `todo`): `t_343dd71f`, `t_aa858695`, `t_894b1e73`, `t_c5070167`, `t_d243f12a`, `t_0b3c75a7`, `t_c2866ef9`, `t_176f0b8e`, `t_f3ae24ae`, `t_420a292b`, `t_eaca3d30`, `t_22c0f9ca`, `t_9b3803b9`, `t_b650ab0f`, `t_85c22358`, `t_5ffd2712`. The M0-REC-01 QA gate now also has the seed card as a true parent.
- Explicit CEO decision gates (**16**, all `blocked` pending Jacky input): commercial containment `t_7125b74f`; pricing copy `t_e8907d09`; migration actor `t_6c16cb92`; migration sign-off/rollback `t_f244d705`; migration-service promise `t_bc54c8aa`; Stripe gates `t_8bfe1a70`; launch email `t_6159bfc9`; cancellation/freeze `t_09553430`; refunds/credits `t_0947943a`; attendance semantics `t_7d898154`; guardian auth `t_56630380`; e-signature evidence `t_eeb4fce1`; locale/currency `t_14f8dae9`; browser/device/accessibility `t_9424a647`; production operations `t_689b8afb`; occurrence architecture `t_acf86b58`.
- Freeze enforcement: when reconciliation completed, the gateway auto-claimed all 16 material decision cards. CEO immediately reclaimed them before a decision result was accepted and blocked them for explicit Jacky input; no automated decision is authoritative.
- Milestone/phase gates (**3**, all `todo`): M0 exit `t_54f795d6`; M1 exit `t_5c1af7bf`; M2 planning/authorization `t_5a9ce0f1`. These are release/authorization gates, not product implementation.
- M1 executable packets (**5**): reused responsive admin navigation `t_f2e2064c` (`blocked`); connected daily loop `t_c09657d2` (`todo`); deterministic role authentication/workspace isolation `t_3f7e1046` (`todo`); family/forms/signing/non-paid portal `t_e657126b` (`todo`); critical route recovery states `t_a33fbaf4` (`todo`). Every packet is parent-held behind the appropriate M0/decision gate and names allowed/forbidden paths, acceptance, evidence, data/auth impact, risks, estimate, decision dependencies and external boundaries.
- M1 review and final CEO gates (**27**, all `todo`): responsive navigation `t_bbea4268`, `t_421478ed`, `t_d3d7b0da`, `t_3584bf40`, `t_825dceb9`; daily loop `t_4d282154`, `t_2da75b07`, `t_bc49d0c9`, `t_5dac690b`; auth/isolation `t_f37aa530`, `t_0eb49b5c`, `t_76dbd416`, `t_8f4780bd`, `t_e5ac4023`; family/forms `t_6e35996f`, `t_59312b81`, `t_b18cac77`, `t_a4a459f9`, `t_e840ae87`, `t_b9852131`, `t_e62ee80f`; route recovery `t_0c8913b8`, `t_4f55296a`, `t_5d514ff2`, `t_1ff638e0`, `t_54c30f95`, `t_3c756ce7`.
- Known M2 prerequisite consultations (**6**, all `todo`): security/isolation/capacity `t_9117839a`; payments `t_7b42d0ca`; notifications/email `t_0033f699`; CSV cutover/reconciliation `t_77bad86c`; pilot operations/recovery `t_8d2941d7`; guardian/recovery/forms/locale `t_b349e945`. They produce bounded work packets only after M1 exit and the applicable decisions; they do not authorize code or provider work.
- Later backlog placeholders (**3**, all `blocked`): M3 repeatable commercial onboarding `t_3b47f9d3`; optional post-pilot enhancements `t_815bf93a`; deferred expansion scope `t_189f2306`.
- Duplicate-closed and archived dispositions (**4**, all `archived`): index-drift duplicate `t_2175852d` -> `t_b2b7f074`; demo-seed duplicate `t_3f747d38` -> `t_5492e427`; trial-cutoff duplicate `t_bb027307` -> `t_bbab9bc8`; Windows/bootstrap duplicate `t_729bcd38` -> `t_f6e91ecb`. Each archived card has a `DUPLICATE-CLOSED` result naming its canonical replacement and stating that no implementation occurred. `t_f2e2064c` was not closed because its responsive-navigation evidence was valid and it was reused as M1-DEMO-01.
- Temporary recovery coordination cards remain historical/done rather than product work; **0** historical recovery evidence cards were archived in this pass so their outputs and dependency history remain inspectable. No invalid or stale card is `ready`; implementation remains gated by true parent dependencies and explicit CEO decisions.

## 16. Decisions requiring CEO or user approval

These are decision gates, not conclusions made by this audit.

1. Commercial containment: approve the rule that live Stripe and launch email remain disabled and that no 12–18 client, complete migration, or pilot-safe claim is made until milestone evidence exists.
2. Landing pricing promise: approve, revise, or remove the visible and structured-data claim that waitlist customers retain a 15% discount. Record legal/commercial ownership and consistency rules.
3. Migration handoff actor: decide how a Flowstate internal operator can perform import/readiness work while MVP product roles remain owner, coach, customer. Do not invent a fourth customer-facing role silently.
4. Migration sign-off: decide the separation among operator completion, owner review/acknowledgment, and activation; define blocking validation/reconciliation conditions and rollback authority.
5. Migration service promise: define supported source variants, owner effort, turnaround, amendment window, data-loss tolerance, cutover downtime, and support responsibility before selling white-glove migration.
6. Stripe test and production gates: approve the test-account/credential boundary, who can configure it, and the evidence required before test-mode and later live use.
7. Launch email provider: approve provider, sending domain, consent/privacy, bounce handling, retention, support and localization requirements before implementation.
8. Cancellation/freeze policy: decide notice-period representation, scheduled freeze semantics, owner-controlled member requests, denial/appeal, and provider failure behavior.
9. Refund/credit policy: decide allowed refund sources, over-refund prevention, credit applicability, expiry if any, and accounting presentation.
10. Attendance semantics: decide the business distinction between absent and no-show, including punch/membership consequences and correction audit.
11. Guardian authentication: decide how guardians fit within the approved customer role and how one guardian selects/manages multiple children without cross-family exposure.
12. Electronic signature sufficiency: approve the evidence/audit standard and obtain appropriate legal review for waiver, membership, child/guardian and custom forms.
13. Launch locale: decide source language, fallback, supported locale/currency expectations, and whether English-only is an explicit first-pilot constraint.
14. Pilot browser/device/accessibility baseline: approve the minimum supported desktop/mobile browsers and assistive-technology acceptance level.
15. Production operations: assign owners for monitoring, backup/restore, incident response, customer support, privacy requests, retention and security review.
16. Scheduling occurrence architecture: after M0 establishes shared date truth, approve the `ClassInstance` runtime strategy for one-off edits, substitutes and historical imports.

Each material decision should become an explicit `hitlink-ceo` or user-owned decision card during roadmap reconciliation and should block, not merely annotate, dependent implementation.

## 17. Recommended milestones

### M0 Recovery/stabilization

Outcome: establish a reproducible candidate and repair the currently observed connected-demo, database-drift and privileged-readiness failures without adding product scope.

Required outcomes:

- commercial containment and pricing-copy review are recorded;
- public trial listing/submission enforce workspace-local cutoff and share occurrence-date truth with member booking;
- demo seed represents a completed handoff without weakening production migration gates;
- migration-imported-record index drift is repaired additively and both fresh and upgrade paths are clean;
- Windows clean install, Prisma generation, canonical build, direct builds and Playwright discovery are reproducible from declared manifests;
- migration readiness cannot be owner-self-approved and is atomic against approved stage/blocking conditions;
- cross-workspace security integration plan is defined;
- all candidates route through QA and BA/Sales, plus DB/Workflow/UX/Design/Localization where affected, before CEO merge.

Exit evidence: focused tests, 162-or-greater unit baseline, lint/type/Prisma validation, disposable PostgreSQL fresh and upgrade proof, canonical and direct builds, Playwright list, isolated onboarding E2E, connected demo E2E, and exact screenshot evidence for changed UI.

### M1 Demo-ready core

Outcome: one guided, resettable, connected demo proves the core daily loop without real money or production email.

Required outcomes:

- owner and provisioned member authentication work on a deterministic fixture;
- owner manages rooms, programs and recurring schedule;
- public trial, owner/member booking, waitlist, promotion, coach-today, roster and attendance use one occurrence truth;
- member directory, family links, forms/signatures and non-paid member portal work together;
- seeded billing state may be shown, but paid actions remain disabled or visibly unavailable unless M2 gates are met;
- desktop, tablet and mobile screenshots cover every user-visible candidate;
- route loading/error/not-found recovery is prioritized for demo-critical routes.

Exit evidence: clean reset and connected Playwright journey, role/tenant negative tests, responsive screenshots, accessibility smoke checks, and no misleading provider success claims.

### M2 Pilot-safe

Outcome: a bounded one-location pilot can operate with controlled risk and defined support.

Required outcomes:

- account recovery and secure coach invitation acceptance;
- cross-workspace database/application isolation proof and capacity concurrency controls;
- one-off scheduling and substitute workflow after explicit occurrence decision;
- monthly membership lifecycle, drop-in/punch purchases, Connect, Checkout, webhook, invoices, failed payment, refunds/credits and reconciliation proven in Stripe test mode;
- production launch-email adapter, worker, producers, retry, bounce/failure and observability proven in an authorized non-production environment;
- guardian self-service, form evidence/legal gate, policy enforcement and localization baseline;
- generic CSV migration atomicity, representative fixtures, cutover/rollback rehearsal and separated operator/owner handoff;
- monitoring, backup/restore, incident, support, privacy/retention and accessibility baseline.

Exit evidence: provider test-mode E2E, PostgreSQL integration and failure injection, backup/restore rehearsal, security review, operational runbook, pilot acceptance and all specialist reviews.

### M3 Repeatable commercial onboarding

Outcome: Flowstate can onboard the next one-location gym through a repeatable, supportable white-glove process.

Required outcomes:

- dedicated Zen Planner preset and representative export-version corpus;
- repeatable mapping, duplicate handling, dry run, reconciliation, delta cutover, owner sign-off, amendment and rollback;
- migration throughput/support assumptions measured rather than promised;
- optional progress module, prepaid events/private lessons, messaging/broadcasts and complete approved reporting delivered only after pilot-critical dependencies;
- commercial claims, pricing and support commitments match observed evidence.

Exit evidence: repeated onboarding rehearsals, sanitized fixture corpus, support metrics, reconciliation sign-off, BA/Sales review, and CEO approval.

### Expansion later

Multi-location, native mobile, SMS, push notifications, public API, integrations marketplace, POS/retail, payroll/commissions, advanced CRM and advanced BI remain `DEFERRED` until explicit product-direction change after MVP evidence.

## 18. Recommended next five executable tickets

These are bounded M0 work packets, not active authorization. The frozen cards named in Section 15 are evidence-bearing candidates only. `t_49de7fba` must decide whether to reuse, merge, replace or archive them and must build the required review graph. A prior CEO/user commercial-containment decision gate is required before implementation resumes.

### 1. M0-REC-01 — Enforce public-trial cutoff and occurrence-date truth

Owner: `hitlink-backend`
Business reason: the current public path can accept a trial after cutoff and the connected demo splits trial/member bookings across dates.

Allowed scope: `apps/member-web/lib/trial-booking.ts`, its focused tests, a shared pure occurrence helper only if required, and the minimum connected roster assertion.
Out of scope: billing, email, schema redesign, one-off `ClassInstance` operations, unrelated member UI.

Acceptance criteria:

1. Public options exclude an occurrence at or after workspace-local booking cutoff.
2. Submission revalidates occurrence, cutoff, workspace and template before any member/guardian/booking/form write.
3. Immediately-before, exactly-at, after-cutoff, DST/timezone and stale-input tests pass.
4. Trial and member demo bookings resolve to the intended same occurrence.

Evidence: focused tests, member tests/lint/types, connected Playwright roster assertion on disposable PostgreSQL.
Reviews: QA and BA/Sales; DB and Workflow if shared occurrence/persistence semantics change; CEO merge decision.
Candidate for reconciliation: frozen `t_bbab9bc8`.

### 2. M0-REC-02 — Seed a deterministic migration-ready demo workspace

Owner: `hitlink-db`
Business reason: the new readiness gate redirects the seeded demo owner away from the dashboard.

Allowed scope: `packages/db/prisma/seed-demo.mjs`, focused fixture verification, and minimum E2E readiness assertion.
Out of scope: weakening production readiness, live/shared databases, application auth redesign, migration index repair.

Acceptance criteria:

1. Fresh demo reset creates an active workspace whose migration has a completed demo handoff and `operationallyReadyAt`.
2. Production readiness logic remains unchanged.
3. Two consecutive reset/seed runs produce stable logical counts and no duplicates.
4. Demo owner reaches dashboard while isolated onboarding still proves the pre-readiness redirect.
5. Seed refuses or is procedurally prevented from running against a non-disposable target.

Evidence: two disposable PostgreSQL reset/seed runs, redacted state/count queries, DB tests, readiness redirects, cleanup proof.
Reviews: DB, QA, BA/Sales, Workflow for readiness semantics, CEO merge decision.
Candidate for reconciliation: frozen `t_5492e427`.

### 3. M0-REC-03 — Eliminate migration-imported-record index drift

Owner: `hitlink-db`
Business reason: a clean PostgreSQL replay is physically usable but not schema-identical, undermining reproducible upgrades.

Allowed scope: explicit mapped index name in Prisma schema, one additive migration, focused migration verification.
Out of scope: editing applied migrations, unrelated schema redesign, destructive non-disposable reset.

Acceptance criteria:

1. Final index name is explicit and within PostgreSQL identifier limits.
2. Additive migration upgrades the current truncated physical name without rewriting history.
3. Fresh 14-plus-new migration replay succeeds.
4. Upgrade from pre-fix state preserves rows.
5. Prisma diff is clean in both paths and catalog evidence shows expected columns/name.

Evidence: Prisma validate, fresh deploy/status/diff, pre-fix upgrade/diff, catalog query, row-preservation proof.
Reviews: DB, QA, BA/Sales, CEO merge decision.
Candidate for reconciliation: frozen `t_b2b7f074`.

### 4. M0-REC-04 — Make Windows build and clean E2E bootstrap reproducible

Owner: `hitlink-workflow`
Business reason: the declared canonical commands fail from a clean Windows setup and currently depend on artifacts/workarounds.

Allowed scope: root/app manifests, lock/workspace/Turbo/Playwright configuration, and scoped setup verification.
Out of scope: product behavior, UI, domain schema, deployment configuration, secrets, unrelated upgrades.

Acceptance criteria:

1. Supported Node 20 or 22 and pnpm 10.33.0 complete frozen install and explicit Prisma bootstrap from a clean checkout.
2. Canonical root build passes without nested POSIX wrappers or requiring an environment file merely to compile.
3. E2E discovery resolves dependencies from manifests with no junction or hoisted-artifact workaround.
4. `pnpm exec playwright test --list`, root lint/types and all direct app builds pass.
5. The generated-client policy is documented and reproducible on Windows.

Evidence: clean-install transcript with versions, canonical/direct builds, Playwright list, lint/types, dependency manifest diff.
Reviews: Workflow, QA, BA/Sales, DB for Prisma bootstrap, CEO merge decision.
Candidate for reconciliation: frozen `t_f6e91ecb`.

### 5. M0-REC-05 — Enforce migration handoff authorization and readiness invariants

Owner: `hitlink-backend` after explicit decision
Business reason: an owner can currently activate operations through the same page/action used for migration status and import work.

Allowed scope: migration readiness service/action, focused access/readiness tests, minimum blocked-reason UI, schema only after explicit DB consultation.
Out of scope: inventing a new product role, new import kinds, real customer files, provider email, onboarding redesign.

Acceptance criteria:

1. Owner cannot activate operations merely by submitting the current action.
2. CEO-approved actor boundary is implemented without violating the owner/coach/customer guardrail.
3. Approved stage and zero unresolved blocking validation/reconciliation conditions are checked atomically with activation.
4. Duplicate completion is idempotent; failures leave migration/workspace unchanged and return a safe reason.
5. Tests cover unauthorized actor, incomplete stage, blocking issues, duplicate completion, success and rollback/failure.
6. Owner-facing migration status is separated from privileged operator controls at the minimum necessary UX boundary.

Dependencies: M0-REC-02, M0-REC-03, and a CEO/user decision on operator authority and owner sign-off.
Evidence: focused unit tests, disposable PostgreSQL success/failure integration proof, admin tests/lint/types/direct build, desktop/tablet/mobile screenshots if UI changes.
Reviews: Workflow and DB consultation before implementation; QA, BA/Sales, UX/Design for UI boundary, and CEO merge decision.
Candidate for reconciliation: frozen/dependency-held `t_0810eec9`.
