# UX recovery evidence: end-to-end usability and pilot safety

Audit date: 2026-07-20
Kanban task: `t_69a32274`
Role: Flowstate UX Lead
Allowed change: this report only

## Diagnosis

Flowstate has a broad, coherent web surface for a one-location gym: owner setup, migration operations, daily schedule/roster work, public trials, member self-service, billing state, family records, and versioned forms all have repository-backed implementation. The public authentication and permission pages are reachable, readable, keyboard-focusable, and responsive at the three widths exercised.

The product is not yet evidenced as pilot-safe. Authenticated, persistence-dependent journeys could not be exercised safely in this run because no audit database or configured environment was available on `localhost:5432`; the current local servers supported guest checks only. Important recovery paths are absent or incomplete: there is no user-initiated password reset, no guardian self-service portal, no product-specific loading/error/not-found boundaries, no owner UI found for one-off class-instance cancellation/rescheduling, and launch-critical email delivery is still record-first/scaffolded. Live billing recovery remains dependent on Stripe configuration and was not exercised.

The current evidence therefore supports demo-hardening, not a claim of end-to-end pilot readiness. No journey in this report is labelled `VERIFIED COMPLETE`, because the required combination of reachable authorized UI, validation, executing backend, persistence, represented states, handled errors, end-to-end testability, and absence of an obvious blocker was not established in this run.

## Scope and evidence method

Repository facts were established from:

- product and operating sources: `.hermes.md`, `README.md`, `docs/product_decisions_ledger.md`, `docs/01-decisions/Business Decision Log.md`, `docs/mvp_ticket_board.md`, `docs/domain_model.md`, `docs/engineering_rules.md`, `docs/04-demo/Working Demo State.md`, `docs/Agents/Agent Operating Model.md`, `docs/Agents/UX Lead.md`, and `CLAUDE.md`;
- the current database source of truth: `packages/db/prisma/schema.prisma` and all 14 SQL migrations under `packages/db/prisma/migrations/` plus `migration_lock.toml`;
- current admin/member implementation and the full test inventory, including the two Playwright specifications;
- current Git branch, log, status, and diff stat;
- Kanban task `t_69a32274` and its synthesis child `t_f36a1ffb` from the current board;
- safe guest-only rendering and keyboard checks against existing local servers at ports 3100 and 3101.

Observed UI did not create accounts, log in, upload files, submit bookings, sign forms, update payment state, or mutate product data. Screenshots were stored outside the repository at `C:/Users/Jacky/AppData/Local/Temp/flowstate-ux-audit-20260720/`.

## Approved status vocabulary

This report uses only: `VERIFIED COMPLETE`, `IMPLEMENTED BUT UNVERIFIED`, `PARTIAL`, `SCAFFOLDED`, `BROKEN`, `MISSING`, `BLOCKED`, `DEFERRED`, and `UNKNOWN`.

## Journey-by-journey assessment

