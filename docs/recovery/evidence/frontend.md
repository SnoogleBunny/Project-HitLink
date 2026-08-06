# Frontend recovery evidence: admin and member surfaces

Audit date: 2026-07-20
Kanban task: `t_c06b5ea4`
Repository state inspected: `main` at `4dd5557` (`feat: add migration-first onboarding operations`)
Allowed scope: evidence only; no product code was changed.

## Outcome

The repository contains substantial database-backed owner, coach, customer, guardian-adjacent, public trial, onboarding, migration, billing, booking, attendance, form-signing, and Stripe UI. Both frontend applications compile and their 155 unit tests pass. No workflow is classified **VERIFIED COMPLETE** in this audit because the current run did not execute the database-backed Playwright suites, and most routes do not have evidence for all authorization, persistence, recovery, accessibility, and responsive states.

The strongest connected flows are owner/member authentication, program/room/template setup, bookings and waitlists, roster attendance, member management, memberships/access products, forms/signatures, member self-service, migration-first onboarding, and Stripe-backed payment actions. Important limitations remain: no route-level loading or error boundaries; no dialog/modal system; staff invite email delivery and acceptance are absent; migration operator controls are exposed in the owner surface; schedule exceptions and restore flows are deferred; progress, messaging, announcements, events, private lessons, credits/refunds, and reliability-operations records have no frontend; and the shared `packages/ui` package is unused scaffold code.

## Method and status rules

Primary evidence was the checked-in source, tests, schema and all 14 SQL migrations, current Git state/history, and current `hitlink` Kanban task. Product and operating documents were used only to identify intended boundaries and contradictions. Required sources inspected were `.hermes.md`, `README.md`, `CLAUDE.md`, `docs/AGENTS.md`, `docs/product_decisions_ledger.md`, `docs/01-decisions/Business Decision Log.md`, `docs/mvp_ticket_board.md`, `docs/domain_model.md`, `docs/engineering_rules.md`, `docs/04-demo/Working Demo State.md`, `docs/Agents/Agent Operating Model.md`, `docs/Agents/Frontend.md`, `packages/db/prisma/schema.prisma`, every `packages/db/prisma/migrations/*/migration.sql`, current application/test code, Git status/log/diff, `.design` evidence, and Kanban task `t_c06b5ea4`.

Only these workflow labels are used: **VERIFIED COMPLETE**, **IMPLEMENTED BUT UNVERIFIED**, **PARTIAL**, **SCAFFOLDED**, **BROKEN**, **MISSING**, **BLOCKED**, **DEFERRED**, **UNKNOWN**.

Common evidence and limitations for the route tables:

- Admin `proxy.ts:5-39` protects `/dashboard` and `/onboarding`; member `proxy.ts:5-38` protects `/app`. Page-level context loaders additionally scope records to the authenticated user and workspace (`apps/admin-web/lib/owner-workspace.ts:31-115`, `operations-workspace.ts:35-128`, `apps/member-web/lib/member-auth.ts:40-128`).
- `AdminShell` and `MemberShell` provide the persistent shell/logout; their nav components implement owner/coach and customer destinations (`apps/admin-web/app/_components/admin-shell.tsx:15-65`, `admin-nav.tsx:6-84`, `apps/member-web/app/_components/member-shell.tsx:15-63`, `member-nav.tsx:5-32`).
- No `loading.tsx`, `error.tsx`, or authored `not-found.tsx` exists in either app. Inline empty/validation states are common, but uncaught route errors use framework defaults. This prevents **VERIFIED COMPLETE** classification.
- Both global stylesheets contain responsive media rules, focus-visible styling, and reduced-motion handling. Existing design evidence covers `/dashboard` and onboarding/migration at 1280, 768, and 375 widths (`.design/admin-daily-command-center/DESIGN_REVIEW.md:7-94`; `.design/onboarding-flow/DESIGN_REVIEW.md:7-61`). Other routes have no current screenshot evidence.
- Source search found no `<dialog>`, `role="dialog"`, modal, sheet, or drawer implementation in either app.
- Client forms use `useActionState` and `SubmitButton` for pending and error states. Success generally redirects/revalidates rather than announcing inline; signature, trial, and schedule forms have explicit status-success surfaces.

## Admin route and screen inventory

Abbreviations in the state column: `E` empty/disabled state, `V` validation/action error, `L` route loading, `R` uncaught route error, `M` mobile evidence. `L/R: MISSING` applies where no route boundary exists.

