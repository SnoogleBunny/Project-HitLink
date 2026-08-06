# Backend recovery evidence

Audit date: 2026-07-20 (local, UTC-07:00)

Task: `t_986dcc70`

Scope: end-to-end backend and domain audit of the repository as found, including product and engineering claims, Prisma schema and migrations, API and route handlers, server actions, authentication and authorization, persistence helpers, Stripe, notification/email paths, frontend-to-backend call paths, and automated verification.

## Outcome

Flowstate has a substantial modular-monolith backend behind the admin and member Next.js applications. The core owner/coach/customer session boundaries, one-workspace guardrail, schedule/member/product CRUD, booking and waitlist rules, forms, migration staging, and Stripe abstractions are represented in code and have passing unit tests.

It is **not yet safe to classify the backend as release-ready**. The strongest local proof is 162 passing unit tests plus direct production builds and basic HTTP checks. There is no executed database-backed integration proof in this audit, the local migration status could not be checked without a database URL, the root Windows build command is broken even though direct Next.js builds pass, email delivery has no runtime processor and contains a retry-state defect, and live Stripe fulfillment has unresolved payment-state/idempotency/capacity risks.

Recommended disposition: keep real Stripe charges and launch email disabled until P0 findings below are fixed and proven against an isolated PostgreSQL database and Stripe test mode.

## Status legend

- **VERIFIED LOCAL**: exercised successfully in this workspace during this audit.
- **IMPLEMENTED / UNIT VERIFIED**: implementation and focused tests exist, but no real database/provider integration was executed.
- **PARTIAL**: meaningful behavior exists, but a required path or safety property is absent.
- **SCAFFOLDED**: shape or persistence exists without a complete operational workflow.
- **MISSING**: an approved requirement has no implementation found.
- **BLOCKED VERIFICATION**: implementation may exist, but prerequisites for a safe local proof were unavailable.

## Repository and control state

- Audit ran in `C:/Users/Jacky/Documents/Project-HitLink` on branch `main`, tracking `origin/main`.
- The workspace was already materially dirty before this task. Existing modified/untracked paths were preserved; no source or schema files were changed.
- This task created only `docs/recovery/evidence/backend.md`.
- No migration, reset, seed, deployment, external write, production credential, or live Stripe operation was run.
- Other recovery evidence files were not read or reused; this report is based on direct backend inspection and local commands.

## Inventory

Static inventory excluded `node_modules` and Next.js build output.

| Surface | Count / location | Evidence |
|---|---:|---|
| Server-action files | 28 files, 65 exported functions | `apps/admin-web/**/actions.ts`, `apps/member-web/**/actions.ts`, `apps/landing-web/app/actions.ts` |
| HTTP route files | 5 files, 5 handlers | Stripe webhook, three form-document downloads, API health |
| Application files importing DB package | 59 | `@flowstate/db` imports under `apps/**` |
| Application files importing auth package | 14 | `@flowstate/auth` imports under `apps/**` |
| Stripe-related application files | 14 | Stripe SDK, checkout, Connect, billing, webhook, and tests |
| Unit-test files | 33 | 25 admin, 7 member, 1 auth |
| Unit tests exercised | 162 | 126 admin, 29 member, 7 auth |
| Playwright specifications | 2 specs, 3 cases | `tests/e2e/flowstate-demo.spec.ts`, `tests/e2e/migration-first-onboarding.spec.ts` |
| Prisma schema | 65 models, 48 enums | `packages/db/prisma/schema.prisma` |
| Prisma migrations | 14 ordered migrations | `packages/db/prisma/migrations/**/migration.sql` |
| Dedicated API application | 1 health handler | `apps/api/app/api/v1/health/route.ts` |

The 28 server-action files all have at least one application caller found by static import/reference tracing. The admin dashboard has 27 protected page surfaces and the member application has 8 protected page surfaces; page/domain access resolves through owner, admin/coach, or member context helpers rather than trusting client-supplied workspace identity.

## Surface classification