| Actor / journey | Status | Repository and observed evidence | Usability / recovery assessment | Demo and pilot implication |
| --- | --- | --- | --- | --- |
| Owner creates an account and signs in | PARTIAL | `/signup` and `/login` are implemented in `apps/admin-web/app/signup/` and `apps/admin-web/app/login/`. Guest rendering returned 200 at 1440x900, 768x1024, and 390x844 with no horizontal overflow. `apps/admin-web/lib/auth.test.ts` covers credentials and sessions. | Labels, large controls, concise copy, visible keyboard focus, and a clear signup/login cross-link work. There is no visible forgot-password or account-recovery path. Form errors are visually rendered but auth forms do not provide field-level error association or an evidenced live announcement. | Credible for a guided demo; `PARTIAL` for an unattended pilot because lockout/recovery is a dead end. |
| First owner completes migration-first intake | PARTIAL | Accepted direction is explicit in `docs/01-decisions/Business Decision Log.md:7-19`. `apps/admin-web/app/onboarding/onboarding-form.tsx`, `onboarding/actions.ts`, and `lib/workspace-migration.ts` implement source-system, contact, timeline, material, and handoff data. `tests/e2e/migration-first-onboarding.spec.ts` covers the intended owner flow. | The copy correctly frames a managed handoff rather than making the owner map data. Required fields and server validation exist. Authenticated persistence was not exercised, and no independent recovery from a failed save was observed. | Strong demo story; `PARTIAL` until persistence, interruption/resume, and error recovery are exercised against a clean migrated database. |
| Owner monitors migration stages and readiness | PARTIAL | `apps/admin-web/app/dashboard/migration/page.tsx`, `migration-stage-form.tsx`, and `migration-upload-form.tsx` expose intake, upload, validation, dry-run, reconciliation, and cutover readiness. `WorkspaceMigration` begins at `packages/db/prisma/schema.prisma:460`; imported-record evidence begins at `schema.prisma:1552`. Migration `20260530120000_migration_first_onboarding_ops` adds the operations slice. | Status language and blocked-gate explanations are materially better than a generic progress bar. The page is dense and contains operational concepts; first-use comprehension and whether owners understand what Flowstate versus the gym must do remain assumptions. No authenticated responsive/assistive-technology check was possible. | Suitable for a guided migration demo; `PARTIAL` for pilot cutover because actual files, reconciliation, owner approval, and irreversible launch confirmation were not run end to end. |
| Internal migration operator imports, reconciles, and cuts over | IMPLEMENTED BUT UNVERIFIED | `apps/admin-web/lib/workspace-migration.ts` contains normalization, validation, dry-run, import, reconciliation, and stage-transition logic with extensive unit coverage in `workspace-migration.test.ts`. The migration dashboard actions call this logic. | Guardrails and counts are represented in code. This run did not use customer data, execute a clean-database migration, or confirm rollback/retry presentation after partial failure. | Implementation is credible but operational safety is `IMPLEMENTED BUT UNVERIFIED`; do not describe a real customer migration as proven. |
| Returning owner understands daily priorities | PARTIAL | `apps/admin-web/app/dashboard/page.tsx` and `lib/dashboard.ts` provide attention items, today metrics, migration gating, quick actions, and empty-state copy. | Information hierarchy is task-oriented. Migration gating prevents a dashboard from implying readiness before cutover, matching the accepted decision. Authenticated rendering, realistic data density, and small-screen scanning were not observed. | Useful in a seeded demo; pilot confidence needs realistic-volume evaluation with owners. |
| Owner configures recurring schedule | PARTIAL | `apps/admin-web/app/dashboard/schedule/page.tsx`, `class-template-form.tsx`, `actions.ts`, and `lib/class-templates.ts` implement weekly templates, rooms, programs, coach assignment, capacity, and cutoffs. Unit tests cover template behavior. | Form labels and validation exist. The page exposes many fields at once and has no evidenced progressive first-run guidance. No product-specific loading/error boundary exists. | Guided template creation is demoable; bulk setup and recovery from conflicts are not verified. |
| Owner cancels or reschedules one occurrence / series | MISSING | `ClassInstance` can represent `status`, `cancellationReason`, and `rescheduledFromDate` at `packages/db/prisma/schema.prisma:753-787`. No admin route or action for class-instance cancellation/rescheduling was found; schedule UI is template-oriented. The product ledger says one-off and recurring-series edits are supported at `docs/product_decisions_ledger.md:125-130`. | This is a daily-operations dead end: schema capability is not a usable workflow. Owners cannot be assumed to handle coach sickness, holidays, or room disruption from the UI. | Must be fixed before pilot; a demo should not claim one-off cancellation/rescheduling is available. |
| Owner manages roster, waitlist, and attendance | PARTIAL | `apps/admin-web/app/dashboard/schedule/[templateId]/roster/page.tsx`, `attendance-form.tsx`, `waitlist-panel.tsx`, `actions.ts`, and `lib/rosters.ts` implement roster display, attendance states, walk-ins, waitlist promotion, and notes. Tests cover roster behavior. | Core states are represented and the workflow is consolidated. Authenticated persistence, concurrent changes, stale roster recovery, and touch use during a live class were not observed. | Credible guided demo; pilot requires class-time usability and conflict testing. |
| Coach sees today and records attendance | PARTIAL | `apps/admin-web/app/dashboard/coach/today/page.tsx` and owner/coach access decisions in `lib/admin-access.ts`, `lib/owner-workspace.ts`, and `lib/route-decisions.ts` provide a role-specific daily route. | A today-first surface is appropriate. Coach invitation acceptance is not complete, so acquiring access is not a closed journey. Permission-denied rendering exists, but no signed-in coach journey was exercised. | `PARTIAL`: show only with pre-provisioned demo access; not ready for a real invite-to-first-class workflow. |
| Owner creates and maintains member records | PARTIAL | `apps/admin-web/app/dashboard/members/page.tsx`, `members/[memberId]/page.tsx`, forms, actions, and `lib/members.ts` implement member creation, detail, access, notes, and related records. `Member` begins at `schema.prisma:600`. | Useful detail is concentrated in one profile but the page is long and action-dense. Empty/search/error and high-volume use were not observed. Member credentials are provisioned/reset by staff, with no member self-recovery. | Demonstrable with seed data; pilot needs realistic-volume and recovery checks. |
| Owner links guardians and children | PARTIAL | `Guardian` and `FamilyLink` are implemented at `schema.prisma:644-681`; owner linking forms exist in `apps/admin-web/app/dashboard/members/guardian-link-form.tsx` and member actions. Trial booking also creates guardian/family records and enforces at most two guardians. | Owner setup is present. Relationship and payer implications are not summarized as a family workspace, and downstream guardian self-service is absent. | Family records are demoable; the end-to-end family promise is not. |
| Guardian manages children, books, pays, and views progress | MISSING | Product direction requires guardian management at `docs/product_decisions_ledger.md:175-185`. No guardian dashboard/routes were found in `apps/member-web/app`; the member shell and auth resolve the member portal, while guardian participation is primarily form-signing via magic link. | A guardian can be linked and may sign a requested form, but there is no usable self-service destination for selecting a child, booking, billing, or progress. This is a material dead end for youth gyms. | Do not claim the approved family experience in a pilot or sales demo. |
| Prospect books a public trial | IMPLEMENTED BUT UNVERIFIED | `apps/member-web/app/trial/[workspaceId]/page.tsx`, `trial-booking-form.tsx`, `actions.ts`, and `lib/trial-booking.ts` implement prospect, program/class, guardian, duplicate/capacity, booking, and form-link behavior. `trial-booking.test.ts` and action tests cover core branches. | The form has explicit validation and guardian handling. The real workspace route, DB transaction, confirmation message, email, duplicate recovery, and mobile page were not exercised in this safe guest audit. | Good implementation evidence; `IMPLEMENTED BUT UNVERIFIED` as a complete acquisition journey. |
| Member receives access and signs in | PARTIAL | Owner provisioning exists in `apps/admin-web/app/dashboard/members/portal-access-form.tsx`; member auth is in `apps/member-web/app/login/` and `lib/member-auth.ts`. Guest `/app` correctly redirected to `/login` at all three viewports. | Member login is clear and visually well fitted on mobile. Copy says access is provisioned by the gym, but there is no forgot-password path or direct support action. | Guided demo works with known seed credentials; an unattended member can become blocked. |
| Member browses schedule, books, joins waitlist, and cancels | PARTIAL | `apps/member-web/app/app/schedule/`, `app/bookings/`, and `lib/self-service-bookings.ts` implement browse, book, cancel, access-product selection, payment-pending, and waitlist states. Unit tests cover access decisions and waitlist/payment branches; Playwright demo spec describes the intended flow. | The implementation represents important alternatives and cutoff messages. Signed-in rendering, persistence, concurrent capacity, payment handoff, and error recovery were not safely observed. | Suitable for scripted demo only until authenticated E2E is rerun against a clean database. |
| Member sees membership and buys punch/drop-in access | PARTIAL | `apps/member-web/app/app/membership/`, `lib/member-membership.ts`, and `lib/member-commerce.ts` expose memberships, punch cards, and purchase flows. Billing/access models are present from `schema.prisma:790` onward. | Product distinctions are represented, but purchase trust depends on configured Stripe and clear pending/success/failure return states. Those states were not observed. | Offline/seeded state can be demonstrated; live purchase is not pilot-proven. |
| Owner configures billing and assigns memberships | PARTIAL | Admin billing routes and member billing detail are implemented under `apps/admin-web/app/dashboard/billing/` and `dashboard/members/[memberId]/billing/`; core logic is in `lib/billing.ts`, `member-billing.ts`, `failed-payments.ts`, and `stripe-billing.ts`. `MembershipBillingState` and `BillingRecord` begin at `schema.prisma:1136` and `1167`. | The UI exposes status, retry, payment-method request, freeze/cancel, refund, and credit concepts. This breadth increases trust risk when actions are unavailable or simulated; this run did not verify confirmations, idempotency feedback, receipts, or post-action recovery. | `PARTIAL`; do not use real money or represent Stripe recovery as pilot-safe. |
| Member understands billing status and payment recovery | PARTIAL | `apps/member-web/app/app/billing/page.tsx`, `billing-actions.tsx`, and `lib/member-billing.ts` expose payment status, invoices, and payment-method update/portal actions when configured. Decision log explicitly permits graceful degradation without live Stripe at `docs/01-decisions/Business Decision Log.md:43-48`. | Status copy exists, but actual portal/checkout/webhook outcomes were not observed. Recovery cannot be judged from static state alone. | Demo can show seeded billing state; pilot billing remains blocked on configured integration and end-to-end failure/reconciliation evidence. |
| Owner creates versioned forms and assigns requests | PARTIAL | Admin routes under `apps/admin-web/app/dashboard/forms/` and `lib/forms.ts` implement documents, versions, assignments, status, and downloads. `FormDocument`, `FormVersion`, and signature-request fields begin at `schema.prisma:965`, `985`, and `1033`. | Version/status concepts are visible in implementation. Authenticated upload, invalid PDF handling, replacement/version communication, and bulk assignment recovery were not exercised. | Demonstrable with seed data; pilot document integrity and recovery are unverified. |
| Member or guardian signs a requested form | PARTIAL | Portal and magic-link signing exist at `apps/member-web/app/app/forms/`, `app/sign/forms/[token]/`, and `_components/form-signature-form.tsx`. Token hashes and expiry are represented at `schema.prisma:1033-1038`. Unit tests cover issue/view/sign/expiry paths. | Typed-name signing, signer identity, expiry, and completed states exist. Screen-reader announcement, PDF readability on mobile, expired-link reissue path, and evidentiary/legal adequacy were not validated here. | Suitable for a guided demo; legal/e-signature sufficiency requires explicit owner/legal review outside this audit. |
| Staff invite email and coach acceptance | SCAFFOLDED | Decision log states invites are record-first at `docs/01-decisions/Business Decision Log.md:57-62`; admin invite records/actions exist, but email delivery and coach acceptance remain deferred. | Owner actions can create a record without closing the recipient journey, which can be mistaken for a sent invitation unless copy is explicit. | Keep out of pilot claims; use pre-provisioned coach access in demos. |
| Launch email confirmations and notices | SCAFFOLDED | Email templates/jobs appear in `schema.prisma:1740` and migration `20260425120000_reliability_foundation` (including trial, booking, reminder, failed-payment, announcement, and payment-method-update kinds). Tests assert notification records. No end-to-end provider delivery evidence was established. | A queued/recorded notification is not a received message. Owners and members need delivery, retry, bounce/failure, and support expectations. | Email-only launch makes this pilot-critical. Do not infer delivery from database records. |
| User recovers a forgotten password | MISSING | The MVP board includes password reset at `docs/mvp_ticket_board.md:23-27`. No forgot/reset-password route or login link was found in either app; the only visible reset action is staff-initiated member password reset in `apps/admin-web/app/dashboard/members/[memberId]/page.tsx:322-325`. | Owner and member login dead-end after forgotten credentials. Member must contact staff; owner has no visible recovery. | Pilot blocker for unattended access. |
| User recovers from route load, runtime error, or unknown URL | MISSING | Four `layout.tsx` files were found under `apps`; no `loading.tsx`, `error.tsx`, or `not-found.tsx` exists under either application. Framework fallback behavior is not a product recovery experience. | Slow DB calls have no route-level status, runtime failures have no contextual retry/support route, and unknown URLs have no Flowstate-specific way back. | Demo fragility and pilot support burden; highest impact on migration, roster, forms, and billing trust. |
| Guest or wrong-role user reaches protected area | PARTIAL | Guest `/dashboard` and `/app` redirected to the appropriate login at desktop, tablet, and mobile. Admin/member `/unauthorized` pages rendered role-specific explanations and one return link. Route decisions are covered by tests. | Permission messaging is plain and non-destructive. The wrong-role pages do not offer account switching, access-request, or gym/support contact guidance. | Basic guard works; permission recovery is incomplete. |
| Responsive, keyboard, screen-reader, and readability baseline | PARTIAL | Public login/signup/unauthorized pages were exercised at 1440x900, 768x1024, and 390x844. None overflowed horizontally. Visible fields were labelled; each page had one `main`. Six keyboard tabs on mobile admin login showed visible focus on email, password, button, and signup link. CSS contains focus-visible and responsive rules. | Public pages have strong hierarchy, generous controls, and readable copy. Member login has no visible password-recovery action. Authenticated pages, data tables, long migration/billing forms, error announcements, zoom, contrast calculations, reduced-motion behavior, and real screen-reader output were not validated. Some server-action errors are plain paragraphs rather than field-associated/live messages. No skip link was found. | Public shell is credible; accessibility conformance must not be claimed. |

