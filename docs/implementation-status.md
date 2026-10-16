# Approved workflow implementation

The target is the complete approved HitLink experience in `approved-workflows.md`, with the replacement Word specification, working persistent application workflows, verification, and a push to the existing GitHub repository. This checklist records progress; it does not reduce that target or certify unfinished features.

Starting revision: `d8f6ab9` on `origin/main`. Implementation branch: `codex/approved-workflows`. Existing uncommitted changes in the original checkout are preserved. Development and migration testing use a separate local PostgreSQL database, `hitlink_implementation_test`; no live database is used.

## Completion evidence

Every row needs source implementation, meaningful domain/permission checks, and browser evidence where applicable. Existing schema or an old passing test alone does not prove the approved workflow.

| Requirement | Work and required proof | Current state |
| --- | --- | --- |
| Specification | Retain all v1.2 workflows and release gates; integrate approved changes; matching replacement Word document visually reviewed | Replacement v1.3 Word document generated and all 45 pages visually reviewed; accessibility check passed. Final implementation reconciliation pending. |
| Shared interface | Approved fonts, neutral themes, spacing, badges, hover, text links, skeletons, stable navigation, touch targets, focus and reduced motion | Implemented. Shared components and responsive/browser checks passed; final whole-app sweep pending. |
| Owner Today | Real active-member count, dated class bookings, actionable attention queue; zero attention is not clickable; trials prominent | Implemented with real counts and dated destinations; page tests and browser checks passed. Attention queue includes failed payments and financial review cases. |
| Class scheduling | One-off/daily/weekly recurrence, one-date/future edits, review, optimistic concurrency, history protection, actual room/coach conflicts, cancellation and notifications | Implemented. Real database tests cover concurrent edits, long recurrence horizons, capacity conflicts and history; owner browser workflow passed. |
| Coach assignment | Optional default; independent inherit/assigned/unassigned dates; actual coach authorized on dated roster; bookings preserved | Implemented and verified: optional default, per-date inherit/assigned/unassigned, actual coach permissions and preserved bookings. |
| Capacity, waitlist and attendance | Atomic seat/allowance reservation, fair promotion, explicit consequences, walk-ins, corrections and no duplicate settlement | Atomic seat/allowance/unit paths and verified trial cases tested. Per-program rank, age and cohort prerequisites are enforced at booking, promotion and attendance. |
| Member Classes | Unified dated schedule and booking management, review before commitment, moves, pending recovery, history; legacy home/bookings redirect | Implemented. Real browser book/move/cancel/waitlist and family isolation passed at desktop and phone widths. |
| Household access | Verified booking/signing permissions, header member selector, account and payment scope unchanged, revoked access rejected server-side | Implemented. Verified grants, revocation, payer distinction and header selector tested. Signature race and child signing checks passed. |
| Membership limits | Accepted versioned terms, weekly/billing-month caps, exact used/reserved/available/reset summary, configurable counting, unlimited omitted | Implemented with immutable accepted terms, billing-cycle windows and separate allowance/pack ledgers. Concurrent last-unit/seat tests passed. |
| Cancellation and freeze | Notice receipt determines boundary; reviewed owner discretion; provider-stop verification; finite freeze, no automatic booking restoration | Implemented. Thirteen lifecycle database/provider-adapter tests pass. Old-debt retries stop at termination by default through a separate verified operation; owners may explicitly disclose continued collection. Owner/member UI and background dispatch are integrated. |
| Billing recovery | Stable retry operation, pending reconciliation, grace deadline, scoped updates, verified provider outcomes and webhook idempotency | Canonical reconciliation, stable retry journal and debt projection implemented. Eight invoice, six invoice-retry, ten durable-checkout, three legacy-checkout and three canonical-evidence tests pass. Unknown first-failure dates require review and cannot invent a new grace period. |
| Packs, refunds and credit | Separate unit and money ledgers; reserve/settle/release exactly once; reviewed partial refund and credit application | Implemented. Nine refund/credit database tests passed plus owner confirm/status browser checks; recovery resolution UI in review. |
| Forms and consent | Exact accepted versions, guardian authority, signing guards, immutable signature evidence | Implemented. Five real database race/authority tests and eight existing forms tests passed, including revoked guardian and minor signing guards. |
| Public trial and enrollment | Separate trial/paid flows, participant verification, signed terms, hosted checkout, webhook-confirmed activation and failure recovery | Fourteen identity, four verified-trial and nine paid-membership database tests pass. Adult and guardian browser flows pass, including child form signing after another tab changes the selected person. Review-required payment outcomes remain blocked after permissions are restored. |
| Website | Draft/published plans, one highlight, valid operational terms before checkout, real metadata/share assets, legal placeholders and useful HTTP 404 | Implemented. Draft/publish, preview authorization, metadata/images, legal placeholders, robots/sitemap and actual unknown-gym404 verified. Signup terms include lifecycle policy fingerprint. |
| Coaching enrollment | Adult one-to-one programs, agreement/intake/goal/milestones, assigned coach, scheduled/active states and separate payments | Implemented and covered by ten coaching database tests and payment adapter tests; owner/client browser flow verified. |
| Coaching notes | Daily authored notes, private versus client-published versions, publishing/withdrawal history, client My day, no private-note exports | Author-private notes and versioned publication are verified. Incident containment after closure/author departure, exceptional audited review, withdrawal tombstones and missed-delivery queue remain required. |
| Coaching appointments | Optional appointment credits, conflicts, reservation/move/cancel/delivery, notes-only programs omit appointments | Ordinary booking, timely moves, cancellations and units are verified. Atomic late moves, configurable no-show grace and provider-absence recovery remain required. |
| Coaching continuity | Pause, coach handoff, service closure and separate refund review; historical permissions preserved without exposing private notes | Pause/handoff/closure and separate review states are verified. Terminal evidence-backed settlement, complete historical client exports and optional third-party payer consent remain required. |
| Program progress | Gym-configured rank rules, member rank history and verified child authority | Implemented. Six real database tests and production browser owner policy/promotion/history checks pass at desktop and phone widths. |
| Import and cutover | Rehearsal, reconciliation, payer authorization, owner acknowledgment and separate operator activation | Explicit source totals, authority, immutable cutover snapshot and owner/operator gates implemented. Unsafe ACTIVE defaults removed; contact-only cutover verified. Accepted entitlement, allowance opening balance and future-booking imports remain required. |
| Export, offboarding and support | Scoped export, private-data exclusion, billing/access closure gates, time-limited audited support | Business relational/files archive, checksums, receipt/freshness, verified billing stops, unused pack/credit blockers and named read-only support implemented. Five database tests and responsive browser checks pass. Individual member/payer archives, reconciled billing handover and authorized retention execution remain required. |
| Reliability | Workspace/role/participant isolation, concurrency, retries, audit and durable outbox; no simulated payment success in production | Six outbox tests and four maintenance-route tests pass. Exhausted abandoned claims become visible failures; current recipient authority and notification context are checked before delivery. Final cross-workflow audit pending. |
| Delivery | Lint/types/tests/build, migrations on clean and upgraded databases, browser workflows, final requirement audit, GitHub push verified by remote SHA | Checkpoint whole lint/tests and all four production builds pass. All 28 migrations deploy on a clean database and the upgraded test database has no schema drift. Remaining implementation, final verification, document reconciliation and final verified push remain pending. |