### 1. Authentication and session storage — IMPLEMENTED / UNIT VERIFIED

What exists:

- Separate admin and member cookies (`flowstate_admin_session`, `flowstate_member_session`).
- 32-byte random bearer tokens; only SHA-256 token hashes are persisted.
- Seven-day expiry, HTTP-only cookies, `SameSite=Lax`, and `Secure` in production.
- Expired sessions are deleted on lookup.
- More than one active workspace membership invalidates the application session, preserving the one-location MVP boundary.
- Passwords use bcrypt with cost 12.
- Owner, coach, and customer role checks are performed server-side.

Evidence:

- `packages/auth/src/session.ts:5-8`, `packages/auth/src/session.ts:132-165`, `packages/auth/src/session.ts:168-228`
- `packages/auth/src/password.ts:1-17`
- `packages/auth/src/session.test.ts`: 7 passing tests
- Unauthenticated HTTP requests to `http://127.0.0.1:3000/dashboard` and `http://127.0.0.1:3001/app` returned `307` with `location: /login`.

Gaps / risks:

- No login throttling, lockout, or abuse-control implementation was found.
- No self-service password-reset flow was found, although the product ledger identifies reset as required.
- Auth tests use repository doubles; no real PostgreSQL session lifecycle was exercised.

### 2. Authorization and workspace isolation — IMPLEMENTED / UNIT VERIFIED

What exists:

- Admin context permits owner or coach; owner context rechecks an active owner workspace membership.
- Member context requires customer role and a member record linked to the session user in the same workspace.
- Coach operational access is bounded by assigned templates for schedule/roster mutations.
- Download routes resolve owner/member/magic-link context and constrain records by workspace and record identity.
- Protected-page and mutation paths consistently derive `workspaceId` from server session context.

Evidence:

- `apps/admin-web/lib/admin-access.ts`
- `apps/admin-web/lib/owner-workspace.ts`
- `apps/admin-web/lib/operations-workspace.ts`
- `apps/member-web/lib/member-auth.ts`
- `apps/admin-web/proxy.ts`, `apps/member-web/proxy.ts`
- Passing tests in `admin-access.test.ts`, `owner-workspace.test.ts`, `operations-workspace.test.ts`, `member-auth.test.ts`, `class-access.test.ts`, and roster/action tests

Gap:

- Middleware/proxy checks cookie presence only; the authoritative database-backed session/role check happens later in server code. This is acceptable as a routing optimization, but it is not an authorization boundary by itself.

### 3. Owner onboarding and one-location workspace setup — IMPLEMENTED / UNIT VERIFIED

What exists:

- Owner signup creates one owner user, workspace, workspace membership, and location in a transaction.
- Onboarding captures gym identity, timezone, address, migration intake, and migration-gating state.
- Operational routes redirect pre-launch workspaces to the migration workflow.

Evidence:

- `apps/admin-web/app/signup/actions.ts`
- `apps/admin-web/app/onboarding/actions.ts`
- `apps/admin-web/lib/onboarding.ts`
- `apps/admin-web/lib/owner-workspace.ts`
- Passing signup/onboarding/owner-workspace tests and successful direct admin production build

Gaps:

- The database-backed onboarding Playwright case was not run because no `DATABASE_URL` or local PostgreSQL container was available.
- Concurrent signup for the same email depends on database uniqueness; the action does not translate a post-check unique race into a stable user-facing result.

### 4. Programs, rooms, class templates, members, plans, and access products — IMPLEMENTED / UNIT VERIFIED

What exists:

- Owner-scoped CRUD and archive/update behavior for programs, rooms, recurring class templates, members, membership plans, punch cards, and drop-ins.
- Program restrictions and enabled/archive states are persisted.
- Frontend forms call server actions, which derive owner context and then call domain/persistence helpers.

Evidence:

- Admin server actions under `/dashboard/programs`, `/rooms`, `/schedule`, `/members`, `/membership-plans`, and `/access-products`
- Domain libraries and passing tests: `programs`, `rooms`, `class-templates`, `members`, `membership-plans`, `access-products`