## What currently works well

1. Migration-first product framing is reflected in onboarding and dashboard gating rather than existing only in strategy documents.
2. Public admin/member auth pages use clear role labels, explicit field labels, prominent actions, and responsive card layouts.
3. Guest authorization decisions are predictable: protected roots redirect to the relevant login, and wrong-role pages explain the boundary.
4. Daily operations are organized around today, roster, attendance, waitlist, and attention states rather than database entities alone.
5. Booking, billing, forms, and migration domain logic model many alternate states, with substantial unit coverage.
6. Billing pages are designed to degrade when Stripe is not configured instead of presenting live actions as available.
7. Form requests use hashed tokens and optional expiry, and preserve version/signer metadata in the schema.

## Highest-impact blocked, dead-end, and recovery paths

1. `MISSING` — owner/member forgot-password recovery. A user who cannot authenticate has no in-product path forward.
2. `MISSING` — guardian portal. Owner-created family relationships do not lead to the approved guardian booking/payment/progress experience.
3. `MISSING` — one-off class cancellation/rescheduling UI. The schema represents occurrences, but the daily disruption workflow is not reachable.
4. `MISSING` — route-level loading/error/not-found states. Database or integration failure can become a blank/framework experience without contextual recovery.
5. `SCAFFOLDED` — email delivery. Staff invites and launch-critical confirmations are records, not evidenced received communications.
6. `PARTIAL` — billing failure recovery. Pages and actions exist, but live Stripe, webhook, idempotency, receipt, and reconciliation outcomes were not exercised.
7. `PARTIAL` — authenticated interruption and save recovery for migration onboarding, roster, forms, and long management pages.
8. `PARTIAL` — permission recovery. Unauthorized pages explain the restriction but do not help users switch account or request access.