## Verification record

- Latest GitHub state fetched; local original main matches `origin/main` at the starting revision.
- Clean isolated worktree created. Locked dependencies installed with Node 22 and pnpm 10.33.0.
- Original 16 migrations applied successfully to the isolated empty test database.
- Prisma Client generated from the starting schema.

No row is complete merely because this file names it. Add exact source and verification evidence as each workflow is completed.

## Current verification evidence — 2026-10-16

These are local checks against an isolated disposable database, not evidence of production activation. Live Stripe credentials, email credentials and the internal worker secret remain unset. No real messages or charges were sent.

- `apps/member-web/lib/public-enrollment.integration.test.ts`: 14 PostgreSQL tests pass for verification, duplicate submissions, mailbox throttling, identity isolation, granular guardian authority, accepted terms and activation gating.
- `apps/admin-web/lib/public-membership.integration.test.ts`: 9 PostgreSQL/provider-adapter tests pass for first-invoice confirmation, replay, lost responses, expiry, stale offers, consent changes, sticky reviews and money retained after service end.
- `apps/admin-web/lib/invoice-reconciliation.integration.test.ts`: 8 PostgreSQL tests pass for immutable failure/grace history, unknown failure dates, independent invoice debt, freeze/end preservation, cash deduplication and payer/account validation.
- `apps/admin-web/lib/notification-outbox.integration.test.ts`: 6 tests pass for concurrent enqueue/claims, retryable and terminal failures, lease recovery/fencing, exhausted leases, message expiry/supersession, staging suppression and provider receipts.
- `apps/admin-web/lib/stripe-billing.test.ts`: 3 webhook delegation/retry/deduplication tests pass after canonical payment integration.
- Whole-repository lint passes. All four applications build in production mode; shared DB and payments package TypeScript checks pass.
- Original 16 migrations plus additions001–012 were applied to the upgraded test database and a clean isolated database; Prisma reports no schema difference for either. Repeat after the remaining additive schema work.
- Browser checks include the actual production owner rank-policy/promotion/history workflow, public adult/child enrollment and signing, family switching, member bookings/moves/cancellations, payment recovery, coaching and records settings. The entire historical Playwright suite has not yet been rerun against the new workflows.
- Checkpoint at 2026-10-16: `pnpm test` passes all 12 package tasks with the isolated PostgreSQL URLs set, including 498 admin tests and 201 member tests. `pnpm lint` passes all 10 tasks; `pnpm build` passes all four applications. Logs are kept locally under `test-results/checkpoint-*.log` (ignored by Git). These results do not certify the unfinished requirements above.

## Background processing setup

`POST /api/internal/maintenance` accepts a Bearer token matching `HITLINK_WORKER_SECRET` (at least32 characters). It processes one activated workspace per request and returns `nextCursor`; call the next page using `?cursor=...` until `done:true`, then begin the next scheduled sweep without a cursor. Retry503 responses with the same cursor. The endpoint refuses an absent/missing secret and returns only operational counts/status.

Email delivery requires `RESEND_API_KEY` and `HITLINK_EMAIL_FROM` with a verified sender. Missing email configuration leaves the outbox queued. Stripe lifecycle reconciliation requires `STRIPE_SECRET_KEY`. The scheduled deployment must invoke this endpoint regularly; no scheduler or external sending has been activated by this implementation task. Never configure live credentials for staging or an import rehearsal. Simulated email adapters cannot satisfy a production delivery receipt.

Email provider acceptance is not proof of inbox delivery. Jobs retain provider IDs and use stable idempotency keys; retries beyond a provider's retention window may produce duplicate external delivery. Terminal failures remain visible for operational review. Coaching messages contain a secure portal prompt rather than note text and check publication/retrieval status before dispatch.