Gaps:

- Proof is mock-backed unit coverage, not a real transaction/constraint test.
- Schema models for richer class-instance and other future domains are present without active application call paths; see schema-only section.

### 5. Booking, capacity, waitlist, roster, and attendance — IMPLEMENTED / UNIT VERIFIED

What exists:

- Occurrences are derived with timezone-aware date helpers.
- Active bookings and pending-payment holds count against capacity.
- Booking, cancellation, waitlist join/leave, promotion, coach assignment, roster state, attendance, punch consumption/restoration, and drop-in finalization are implemented.
- Core access mutations use database transactions and workspace filters.
- Public trial booking and member self-service routes call the shared access domain.

Evidence:

- `packages/db/src/occurrences.ts`
- `packages/db/src/class-access.ts`
- Passing `class-access.test.ts`, `bookings.test.ts`, `rosters.test.ts`, `self-service-bookings.test.ts`, and `trial-booking.test.ts`

Gaps / risks:

- No real concurrent PostgreSQL capacity test was run. Mock tests do not prove isolation behavior under simultaneous bookings.
- `finalizeDropInBookingPayment` can change any found booking that is not already `BOOKED` to `BOOKED`; it does not require `PENDING_PAYMENT`, require the stored checkout session to match, or re-check capacity (`packages/db/src/class-access.ts:1723-1772`). This can re-seat a cancelled/released booking after capacity has been consumed elsewhere.

### 6. Migration-first onboarding and CSV import — PARTIAL

What exists:

- CSV parsing/mapping, validation issues, staged records, jobs, reconciliation summaries, migration stage transitions, operational gates, and a notification-outbox enqueue on completion.
- Staging creation is transactional.
- Member, guardian, membership, punch-card, billing-history, and form-signature import mappings exist.

Evidence:

- `apps/admin-web/lib/workspace-migration.ts`
- `apps/admin-web/app/dashboard/migration/actions.ts`
- `packages/db/prisma/migrations/20260530120000_migration_first_onboarding_ops/migration.sql`
- Four passing unit tests for CSV parsing/validation and historical-record blocking

Gaps / risks:

- Import execution marks a job running, loops through staged records, and then marks it complete without wrapping the imported domain writes in one transaction (`workspace-migration.ts:1951-2084`; loop begins at `:1984`). A mid-run failure can leave partial imported state.
- The four unit tests do not execute a successful multi-record import against PostgreSQL and do not prove retry/idempotency or rollback behavior.
- The Playwright migration case contains destructive cleanup of namespaced test rows and therefore was not run without an explicitly isolated database.

### 7. Stripe Connect and recurring billing — PARTIAL / DO NOT ENABLE LIVE

What exists:

- Standard Connect account creation/link refresh/status sync.
- Connected-account customer, product, price, subscription, invoice retry, payment-method update, punch-card checkout, and drop-in checkout abstractions.
- Signed webhook route requires `STRIPE_WEBHOOK_SECRET` and uses Stripe signature verification.
- Webhook events are claimed and persisted with processing/error state.
- Unit tests cover selected Connect status, invoice, membership, failed-payment, checkout, and webhook-domain paths via doubles.

Evidence:

- `apps/admin-web/app/api/stripe/webhook/route.ts`
- `apps/admin-web/lib/stripe-settings.ts`
- `apps/admin-web/lib/stripe-billing.ts`
- `apps/admin-web/lib/member-memberships.ts`
- `apps/admin-web/lib/failed-payments.ts`
- `apps/member-web/lib/member-billing.ts`
- `apps/member-web/lib/member-commerce.ts`

P0 risks:

1. `checkout.session.completed` fulfillment does not require `session.payment_status === "paid"` before booking a drop-in, granting a punch card, and recording success (`stripe-billing.ts:1072-1169`). Stripe Checkout can complete before funds are final for asynchronous payment methods.
2. Checkout, customer, product, and price creates do not provide Stripe idempotency keys; repeated/concurrent actions can create duplicate provider objects or sessions (`member-commerce.ts:226-318`, `:515-624`, `:639-790`).
3. Drop-in fulfillment does not require the current stored checkout-session ID or revalidate capacity (`class-access.ts:1723-1772`). A late valid webhook can book a released seat and exceed capacity.
4. Provider calls and local persistence are split across operations without a recovery ledger for each intermediate provider object. A Stripe success followed by a database failure can leave an orphaned provider object/session or divergent local state.

Other gaps:

- No Stripe CLI/test-mode webhook replay was run.
- No integration test exercises signed route body handling, connected-account event routing, duplicate delivery, asynchronous payment completion, or DB rollback.
- The webhook claim is durable and retries `ERROR` rows, but provider and domain idempotency still need explicit integration proof.

### 8. Forms, signatures, and document access — PARTIAL

What exists:

- Owner form metadata/version management, PDF byte persistence, MIME/header/size validation, required-form rules, member/trial signature requests, HMAC magic-link tokens, expiration/status checks, member signing, and scoped document downloads.
- Download routes return documents as attachments.

Evidence:

- `packages/db/src/forms.ts`
- Owner/member form actions and four document/signing route/page surfaces
- Passing `forms.test.ts` and `forms-domain.test.ts`

Gaps / risks:

- Email distribution of magic links is not operational; only outbox enqueue exists for the migration-complete email path.
- Uploaded PDF validation checks metadata and PDF header but performs no malware/content scanning.
- No real route test verifies authenticated authorization, token expiry, response headers, and stored bytes together.

### 9. Notification and launch email — SCAFFOLDED / DEFECTIVE

What exists:

- `NotificationJob` persistence, enqueue helper, batch processor abstraction, development adapter, attempt counters, timestamps, and provider result fields.
- Migration completion enqueues one owner email job.

Blocking defects:

1. No application worker, cron, route, or command invokes `processNotificationOutbox`; the only application reference is enqueueing from migration actions. Queued email therefore has no runtime delivery path.
2. The processor selects only `PENDING` jobs (`notification-outbox.ts:140-157`) but changes failed sends to `FAILED` while setting `nextAttemptAt` (`notification-outbox.ts:214-232`). Those jobs can never be selected for retry.
3. Only a development adapter exists; no launch email provider adapter/configuration was found.
4. No notification-outbox tests were found.

Product impact: approved launch communication is email-only, so launch email cannot currently be considered implemented.

### 10. Staff invites and account recovery — PARTIAL / MISSING

What exists:

- Owner can create/revoke staff-invite records.
- Owner can provision/reset a member portal password directly.

Missing:

- No invite acceptance route/action was found.
- No invite email path was found.
- No owner/member forgot-password or tokenized password-reset flow was found.

### 11. Dedicated API application — SCAFFOLDED / HEALTH VERIFIED

What exists:

- `GET /api/v1/health` returns `{ "ok": true }`.
- The API application built successfully.
- A locally started API dev server returned `HTTP/1.1 200 OK`, `content-type: application/json`, and `{ "ok": true`; the audit-owned server was then stopped.

Evidence:

- `apps/api/app/api/v1/health/route.ts`
- `apps/api/app/page.tsx:12-16` explicitly calls this application a placeholder for future API work.
- `apps/api/package.json:12` says `No tests yet`.

Gap:

- There is no readiness/database health endpoint, authenticated API contract, versioned domain API, or API test. Current domain behavior lives primarily in Next.js server actions inside admin/member applications.

### 12. Landing waitlist — PARTIAL

What exists:

- Server-side field validation and JSONL append persistence.

Evidence:

- `apps/landing-web/app/actions.ts`
- `apps/landing-web/lib/waitlist.ts:35-84`

Gaps / risks:

- Persistence defaults to local process filesystem (`data/waitlist-submissions.jsonl`), which is not durable or shared in typical serverless/multi-instance hosting.
- No duplicate handling, abuse throttling, consent/audit workflow, delivery integration, or automated tests were found.