## Accessibility and inclusive-use observations

These are observations, not a conformance claim.

- Evidenced strengths: semantic `main` landmarks on public pages; visible labels for visible fields; large inputs/buttons; no horizontal overflow at the three tested widths; visible keyboard focus on the tested admin login controls; CSS responsive/focus rules; reduced-motion rules found in both app stylesheets.
- Evidenced gaps: no skip link found; no product route boundaries; auth errors are not evidenced as live announcements or linked to invalid fields; no authenticated keyboard check; no data-table or dense-page screen-reader check; no zoom/reflow test; no measured contrast calculation; no form-error focus management check.
- Readability: public pages use concise headings and plain-English descriptions. Migration and billing surfaces carry denser operational language and need comprehension testing with real owners rather than an internal review alone.
- Mobile: public pages fit at 390px with comfortable control sizing. Authenticated roster, migration, member-detail, forms, and billing pages remain `UNKNOWN` for real touch and reflow usability.

## Demo credibility versus pilot safety

### Demo priority

1. Restore a reproducible clean local audit environment and rerun both Playwright specifications.
2. Use only pre-provisioned owner/coach/member identities; clearly disclose record-first email and simulated/unconfigured Stripe behavior.
3. Script migration onboarding, daily dashboard, member booking, roster/attendance, billing-state visibility, and forms as separate proof points.
4. Do not claim guardian self-service, forgot-password recovery, staff invite acceptance, actual email receipt, or one-off class cancellation/rescheduling.
5. Add product-specific error recovery before relying on the demo under variable network/database conditions.