| Route | Actor and purpose | Data and actions | Authorization | States and mobile | Status | Exact evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Guest/authenticated admin entry router | Reads session; redirects to login, onboarding, migration, dashboard, or unauthorized | Session-derived destination | Redirect only; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `apps/admin-web/app/page.tsx:1-8`; `lib/admin-access.ts` |
| `/login` | Guest admin login | Email/password; verifies hash; creates cookie session | Authenticated users redirected | V/pending present; no recovery/password reset; M not rechecked | IMPLEMENTED BUT UNVERIFIED | `app/login/page.tsx:1-17`; `login-form.tsx:1-40`; `login/actions.ts`; `login/actions.test.ts` |
| `/signup` | New owner account creation | Full name/email/password confirmation; creates owner user/session | Authenticated users redirected | V/pending present; long-term account recovery MISSING | IMPLEMENTED BUT UNVERIFIED | `app/signup/page.tsx:1-17`; `signup-form.tsx:1-56`; `signup/actions.ts` |
| `/onboarding` | Authenticated owner migration intake | Gym, timezone, software/access, scope, optional profile/address; creates workspace/location/migration | `requireOnboardingSession`; existing workspace redirects | V/pending; existing responsive evidence; draft/autosave MISSING | PARTIAL | `app/onboarding/page.tsx:1-20`; `onboarding-form.tsx:1-214`; `onboarding/actions.ts`; `.design/onboarding-flow/DESIGN_REVIEW.md:24-54` |
| `/unauthorized` | Signed-in unsupported-role/guest recovery | Shows role/session context; logout action | Session optional | Recovery links present; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `app/unauthorized/page.tsx:1-30` |
| `/dashboard` | Owner daily command center | Aggregates billing, attendance, capacity, trial, invite, schedule and setup readiness; links to operational queues | Owner workspace; migration readiness redirects pre-launch workspaces | E clear-day/no-class; responsive evidence at 1280/768/375; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/page.tsx:1-419`; `lib/dashboard.ts`; `lib/dashboard.test.ts`; `.design/admin-daily-command-center/DESIGN_REVIEW.md:20-94` |
| `/dashboard/programs` | Owner program list/create/archive overview | Prisma-backed active/archived programs; create form; edit links | Owner workspace | E active/archive; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/programs/page.tsx:1-156`; `program-create-form.tsx`; `actions.ts`; `lib/programs.ts` |
| `/dashboard/programs/[programId]/edit` | Owner program editing | Scoped lookup, edit, archive | Owner workspace and workspace-filtered ID; notFound otherwise | V/pending; archived state; restore DEFERRED | PARTIAL | `app/dashboard/programs/[programId]/edit/page.tsx:1-95`; `program-edit-form.tsx`; `lib/programs.test.ts` |
| `/dashboard/rooms` | Owner one-location room list/create/archive overview | Active/archived rooms for `workspace.location`; create/edit | Owner workspace and primary location | E active/archive; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/rooms/page.tsx:1-140`; `room-create-form.tsx`; `lib/rooms.ts` |
| `/dashboard/rooms/[roomId]/edit` | Owner room editing | Workspace/location-scoped lookup, edit, archive | Owner workspace/location; notFound otherwise | V/pending; archived state; restore DEFERRED | PARTIAL | `app/dashboard/rooms/[roomId]/edit/page.tsx:1-95`; `room-edit-form.tsx`; `lib/rooms.test.ts` |
| `/dashboard/schedule` | Owner weekly reusable template management | Lists active/archived `ClassTemplate` records by weekday; links create/edit/roster | Owner workspace | E by weekday/archive; one-off changes/exceptions explicitly DEFERRED; M unverified | PARTIAL | `app/dashboard/schedule/page.tsx:1-184`, especially `:49-53`; `lib/class-templates.ts` |
| `/dashboard/schedule/new` | Owner recurring class template creation | Program, room, coach, weekday/time, capacity and cutoffs | Owner workspace; options workspace/location scoped | Setup dependency E; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/schedule/new/page.tsx:1-109`; `class-template-form.tsx:1-234`; `lib/class-templates.test.ts` |
| `/dashboard/schedule/[templateId]/edit` | Owner template editing/archive | Scoped template/options; edit/archive | Owner workspace and template scope | Removed coach warning; V/pending; restore DEFERRED | PARTIAL | `app/dashboard/schedule/[templateId]/edit/page.tsx:1-160`; `class-template-form.tsx`; `actions.ts` |
| `/dashboard/schedule/[templateId]/roster?date=` | Owner/coach dated roster operations | Template-derived occurrence, bookings, waitlist; attendance save, promote/remove waitlist | `requireOperationsWorkspaceContext` permits OWNER/COACH and scopes template/workspace | E bookings/waitlist; V/pending; invalid date/notFound; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/schedule/[templateId]/roster/page.tsx:1-170`; `attendance-form.tsx`; `waitlist-panel.tsx`; `lib/rosters.ts`; `rosters.test.ts` |
| `/dashboard/coach/today` | Owner/coach today's assigned-class launchpad | Lists current-date classes and roster links | OWNER sees all; COACH sees assigned templates via operations context | E no assigned classes; no broader coach app | PARTIAL | `app/dashboard/coach/today/page.tsx:1-99`; `lib/rosters.ts`; `admin-nav.tsx:6-84` |
| `/dashboard/bookings` | Owner manual member/trial booking | Eligible occurrence options and members; creates booked/waitlisted record | Owner workspace; migration gate | E migration gate; V/pending; recovery link; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/bookings/page.tsx:1-91`; `booking-create-form.tsx`; `actions.ts`; `lib/bookings.ts`; `bookings.test.ts` |
| `/dashboard/members` | Owner member/trial directory | Search, status filter, create member; required-form aggregate | Owner workspace | E no search results; V/pending; basic non-CRM search disclosed | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/members/page.tsx:1-184`; `member-form.tsx`; `lib/members.ts`; `members.test.ts` |
| `/dashboard/members/[memberId]` | Owner member profile/guardian/form/portal operations | Contact, tags, notes, forms/history, guardians, bookings/attendance; update member, link guardian, issue/reset portal password | Owner workspace and workspace-scoped member; notFound otherwise | Multiple E; V/pending; family size beyond two DEFERRED; M unverified | PARTIAL | `app/dashboard/members/[memberId]/page.tsx:1-426`; `member-form.tsx`; `guardian-link-form.tsx`; `portal-access-form.tsx`; `lib/member-portal-access.ts` |
| `/dashboard/members/[memberId]/billing` | Owner membership, freeze/cancel, punch-card and billing record management | Assign/cancel/freeze membership, grant card, list billing/form eligibility | Owner workspace and scoped member | E membership/cards/billing/forms; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/members/[memberId]/billing/page.tsx:1-405`; `billing-forms.tsx`; `actions.ts`; `lib/member-memberships.ts` |
| `/dashboard/membership-plans` | Owner recurring-plan list/create/archive | Program-scoped plan CRUD and prices/policy references | Owner workspace | E active/archive; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/membership-plans/page.tsx:1-175`; `membership-plan-form.tsx`; `lib/membership-plans.ts` |
| `/dashboard/membership-plans/[membershipPlanId]/edit` | Owner plan editing | Scoped lookup/edit/archive | Owner workspace and plan scope; notFound otherwise | V/pending; archived plan handling; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/membership-plans/[membershipPlanId]/edit/page.tsx:1-73`; `membership-plan-form.tsx`; `membership-plans.test.ts` |
| `/dashboard/access-products` | Owner punch-card/drop-in catalogue | Create, edit, activate/deactivate/archive; program restrictions | Owner workspace | E per product/archive; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/access-products/page.tsx:1-280`; both product forms; `lib/access-products.ts` |
| `/dashboard/access-products/punch-cards/[punchCardProductId]/edit` | Owner punch-card editing | Scoped product/options, update | Owner workspace and product scope | V/pending; notFound; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/access-products/punch-cards/[punchCardProductId]/edit/page.tsx:1-54`; `punch-card-product-form.tsx` |
| `/dashboard/access-products/drop-ins/[dropInProductId]/edit` | Owner drop-in editing | Scoped product/options, update | Owner workspace and product scope | V/pending; notFound; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/access-products/drop-ins/[dropInProductId]/edit/page.tsx:1-54`; `drop-in-product-form.tsx` |
| `/dashboard/forms` | Owner PDF form/waiver library | Upload PDF, create document/version, list assignment targets | Owner workspace | E no forms; file V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/forms/page.tsx:1-119`; `form-document-create-form.tsx`; `lib/forms.ts`; `forms.test.ts` |
| `/dashboard/forms/[formId]` | Owner form detail/version/requirement manager | Embedded current PDF, upload version, toggle targets, version history | Owner workspace and form scope; notFound otherwise | E no owner notes; V/pending; embedded PDF behavior M/UA UNKNOWN | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/forms/[formId]/page.tsx:1-247`; `form-version-upload-form.tsx`; `forms-status.ts` |
| `/dashboard/forms/[formId]/versions/[versionId]/file` | Owner-protected PDF response | Reads workspace-scoped version bytes and returns PDF | Owner workspace and form/version scope | 404 response when absent; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/forms/[formId]/versions/[versionId]/file/route.ts:1-35` |
| `/dashboard/billing` | Owner failed-payment queue | Failed billing states; retry now; mark update requested | Owner workspace | E empty queue; action errors rely redirects/state; dunning DEFERRED | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/billing/page.tsx:1-145`; `actions.ts`; `lib/failed-payments.ts`; `failed-payments.test.ts` |
| `/dashboard/settings/billing` | Owner Stripe Connect and recovery settings | Connect/continue account onboarding, refresh status, set grace days | Owner workspace | Connection states and action errors; email/SMS dunning DEFERRED | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/settings/billing/page.tsx:1-93`; `actions.ts`; `lib/stripe-settings.ts`; `lib/stripe-billing.ts` |
| `/dashboard/settings/billing/return` | Owner Stripe Connect return processor | Refreshes Stripe account status then redirects | Owner workspace | Transitional route only; external failure recovery UNKNOWN | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/settings/billing/return/page.tsx:1-14` |
| `/dashboard/settings/billing/refresh` | Owner Stripe refresh processor | Refreshes account status then redirects | Owner workspace | Transitional route only; external failure recovery UNKNOWN | IMPLEMENTED BUT UNVERIFIED | `app/dashboard/settings/billing/refresh/page.tsx:1-14` |
| `/api/stripe/webhook` | Stripe webhook endpoint, not a screen | Verifies signature, processes persisted events, returns JSON | Stripe signature, workspace/account resolution in billing library | Invalid body/signature responses implemented; live secret/event replay unverified | IMPLEMENTED BUT UNVERIFIED | `app/api/stripe/webhook/route.ts:1-74`; `lib/stripe-billing.ts`; `stripe-billing.test.ts` |
| `/dashboard/staff-invites` | Owner coach invite record management | Create/resend/revoke pending invite records | Owner workspace | E no invites; V/pending; email delivery and coach acceptance explicitly DEFERRED | PARTIAL | `app/dashboard/staff-invites/page.tsx:17-110`; `staff-invite-form.tsx`; `lib/staff-invites.ts`; `staff-invites.test.ts` |
| `/dashboard/migration` | Owner-facing status mixed with internal import/operator operations | Stage CSV, validate, run six production import kinds, view issues/reconciliation, edit stage, complete handoff and enqueue notification | Owner workspace; pre-launch redirects here | E uploads/jobs; V/pending; responsive evidence; internal controls conflict with owner-facing requirement | PARTIAL | `app/dashboard/migration/page.tsx:1-381`; `workspace-migration.ts:89-96, 1644-2083`; `actions.ts`; `.design/onboarding-flow/DESIGN_REVIEW.md:28-54` |

### Admin forms and destructive/confirmation behavior

All dedicated admin client-form components are listed below. Additional inline server-action forms on the inventoried route pages perform archive, activate/deactivate, cancel/clear, assignment toggles, retry/update-requested, import-run, Stripe connect/refresh, invite resend/revoke, waitlist promotion/removal, and shell logout. No confirmation dialog is used for archive, cancel membership, revoke invite, remove waitlist, or similar destructive actions.

| Form/component | Fields or operation | State coverage | Status |
| --- | --- | --- | --- |
| `login/login-form.tsx`; `signup/signup-form.tsx` | Credentials/account creation | validation + pending; no recovery | PARTIAL |
| `onboarding/onboarding-form.tsx` | Migration intake and optional gym/address details | validation + pending; no draft/autosave | PARTIAL |
| `programs/program-create-form.tsx`; `program-edit-form.tsx` | Program create/edit | validation + pending; archive separate | IMPLEMENTED BUT UNVERIFIED |
| `rooms/room-create-form.tsx`; `room-edit-form.tsx` | Room create/edit | validation + pending; archive separate | IMPLEMENTED BUT UNVERIFIED |
| `schedule/class-template-form.tsx` | Template create/edit | validation + pending + disabled dependency state | IMPLEMENTED BUT UNVERIFIED |
| `bookings/booking-create-form.tsx` | Admin class/trial booking | validation + pending + migration gate | IMPLEMENTED BUT UNVERIFIED |
| `roster/attendance-form.tsx`; `waitlist-panel.tsx` | Attendance and waitlist promotion/removal | validation + pending; no confirmation | PARTIAL |
| `members/member-form.tsx`; `guardian-link-form.tsx`; `portal-access-form.tsx` | Member CRUD, guardian link, portal credential issue/reset | validation + pending; password shown only as input | IMPLEMENTED BUT UNVERIFIED |
| `members/[memberId]/billing/billing-forms.tsx` | Assign/freeze membership; grant punch card; cancel/clear separate | validation + pending; no confirmation | PARTIAL |
| `membership-plans/membership-plan-form.tsx` | Plan create/edit | validation + pending | IMPLEMENTED BUT UNVERIFIED |
| Both `access-products/*-product-form.tsx` | Punch-card/drop-in create/edit | validation + pending | IMPLEMENTED BUT UNVERIFIED |
| `forms/form-document-create-form.tsx`; `form-version-upload-form.tsx` | PDF create/version upload | file validation + pending | IMPLEMENTED BUT UNVERIFIED |
| `migration/migration-upload-form.tsx`; `migration-stage-form.tsx` | CSV staging and service-stage controls | validation + pending; operator/owner separation MISSING | PARTIAL |
| `settings/billing/grace-period-form.tsx` | Grace-period days | validation + pending | IMPLEMENTED BUT UNVERIFIED |
| `staff-invites/staff-invite-form.tsx` | Invite record creation | validation + pending; delivery/acceptance DEFERRED | PARTIAL |

## Member/public route and screen inventory

| Route | Actor and purpose | Data and actions | Authorization | States and mobile | Status | Exact evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Guest/authenticated customer entry router | Reads member session and redirects to login/app/unauthorized | Session-derived | Redirect only; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `apps/member-web/app/page.tsx:1-8`; `lib/member-auth.ts` |
| `/login` | Linked customer portal login | Email/password, linked member lookup, cookie session | Authenticated member redirected | V/pending; no reset/invite acceptance; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/login/page.tsx:1-17`; `login-form.tsx`; `actions.ts`; `actions.test.ts` |
| `/unauthorized` | Customer access denial | Static explanation and login link | Public static route | Recovery link; no account request path | PARTIAL | `app/unauthorized/page.tsx:1-19` |
| `/app` | Customer overview | Current membership/billing, punch-card summary, attendance history | `requireMemberPortalContext` scopes active workspace/user/member | E no membership/billing/attendance; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/page.tsx:1-129`; `lib/member-portal.ts` |
| `/app/schedule` | Customer upcoming eligible classes | Template-derived dated occurrences and access checks; book or join waitlist | Member portal; active workspace/member | E no classes; V/pending/success; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/schedule/page.tsx:1-37`; `schedule-list.tsx`; `actions.ts`; `lib/self-service-bookings.ts`; `self-service-bookings.test.ts` |
| `/app/bookings` | Customer current bookings/waitlists | Lists active items; cancel booking; leave waitlist | Member portal and member-scoped actions | E handled in `bookings-list`; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/bookings/page.tsx:1-27`; `bookings-list.tsx:1-177`; `actions.ts` |
| `/app/membership` | Customer membership/punch-card view and purchase | Current plan/freeze, card balances/products; starts Stripe Checkout | Member portal; workspace/member/product scoped | E membership/cards/products; V/pending; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/membership/page.tsx:1-161`; `punch-card-purchase-form.tsx`; `actions.ts`; `lib/member-commerce.ts` |
| `/app/billing` | Customer billing and failed-payment recovery | Billing records/state; Stripe payment-method update; retry latest payment | Member portal and Stripe customer/workspace scope | E no records; disabled unavailable actions; V/pending; external recovery unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/billing/page.tsx:1-131`; `billing-actions.tsx:1-54`; `actions.ts`; `lib/member-billing.ts` |
| `/app/checkout/complete` | Customer post-Checkout landing | Static confirmation and links; does not itself verify session/payment query data | Member portal only | Static success; webhook eventual-state communication absent | SCAFFOLDED | `app/app/checkout/complete/page.tsx:1-29` |
| `/app/forms` | Customer required/open and signed forms | Required-state groups, actionable request links, signed history | Member portal/member scope | E no required/signed forms; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/forms/page.tsx:1-108`; `lib/forms.ts` |
| `/app/forms/[requestId]` | Customer authenticated form review/sign | Scoped request/PDF link; records consent/signature | Member portal, member/request scope | Closed E; V/pending/success status; M unverified | IMPLEMENTED BUT UNVERIFIED | `app/app/forms/[requestId]/page.tsx:1-106`; `_components/form-signature-form.tsx`; `actions.ts` |
| `/app/forms/[requestId]/document` | Customer-protected PDF response | Request-scoped document bytes | Member portal and request ownership | 404 when absent; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `app/app/forms/[requestId]/document/route.ts:1-35` |
| `/sign/forms/[token]` | Member/guardian magic-link signing without portal login | Validates signed token; shows request/PDF; records signature and consent | Token/request validity instead of session | Closed/expired E; V/pending/success; email delivery path MISSING | PARTIAL | `app/sign/forms/[token]/page.tsx:1-106`; `_components/form-signature-form.tsx`; `lib/forms.ts` |
| `/sign/forms/[token]/document` | Token-protected PDF response | Token/request document bytes | Magic token validity | 404 when invalid; L/R MISSING | IMPLEMENTED BUT UNVERIFIED | `app/sign/forms/[token]/document/route.ts:1-31` |
| `/trial/[workspaceId]` | Public prospective customer/guardian trial booking | Workspace class options; person/contact/DOB; conditional guardian; creates member/trial booking and form-link records | Public, explicit workspace ID, active-workspace scoped in domain helper | E no dates; V/pending/success; links rendered locally, not emailed | PARTIAL | `app/trial/[workspaceId]/page.tsx:1-56`; `trial-booking-form.tsx:1-155`; `actions.ts`; `lib/trial-booking.ts`; tests |

### Member/public forms

All dedicated member/public client-form components are listed below. `MemberShell` also contains the logout server-action form.

| Form/component | Fields or operation | State coverage | Status |
| --- | --- | --- | --- |
| `login/login-form.tsx` | Email/password | validation + pending; reset MISSING | PARTIAL |
| `schedule/schedule-list.tsx` | Book class or join waitlist | validation + pending + success redirect | IMPLEMENTED BUT UNVERIFIED |
| `bookings/bookings-list.tsx` | Cancel booking or leave waitlist | validation + pending; confirmation MISSING | PARTIAL |
| `membership/punch-card-purchase-form.tsx` | Product selection and Checkout start | validation + pending; external recovery unverified | IMPLEMENTED BUT UNVERIFIED |
| `billing/billing-actions.tsx` | Payment-method update and retry | disabled + validation + pending | IMPLEMENTED BUT UNVERIFIED |
| `_components/form-signature-form.tsx` | Signer name/email/consent and token/request IDs | validation + pending + success status | IMPLEMENTED BUT UNVERIFIED |
| `trial/[workspaceId]/trial-booking-form.tsx` | Class, contact, DOB and guardian fields | validation + pending + success; form links shown | PARTIAL |

## Major components, navigation, state systems, and reuse

| Surface | Finding | Status | Evidence |
| --- | --- | --- | --- |
| Admin shell/navigation | Owner nav exposes dashboard, migration, programs, rooms, schedule, bookings, members, forms, memberships, access products, billing, billing settings, staff invites. Coach nav exposes only Today and Schedule. Pre-launch owner still sees the full nav even though operations may redirect/gate. | PARTIAL | `apps/admin-web/app/_components/admin-nav.tsx:6-84`; `.design/onboarding-flow/DESIGN_REVIEW.md:42-47` |
| Member shell/navigation | Overview, Schedule, Bookings, Membership, Forms, Billing; responsive stylesheet collapses shell. | IMPLEMENTED BUT UNVERIFIED | `apps/member-web/app/_components/member-nav.tsx:5-32`; `member-shell.tsx` |
| Shared submit components | Each app owns a `SubmitButton`; no cross-app primitive is used. | IMPLEMENTED BUT UNVERIFIED | `apps/admin-web/app/_components/submit-button.tsx`; `apps/member-web/app/_components/submit-button.tsx` |
| Shared package | `packages/ui` exports create-turbo demo `Button`, `Card`, and `Code`; `Button` calls `alert`, `Card` adds create-turbo UTM parameters. No app imports `@flowstate/ui`. | SCAFFOLDED | `packages/ui/src/button.tsx:1-20`; `card.tsx:1-27`; `index.ts:1-3`; zero app import matches |
| Loading/error/recovery | Inline empty and action-error states are widespread, but route `loading.tsx` and `error.tsx` are absent; only framework-generated `_not-found` appears in builds. | MISSING | Repository search across both apps; production build route output |
| Dialogs/modals | No dialog/modal/sheet/drawer implementation was found. Destructive actions submit directly. | MISSING | Repository search across both apps; form inventory above |
| Accessibility semantics | Labels and named buttons are common; only a small number of explicit `role="status"` surfaces exist. Form errors generally lack `role="alert"`, `aria-live`, `aria-invalid`, and field-level `aria-describedby`. | PARTIAL | Admin explicit status uses in bookings/schedule; member status uses in signature/trial; searches returned no broad error-announcement coverage |
| Responsive behavior | Both global stylesheets have multiple breakpoints/focus/reduced-motion rules. Current screenshots substantiate only dashboard and onboarding/migration, not the complete route set. | PARTIAL | `apps/admin-web/app/globals.css`; `apps/member-web/app/globals.css`; `.design/**/DESIGN_REVIEW.md` |
| Localization/content | User-facing strings and `Intl.DateTimeFormat("en-CA")` are hardcoded in components; no localization framework was found. Currency inputs default to CAD in product forms, while Stripe/domain models retain currency fields. | PARTIAL | `staff-invites/page.tsx:10-14`; membership/access forms; app-wide literal strings |
| Component tests | Unit suites target libraries/actions; no React Testing Library/component/render tests were found in either app. | MISSING | 25 admin and 7 member test files are all `lib/**` or action tests |

## Integrations and persistence trace

| Integration | Frontend path | Persistence/external behavior | Status | Evidence |
| --- | --- | --- | --- | --- |
| Prisma/database | Server components and server actions import `@flowstate/db` directly | Workspace-scoped CRUD for all implemented surfaces; no separate API boundary for ordinary app actions | IMPLEMENTED BUT UNVERIFIED | 157 admin and 49 member `@flowstate/db`/Prisma matches; listed `lib/**` modules |
| Authentication | Cookie sessions from `@flowstate/auth`; proxy plus page-level loaders | Admin user/workspace role and member linked-user/member/workspace checks | IMPLEMENTED BUT UNVERIFIED | both proxies; admin auth actions; `owner-workspace.ts`; `operations-workspace.ts`; `member-auth.ts` |
| Stripe Connect | Owner billing settings and return/refresh routes | Account creation/onboarding/status refresh persisted on workspace | IMPLEMENTED BUT UNVERIFIED | `lib/stripe-settings.ts`; `dashboard/settings/billing/**` |
| Stripe payments | Member Checkout/payment method/retry and admin failed-payment retry | Stripe SDK plus persisted billing state, bookings/card balance, webhook event records | IMPLEMENTED BUT UNVERIFIED | `member-commerce.ts`; `member-billing.ts`; `admin-web/lib/stripe-billing.ts`; webhook route |
| Forms/files | Owner uploads PDF bytes to DB; owner/member/token routes stream bytes | Versioned `FormDocument`/`FormVersion`, requirement assignments, signature records | IMPLEMENTED BUT UNVERIFIED | admin `lib/forms.ts`; member `lib/forms.ts`; four file routes/pages |
| Trial and guardian | Public action creates trial/member/family data and issues magic-link request records | Links are returned to success UI; no outbound email sender is invoked | PARTIAL | `member-web/app/trial/[workspaceId]/actions.ts:1-67`; trial tests |
| Notifications | Migration completion enqueues a notification job | No frontend notification center and no proven worker/delivery in this audit | PARTIAL | `admin-web/app/dashboard/migration/actions.ts:3,123-132`; no app notification UI matches |
| Staff invites | Owner actions create/rotate/revoke token records | Page explicitly says email delivery and coach acceptance are deferred | PARTIAL | `admin-web/app/dashboard/staff-invites/page.tsx:27-37`; `lib/staff-invites.ts` |
| Migration/import | Owner route stages CSV, records validation issues, imports selected kinds, reconciles | Production importer handles MEMBER, MEMBERSHIP_PLAN, MEMBER_MEMBERSHIP, PUNCH_CARD_BALANCE, DROP_IN_PRODUCT, SCHEDULE_TEMPLATE; UI mixes owner/internal work | PARTIAL | `admin-web/lib/workspace-migration.ts:89-96, 1644-2083`; migration page/actions/tests |

## Migration-backed domains with no or incomplete frontend

All 14 migrations were read. Early migrations establish auth, programs/rooms, templates, members/trials, bookings/attendance, memberships/billing, portal, access products/waitlists, forms, reliability, and migration-first onboarding. Migration history is particularly important because `packages/db/prisma/schema.prisma` contains the current generated model surface while migrations preserve introduced operational intent.

| Domain present in schema/migrations | Frontend finding | Status | Exact evidence |
| --- | --- | --- | --- |
| Class instances, overrides/exceptions and reliability operations | No `classInstance` reference exists in admin/member TS/TSX; UI derives dated occurrences from weekly templates and explicitly defers one-offs/exceptions. | MISSING | `20260425120000_reliability_foundation/migration.sql`; zero source matches; `admin schedule/page.tsx:49-53` |
| Progress modules, belts, member progress, promotions | No admin/member frontend references except a test fixture name unrelated to a UI. | MISSING | reliability migration; source searches |
| Conversations, participants, messages | No frontend references/routes. | MISSING | reliability migration; zero source matches |
| Announcements, notification preferences/jobs, email templates | Only migration completion enqueues a notification job; no management/member UI. | PARTIAL | reliability migration; migration action; zero route matches |
| Events and event bookings | No frontend references/routes. | MISSING | reliability migration; zero source matches |
| Private lesson products/availability/bookings | No frontend references/routes. | MISSING | reliability migration; zero source matches |
| Account credits, credit rules, refunds and detailed invoice line items | Generic billing/invoice/payment history exists, but no dedicated credit/refund/rule/line-item operations UI. | PARTIAL | reliability migration; billing routes; zero direct app matches |
| Audit logs, idempotency records, integration deliveries, failed notification visibility | No operational frontend. | MISSING | reliability migration; zero routes |
| Staff acceptance | Staff invite record actions exist; acceptance UI and delivery absent. | DEFERRED | staff invite page copy and route inventory |
| Program/room/template restoration | Archived lists exist; edit pages explicitly defer restore. | DEFERRED | program/room/template edit pages |

## Authorization, tenancy and guardrail assessment

- **Single location:** admin owner/operations context requires one workspace location and uses it for room, schedule, roster, and onboarding operations (`owner-workspace.ts:31-115`; `operations-workspace.ts:35-128`). No location switcher or multi-location navigation exists. **IMPLEMENTED BUT UNVERIFIED**.
- **Workspace isolation:** route data helpers and actions generally require `workspaceId` and, for rooms, `locationId`. Dynamic routes return `notFound` when IDs do not belong to the active workspace. Unit tests include foreign-workspace denial cases in several domain helpers. **IMPLEMENTED BUT UNVERIFIED** because cross-tenant browser tests were not run.
- **Roles:** owner-only contexts protect most management routes; operations context permits OWNER/COACH for Today and roster; member portal requires CUSTOMER linkage to a member record. Guardian is a family relationship rather than a fourth workspace role and uses public token signing where needed. **PARTIAL** because the coach experience is only Today/Schedule and staff acceptance is absent.
- **Web-only:** all discovered experiences are Next.js web routes; no native app assumption was introduced. **IMPLEMENTED BUT UNVERIFIED**.
- **Email-only launch:** no SMS sender UI was found, but required email delivery is also not wired for staff invites or trial form links. **PARTIAL**.
- **Hardcoded assumptions:** visible copy and date locale are English/`en-CA`; product forms commonly default currency to CAD; public trial depends on a workspace ID URL; role destinations are hardcoded in nav components; admin and member base URLs are configured via environment helpers with localhost defaults. These are compatible with the current one-location product but need explicit launch decisions for locale/currency and link delivery. **PARTIAL**.

## Tests, builds, and evidence actually run

Commands were run from `C:/Users/Jacky/Documents/Project-HitLink` without changing product files.

| Command | Real result | Status |
| --- | --- | --- |
| `pnpm --filter admin-web test` | 25 files, 126 tests passed | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter member-web test` | 7 files, 29 tests passed | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter admin-web lint` | exit 0, no warnings | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter member-web lint` | exit 0, no warnings | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter admin-web check-types` | route types generated; `tsc --noEmit` exit 0 | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter member-web check-types` | route types generated; `tsc --noEmit` exit 0 | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter admin-web build` | exit 1 with only `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`; no `.env` existed; root cause not emitted | BROKEN |
| `pnpm --filter member-web build` | same package-script failure | BROKEN |
| `pnpm --filter admin-web exec next build` | compiled, typechecked, generated 26 static-page units, and enumerated all admin routes; exit 0 | IMPLEMENTED BUT UNVERIFIED |
| `pnpm --filter member-web exec next build` | compiled, typechecked, generated 13 static-page units, and enumerated all member routes; exit 0 | IMPLEMENTED BUT UNVERIFIED |

Both direct builds warned that Next.js selected `C:\Users\Jacky\package-lock.json` as workspace root instead of the repository because multiple lockfiles exist. `turbopack.root` is not set. The package build scripts source `../../.env` before `next build`; they failed without diagnostic output, while direct Next builds succeeded. Package-script build reliability is therefore **BROKEN** and root cause is **UNKNOWN**.

`tests/e2e/flowstate-demo.spec.ts:54-190` covers a database-backed serial happy path across 23 admin routes, seven member routes, API health, member self-booking, public trial booking, roster visibility, and attendance persistence. `tests/e2e/migration-first-onboarding.spec.ts:65-270` covers protected redirect, signup validation, onboarding validation, CSV validation/import/reconciliation, migration gating, readiness, and screenshot capture. These suites were inspected but not run in this audit because they mutate a local database and require the API, admin, and member servers plus seeded/migrated infrastructure; task instructions limited verification to safe local/read-only inspection. Their present runtime status is **BLOCKED**.

Sixteen existing PNG screenshots cover the admin dashboard and onboarding/migration only. They were inspected by path and their design-review records; no new screenshots were captured because this task prohibits design/UI changes and secret-bearing screenshots.

## Git and working-tree evidence

- Branch/HEAD: `main` at `4dd5557`, matching `origin/main` at inspection time.
- Recent relevant commits: `4dd5557 feat: add migration-first onboarding operations`; `11e2620 docs: add migration-first onboarding initiative`; `b84e301 Refine Flowstate waitlist form layout`; `9dee5b7 Prepare offline demo audit flow`.
- The tree was already dirty. Existing changes included `apps/api/next-env.d.ts`, `docs/00-brain/Home.md`, `docs/README.md`, multiple `node_modules` platform files, and untracked `.hermes.md`, `docs/Agents/`, and `docs/status/`. They were not modified or discarded by this audit.
- This report is the only intended audit output.

## Material risks

1. **BROKEN — standard frontend build scripts:** both filtered package build commands exit 1 without a diagnostic, even though direct `next build` succeeds. CI/release commands may fail or behave differently from direct verification.
2. **MISSING — route recovery boundaries:** no authored loading/error/not-found routes exist, so database/network failures have framework-generic recovery and no domain-specific retry path.
3. **PARTIAL — migration information architecture:** owner status, raw CSV import, validation issues, reconciliation JSON, operator stage control, and completion notification share one owner route, contradicting the approved owner-facing migration direction.
4. **MISSING — migration-backed frontend domains:** class exceptions/instances, progress, conversations, announcements, events, private lessons, credits/refunds, and reliability operations have schema history but no reachable UI.
5. **PARTIAL — communication workflows:** coach invite records and form-link issuance do not prove email delivery; coach acceptance is absent; dunning automation is explicitly deferred.
6. **PARTIAL — destructive-action safety:** archive/cancel/revoke/remove actions have no dialog or confirmation pattern.
7. **PARTIAL — accessibility evidence:** visible focus and semantic structure exist, but form errors are not systematically announced or associated to fields, and most routes lack responsive/keyboard evidence.
8. **PARTIAL — test distribution:** 155 unit tests exercise helpers/actions, but there are no component render tests and only two broad serial E2E specs; negative authorization, external Stripe recovery, error boundaries, and responsive behavior across most routes are not automated.
9. **SCAFFOLDED — shared UI package:** applications duplicate components/styles while `packages/ui` remains unused create-turbo demo code with an alert button.
10. **UNKNOWN — current integrated runtime:** existing E2E and screenshots prove prior runs, not the current dirty `main` worktree.

## Contradictions

1. The migration-first initiative/design review says technical mapping, validation, dry runs, and reconciliation should remain internal, while `/dashboard/migration` exposes those controls to the owner (`.design/onboarding-flow/DESIGN_REVIEW.md:28-44`; migration page).
2. Weekly schedule UI says one-off changes and per-date exceptions are deferred, while the reliability migration introduces class-instance/exception concepts and the roster/member schedule synthesize occurrences from templates. The implemented UI does not expose the newer persistence model.
3. Product documentation describes email-only launch communications, but staff invite email delivery is explicitly deferred and trial/form links are returned to UI rather than sent by a proven mail integration.
4. Package manifests define normal `build` scripts, but both fail in the inspected Windows workspace while direct Next builds pass.
5. `packages/ui` is declared as a dependency but has zero imports and contains generic starter behavior rather than the app design system.

## Unresolved decisions

1. Who is allowed to access migration import/operator controls, and what is the exact owner-facing status route?
2. Should current template-derived dated occurrences be migrated to `ClassInstance`, and which exception operations belong in MVP?
3. Which migration-backed domains are approved for recovery versus intentionally outside MVP: progress, messaging/announcements, events, private lessons, credits/refunds?
4. What email delivery mechanism and acceptance route complete coach invitations and magic-link form delivery?
5. Is CAD/`en-CA` a launch commitment or only demo/local default? Localization and currency decisions are not represented in a shared frontend layer.
6. Which destructive actions require confirmation, undo, or a recoverable archive/restore workflow?
7. Should the unused `packages/ui` be replaced with shared Flowstate primitives or removed from app dependencies?

## Recommended recovery tickets

Each ticket below has one independently testable outcome.

1. **Fix reproducible frontend package builds.** `pnpm --filter admin-web build` and `pnpm --filter member-web build` both exit 0 on Windows and CI, with repository-root resolution explicit and no dependency on an absent `.env`.
2. **Add route recovery boundaries.** Each authenticated app has an accessible loading state and an error state with retry/recovery; tests force a loader failure and verify recovery.
3. **Separate migration owner status from operator controls.** Owners can only see progress, next owner action, Flowstate responsibility, milestone and support; raw import controls require an approved internal authorization path.
4. **Complete coach invitation acceptance.** A coach receives an email link, accepts a valid invite, obtains a session, and reaches only coach-authorized routes; expiry/revoke/duplicate states have E2E tests.
5. **Deliver form-signing links by approved email.** Trial/member/guardian requests enqueue and deliver an email while preserving token expiry and consent evidence; a local integration test proves the handoff without live credentials.
6. **Choose and implement the dated-class model.** Schedule, roster, booking and member schedule use one approved source for dated instances/exceptions, with cancellation and capacity-override tests.
7. **Add destructive-action recovery.** Archive/cancel/revoke/remove actions use an accessible confirmation or undo pattern, with keyboard and cancellation tests.
8. **Add cross-tenant and role browser tests.** Owner, coach and customer attempts to access foreign workspace/member/template/form IDs are denied without data disclosure.
9. **Add component accessibility tests.** Shared form errors are announced and associated with inputs; pending/success states and 44px mobile targets are covered for representative admin/member forms.
10. **Resolve shared UI ownership.** Replace starter `packages/ui` exports with approved Flowstate primitives used by both apps, or remove the unused dependency; no create-turbo alert/UTM behavior remains.
11. **Product-scope the backend-only domains.** Record explicit MVP decisions for progress, messages, announcements, events, private lessons, credits/refunds, and operational reliability; create implementation tickets only for approved domains.
12. **Verify the current integrated demo.** Start isolated local PostgreSQL/API/admin/member services, deploy migrations and seed fixtures, run both Playwright specs, and capture redacted desktop/tablet/mobile evidence for all modified user-visible flows.

## Exact synthesis evidence to verify

1. Read this file back: `docs/recovery/evidence/frontend.md`.
2. Enumerate routes with `pnpm --filter admin-web exec next build` and `pnpm --filter member-web exec next build`; compare every route with both inventory tables.
3. Confirm unit results with `pnpm --filter admin-web test` (25 files/126 tests) and `pnpm --filter member-web test` (7 files/29 tests).
4. Confirm lint/type gates with each app's `lint` and `check-types` scripts.
5. Reproduce the build contradiction by comparing each app's package `build` script with `pnpm --filter <app> exec next build`.
6. Search both apps for `loading.tsx`, `error.tsx`, `not-found.tsx`, dialogs/modals, `classInstance`, and imports from `@flowstate/ui`; expected authored matches are zero for all six categories.
7. Inspect `apps/admin-web/app/_components/admin-nav.tsx`, `apps/member-web/app/_components/member-nav.tsx`, and the three workspace/member context loaders to verify role and workspace routing.
8. Inspect `.design/onboarding-flow/DESIGN_REVIEW.md:28-54` against `apps/admin-web/app/dashboard/migration/page.tsx` to verify the owner/operator contradiction.
9. Inspect `apps/admin-web/app/dashboard/staff-invites/page.tsx:27-37` and `apps/member-web/app/trial/[workspaceId]/actions.ts:50-67` to verify record/link creation without proven email delivery.
10. Inspect `packages/ui/src/button.tsx`, `card.tsx`, and application imports to verify the unused starter package.
11. Inspect `tests/e2e/flowstate-demo.spec.ts:54-190` and `tests/e2e/migration-first-onboarding.spec.ts:65-270`; do not treat them as current passing evidence until rerun against isolated local services.
12. Inspect all 14 `packages/db/prisma/migrations/*/migration.sql`, especially `20260425120000_reliability_foundation` and `20260530120000_migration_first_onboarding_ops`, then compare their domains to the route inventories.