### 13. Schema-only/future domains — SCAFFOLDED

The Prisma schema contains models with no direct application persistence call paths found, including examples such as `ClassInstance`, `Invoice`, `InvoiceLineItem`, `Refund`, `AccountCredit`, `Event`, `Conversation`, `ConversationParticipant`, `ConversationMessage`, `MessageTemplate`, `SavedView`, and `SavedFilter`.

These models must not be described as working product behavior. Some roadmap/domain documentation is stale relative to the schema (for example, `ClassInstance` now exists in Prisma but is not used by application code).

### 14. Database schema and migrations — VALID SCHEMA / BLOCKED MIGRATION STATUS

What was verified:

- All 14 migration files and the current schema were inspected in order.
- `pnpm db:validate` passed: Prisma reported the schema valid.
- The current shape consistently carries workspace foreign keys and composite uniqueness in implemented domains, supporting one-location isolation.

What was not verified:

- `prisma migrate status` failed before database access because `DATABASE_URL` was absent (`P1012`).
- `docker compose ps --format json` returned no running services.
- No migration deploy, reset, seed, drift check, rollback rehearsal, or PostgreSQL constraint/integration test was run.

Disposition: schema syntax is verified; migration application order and drift are **BLOCKED VERIFICATION** until an isolated PostgreSQL target is supplied.

## Frontend-to-backend call-path findings

The dominant architecture is:

1. React form/page imports a colocated `actions.ts` server action.
2. The action obtains owner/admin/member context from the server session.
3. The action validates form data and calls a domain helper in `apps/*/lib` or `packages/db/src`.
4. The helper scopes queries by derived `workspaceId`, mutates Prisma, then the action revalidates/redirects.

Observed exceptions/special paths:

- Public landing waitlist writes a JSONL file.
- Public trial booking resolves a workspace-specific trial context and calls shared class access.
- Magic-link form signing resolves an HMAC token and request state rather than a logged-in member session.
- Stripe sends signed POSTs to the admin webhook route.
- Document routes stream stored bytes after owner/member/token authorization.
- The dedicated API application currently exposes health only.

This is consistent with the modular-monolith decision. No microservice or multi-location assumption was found in active backend call paths.

## Automated verification results

### Passed

1. `pnpm exec turbo run test --force`
   - 11 tasks successful; 0 cached.
   - Admin: 25 files, 126 tests passed.
   - Member: 7 files, 29 tests passed.
   - Auth: 1 file, 7 tests passed.
   - Total behavior tests: 33 files, 162 passed.
   - API, landing, DB, and several shared packages have placeholder/no behavior tests; DB package only validates Prisma schema.

2. `pnpm lint`
   - 9 tasks successful; 8 replayed from local Turbo cache, API lint executed.

3. `pnpm check-types`
   - 9 tasks successful; API typecheck/typegen executed and 8 tasks replayed from local Turbo cache.

4. `pnpm db:validate`
   - Passed: `The schema at prisma/schema.prisma is valid`.

5. Direct production builds:
   - `pnpm --filter api build` passed; route inventory included `/api/v1/health`.
   - `pnpm --filter admin-web exec next build` passed; all admin routes compiled/typechecked.
   - `pnpm --filter member-web exec next build` passed; all member routes compiled/typechecked.
   - `pnpm --filter landing-web exec next build` passed.

6. Runtime HTTP:
   - Audit-owned API dev server became ready in 474 ms and returned `200` with `{ "ok": true }`; it was stopped after proof.
   - Existing local admin/member servers returned login pages with `200` and protected routes returned `307 /login` without cookies.

### Failed / blocked

1. `pnpm build` failed on Windows before Next.js execution for admin/member/landing. Their scripts nest `sh -c '...; next build'`; in this host's nested shell, `next` is not on `PATH`. Direct `pnpm --filter <app> exec next build` passes, proving application compilation while leaving the canonical root build gate broken. `apps/admin-web/package.json`, `apps/member-web/package.json`, and `apps/landing-web/package.json` need a cross-platform build script.