### Pilot priority

1. Close authentication recovery for owner and member.
2. Complete the approved guardian end-to-end journey or explicitly re-scope the pilot away from youth/family gyms with CEO approval.
3. Complete one-off class-instance cancellation/rescheduling and communication.
4. Establish real email delivery, retries, and operator visibility.
5. Verify Stripe checkout/portal/webhook/failure/reconciliation paths with test-mode evidence and no real charges.
6. Add loading/error/not-found/retry patterns and test long-form interruption/resume.
7. Run realistic-volume usability and accessibility checks with representative owner, coach, member, and guardian participants.

## Verification actually performed

### Repository and Git

- Branch: `main`.
- HEAD: `4dd55571d33814b687588163b53e48d7155ecfa4` (`feat: add migration-first onboarding operations`).
- Recent relevant history: `11e2620 docs: add migration-first onboarding initiative`; `b84e301 Refine Flowstate waitlist form layout`; `ca517a7 Fix Flowstate landing page contrast`; `6440cfb Add Flowstate landing page and brand updates`.
- The working tree was already dirty. Existing modified/deleted/untracked files were preserved. This report is the only intentional change from this task.
- The current Kanban board contains temporary recovery audit work. `t_69a32274` is a parent of synthesis task `t_f36a1ffb`; the synthesis card explicitly distinguishes temporary recovery cards from pre-existing product tickets.

### Automated checks

- `pnpm run test` succeeded: 28 executed unit-test files and 162 tests across database, admin, and member workspaces; Turbo reported four successful package tasks. The two Playwright specs were inspected but not run because they require an authenticated database-backed environment and would create/update audit data.
- `pnpm run lint` succeeded across the four application workspaces with no reported lint errors.
- `pnpm run build` returned exit code 1 on this Windows host. The app package build wrappers use POSIX shell syntax (`set -a; [ -f ... ] && . ...`) while pnpm scripts execute through the Windows script shell. This is a reproducibility contradiction with the prior demo note.
- Direct `pnpm exec next build` succeeded separately for `admin-web`, `member-web`, `landing-web`, and `api`; placeholder non-production database configuration was used only where required for build-time validation and no connection was made.
- No listener was present on port 5432 and no required database/Stripe URL variables were set in this task process. Authenticated persistence and live billing checks were therefore `BLOCKED`.

### Safe browser evidence

- Existing local servers were reachable at `http://127.0.0.1:3100` (admin) and `http://127.0.0.1:3101` (member).
- Checked admin `/login`, `/signup`, guest `/dashboard`, and `/unauthorized`; member `/login`, guest `/app`, and `/unauthorized`.
- Every checked public/guest page rendered at 1440x900, 768x1024, and 390x844 without horizontal overflow.
- Guest protected routes redirected to the correct login.
- Visible controls on the checked pages had names/labels; the only unnamed controls found were hidden React server-action inputs, which are not interactive.
- Mobile admin login keyboard order reached email, password, Log in, and Sign up with visible focus styling.
- Screenshots: `C:/Users/Jacky/AppData/Local/Temp/flowstate-ux-audit-20260720/` (21 viewport captures plus one keyboard-focus capture).
- The configured headless browser service was unavailable, so equivalent Playwright/Chromium evidence was collected directly; this did not mutate application data.

## Material risks

1. Authentication recovery failure can lock out the gym owner and interrupt daily operations.
2. Family product claims exceed the reachable guardian experience.
3. Scheduling claims exceed the reachable occurrence-edit UI, creating operational risk for cancellations and rescheduling.
4. Billing UI breadth can create false trust if seeded/offline state is mistaken for live, reconciled Stripe behavior.
5. Email-only launch depends on delivery behavior that is not evidenced end to end.
6. Missing route recovery states make database/integration failures look like product failure, especially during demos and payment/migration tasks.
7. Migration code breadth is not a substitute for clean-database, representative-file, rollback/retry, reconciliation, and owner-approval evidence.
8. Public-page responsiveness does not establish authenticated-page mobile or accessibility quality.
9. Current build scripts are not reproducible on the documented Windows host even though direct app builds succeed.
10. A large pre-existing dirty working tree increases audit and handoff risk; no unrelated changes were altered here.

## Contradictions and unresolved decisions

1. `docs/04-demo/Working Demo State.md:53-56` records a successful root build, while the current Windows root build command fails because app scripts use POSIX environment-loading syntax. Direct builds succeed, so the implementation compiles but the documented gate is not currently reproducible.
2. The same demo note lists a local database and known credentials, but this task process had no configured database environment and no port-5432 listener. Historical demo claims are not current reachability evidence.
3. `docs/mvp_ticket_board.md:23-27` includes password reset, but no self-service forgot/reset route exists in either web app.
4. `docs/product_decisions_ledger.md:125-130` says one-off and recurring-series edits are supported; the schema has `ClassInstance`, but no class-instance cancellation/rescheduling UI/action was found.
5. `docs/product_decisions_ledger.md:175-185` includes guardian booking, payment, and progress; current member routes do not provide a guardian workspace.
6. Product direction makes email launch-critical, but staff invites are explicitly record-first and no provider-delivery evidence was established. Decide whether pilot scope waits for email or uses an approved manual communication protocol.
7. Stripe can intentionally degrade in demo mode, but pilot acceptance needs a separately approved test-mode checklist for money movement, idempotency, refunds/credits, webhooks, and reconciliation.
8. Typed-name/PDF signature tracking is implemented, but legal/evidentiary sufficiency is outside this UX audit and requires an explicit business/legal decision.
9. Authenticated mobile and assistive-technology quality is `UNKNOWN`; decide the minimum pilot browser/device/AT support matrix before claiming accessibility readiness.