2. `pnpm --filter @flowstate/db exec prisma migrate status --schema prisma/schema.prisma` failed with Prisma `P1012` because `DATABASE_URL` was not set. No database service was running.

3. Playwright was not run. The root `test:e2e` command first invokes `db:reset:demo`, which executes `prisma migrate reset --force`; running it without an explicitly isolated database would violate the non-destructive audit boundary. The migration Playwright case also deletes namespaced rows. Existing specifications are useful but are not current-run proof.

4. No Stripe test credentials/CLI and no email-provider sandbox were used, so provider integrations remain unverified.

## Documentation drift

- `docs/04-demo/Working Demo State.md` records a passing April demo snapshot, but it is historical evidence, not proof of the July repository state.
- The dedicated API page still describes future API work, matching the current health-only implementation.
- Prisma now includes `ClassInstance`, while active scheduling still derives occurrences from recurring templates and no application `classInstance` calls were found.
- Product decisions include password reset, invite-based operational communication, and email-only launch communication; those paths are missing or scaffolded as described above.
- Code/build versions are newer than several README examples; release documentation should be regenerated from current commands after the recovery fixes.

## Risk and remediation order

### P0 — before real payments or launch email

1. Gate checkout fulfillment on confirmed paid state; handle asynchronous payment events explicitly.
2. Add Stripe idempotency keys and a durable provider-operation recovery strategy for customer/product/price/subscription/checkout creation.
3. Require current pending booking + matching checkout session and revalidate capacity atomically before drop-in fulfillment.
4. Wire a real notification worker/provider, fix `FAILED` retry selection, and add retry/dead-letter tests and runtime proof.
5. Add isolated PostgreSQL + Stripe test-mode integration tests for duplicate webhooks, late completion, concurrent capacity, and local/provider rollback cases.

### P1 — before release candidate

6. Prove all 14 migrations against a disposable PostgreSQL database, run migration status/drift, and exercise database constraints and transactions.
7. Make migration import atomic or explicitly resumable/idempotent with per-record checkpoints; test failure/retry/reconciliation against PostgreSQL.
8. Implement password reset, staff invite acceptance, and email delivery paths with abuse controls.
9. Repair cross-platform root build scripts so `pnpm build` is the canonical passing gate on Windows and CI.
10. Add login/public-form throttling and security/authorization integration tests for actions and document routes.

### P2 — product completeness and operational clarity

11. Replace filesystem waitlist persistence with an approved durable store and add consent/duplicate/abuse handling.
12. Decide whether the API remains health-only or receives an explicit supported contract; add readiness and tests either way.
13. Reconcile schema-only models and stale documentation so planned persistence is not mistaken for working behavior.
14. Add structured logging/metrics for auth failures, webhooks, import jobs, outbox jobs, and health/readiness without logging secrets or PII.

## Safe next verification packet

After P0/P1 code review, run in a disposable local environment only:

1. Start a dedicated PostgreSQL database with no production connectivity.
2. Apply all migrations from empty; run `prisma migrate status` and a schema drift check.
3. Seed only synthetic demo data.
4. Run forced unit tests, lint, typecheck, canonical root build, and both Playwright specs.
5. Run concurrent booking/waitlist/drop-in integration cases against PostgreSQL.
6. Use Stripe test mode + Stripe CLI to replay signed duplicate, delayed, expired, unpaid/async, and out-of-order events.
7. Run an email sandbox worker through success, retry, terminal failure/dead-letter, and idempotent replay.
8. Capture command output and HTTP/database/provider evidence with credentials and PII redacted.

## Bottom line

Flowstate's backend is beyond a shell: core modular-monolith domain behavior exists and 162 unit tests pass. The release decision must nevertheless remain **hold** because payment fulfillment, notification delivery, migration/database integration, and the canonical build gate do not yet have the required safety proof, and several contain concrete defects that could cause unearned entitlements, over-capacity bookings, undelivered email, or partial imports.