## Recommended recovery tickets

Each ticket is intentionally one independently testable outcome.

### UX-R1 — Owner and member self-service password recovery

- Priority: pilot blocker.
- Outcome: From each login page, a user can request a time-limited reset, receive non-enumerating confirmation, set a new password, and return to the intended destination.
- Acceptance: invalid/expired/used tokens have recovery copy; rate limiting and audit evidence exist; owner and member paths have unit and browser tests; keyboard focus and screen-reader announcements are checked.
- Coordination: Backend/DB, Frontend, QA, Localization/Content, Security/CEO for support policy.

### UX-R2 — Product-specific loading, error, and not-found recovery

- Priority: demo and pilot blocker.
- Outcome: Admin and member apps provide route-level loading, runtime-error retry, and unknown-route return paths without exposing technical details.
- Acceptance: boundaries exist at app and critical migration/billing/roster/form segments; retry preserves safe input where feasible; keyboard focus moves to the message; tests force each state at desktop and mobile.
- Coordination: Frontend, Design, QA, Localization/Content, Backend for error classification.

### UX-R3 — One-off class cancellation and rescheduling

- Priority: pilot blocker.
- Outcome: An authorized owner can cancel or reschedule one `ClassInstance`, review affected attendees, confirm the change, and see the updated schedule/roster.
- Acceptance: past/invalid/conflicting occurrences are blocked with clear recovery; audit data persists; member-facing state updates; notification dependency is explicit; owner and member browser tests cover cancellation and reschedule.
- Coordination: Workflow, Frontend, Backend/DB, QA, Localization/Content, Email.

### UX-R4 — Guardian self-service minimum journey

- Priority: pilot blocker for youth/family gyms.
- Outcome: An authorized guardian can enter one portal, select among linked children, view required forms, book/cancel for the selected child, see billing responsibility, and view approved progress.
- Acceptance: one and two guardian cases, no-child/expired-link/wrong-workspace/permission states, child context persistence, and mobile/keyboard checks are tested; no guardian can view an unrelated child.
- Coordination: Workflow, BA/Sales, CEO for pilot scope, Frontend, Backend/DB, QA, Localization/Content, Design.

### UX-R5 — Email delivery and operator recovery for one launch-critical event

- Priority: pilot blocker.
- Outcome: Trial confirmation is delivered through the configured provider with delivery status, safe retry, and operator-visible failure handling.
- Acceptance: provider sandbox evidence, idempotent retry, bounced/failed state, no duplicate send, template rendering, and browser-visible confirmation are tested. Expand to booking/reminder/failed-payment only through separate tickets.
- Coordination: Backend, DB, QA, Localization/Content, BA/Sales, CEO for sender/domain operations.

### UX-R6 — Stripe test-mode payment-method recovery

- Priority: pilot blocker when billing is in scope.
- Outcome: A member with a failed payment can open the update path, complete it in Stripe test mode, return to Flowstate, and see reconciled status; the owner sees the corresponding update.
- Acceptance: cancel/expire/failure/success/webhook-replay states, idempotency, receipt/audit record, and no misleading success before reconciliation are tested; no live credential or real charge is used.
- Coordination: Backend, DB, Frontend, QA, CEO for billing operations.

### UX-R7 — Authenticated responsive and accessibility evidence pack

- Priority: demo hardening, then pilot.
- Outcome: Owner dashboard/migration/roster/member billing/forms and member schedule/bookings/billing/forms are audited with representative data at desktop, tablet, and mobile, keyboard-only, zoom/reflow, and at least one agreed screen reader/browser pair.
- Acceptance: timestamped screenshots, exact routes/data setup, issue severity, and reproducible steps exist; no conformance claim is made beyond the checks performed.
- Coordination: UX, Design, Frontend, QA, Localization/Content.

### UX-R8 — Reproducible Windows build gate

- Priority: recovery/stabilization.
- Outcome: The documented root build command succeeds from a clean Windows checkout without shell-specific environment sourcing.
- Acceptance: `pnpm run build` succeeds in the supported Windows shell and CI; secret loading remains safe; direct app build workarounds are no longer required.
- Coordination: Frontend/Engineering, QA.

### UX-R9 — Migration interruption, retry, and cutover rehearsal

- Priority: pilot blocker.
- Outcome: A representative non-production CSV migration can be interrupted at each stage, resumed/retried without duplicate records, reconciled, approved, and cut over with an operator evidence log.
- Acceptance: malformed file, duplicate, partial import, retry, mismatch, rollback-before-cutover, owner approval, and blocked-cutover states have evidence; no real customer data is used.
- Coordination: Workflow, Backend, DB, QA, UX, BA/Sales.

## Next validation step

Provision a disposable, clean, fully migrated local database with non-secret fixture accounts, then run the existing Playwright suites and a read-only authenticated UX evidence pass. Start with migration onboarding, owner dashboard, member booking to owner roster, and forms. Use a separate Stripe test-mode/email sandbox only after the non-payment journeys are reproducible. Recruit lightweight task-based review with one gym owner and one coach for schedule/roster/migration language, plus one adult member and one guardian for booking/forms/recovery; treat findings as new evidence rather than validation assumed in advance.

## Exact evidence for synthesis verification

- Product guardrails and roles: `docs/product_decisions_ledger.md:36-45`, `56-61`, `69-77`, `125-132`, `153-168`, `175-185`, `205-211`.
- Migration-first accepted decision: `docs/01-decisions/Business Decision Log.md:7-19`.
- Graceful Stripe demo decision and record-first staff invites: `docs/01-decisions/Business Decision Log.md:43-48`, `57-62`.
- Password-reset intent: `docs/mvp_ticket_board.md:23-27`.
- Historical demo claims and limits: `docs/04-demo/Working Demo State.md:36-56`.
- Core schema: `packages/db/prisma/schema.prisma:387` (`Workspace`), `460` (`WorkspaceMigration`), `567` (`ClassTemplate`), `600` (`Member`), `644` (`Guardian`), `666` (`FamilyLink`), `685` (`ClassBooking`), `753-787` (`ClassInstance`), `790` (`MembershipPlan`), `938` (`WaitlistEntry`), `965` (`FormDocument`), `985` (`FormVersion`), `1033-1038` (signature request access/expiry), `1084` (`MemberMembership`), `1136` (`MembershipBillingState`), `1167` (`BillingRecord`), `1552` (`MigrationImportedRecord`), `1740` (`EmailTemplate`).
- Migration history anchors: `packages/db/prisma/migrations/20260408120000_booking_roster_attendance_slice/migration.sql`, `20260408130000_memberships_billing_slice/migration.sql`, `20260409160000_access_products_waitlist_slice/migration.sql`, `20260410120000_forms_signing_slice/migration.sql`, `20260425120000_reliability_foundation/migration.sql`, `20260530120000_migration_first_onboarding_ops/migration.sql`.
- Owner auth/onboarding/migration: `apps/admin-web/app/login/`, `signup/`, `onboarding/`, `dashboard/migration/`, `apps/admin-web/lib/auth.ts`, `workspace-migration.ts`, and their tests.
- Owner daily operations: `apps/admin-web/app/dashboard/page.tsx`, `dashboard/schedule/`, `dashboard/coach/today/page.tsx`, `dashboard/members/`, and `apps/admin-web/lib/dashboard.ts`, `class-templates.ts`, `rosters.ts`, `members.ts`.
- Member/trial/forms/billing: `apps/member-web/app/trial/[workspaceId]/`, `app/app/schedule/`, `app/app/bookings/`, `app/app/membership/`, `app/app/forms/`, `app/sign/forms/[token]/`, `app/app/billing/`, and related files under `apps/member-web/lib/`.
- Browser specifications inspected: `tests/e2e/flowstate-demo.spec.ts`; `tests/e2e/migration-first-onboarding.spec.ts`.
- Commands to reproduce current non-mutating checks: `pnpm run test`; `pnpm run lint`; `pnpm run build`; direct `pnpm exec next build` in each application workspace; guest Playwright checks against ports 3100 and 3101.
- Browser evidence directory: `C:/Users/Jacky/AppData/Local/Temp/flowstate-ux-audit-20260720/`.
