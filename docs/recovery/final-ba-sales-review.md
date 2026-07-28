BLOCKED

# Final BA / Sales Review — Project Recovery Matrix and Audit

Date: 2026-07-20
Kanban task: `t_e140d719`
Review role: Flowstate BA / Sales
Required targets: `docs/PROJECT_RECOVERY_WORKFLOW_MATRIX.md` and `docs/PROJECT_RECOVERY_AUDIT.md`

## Customer / business outcome

The recovery package cannot yet be approved for CEO finalization because both canonical deliverables are absent. There is no workflow matrix to verify across actor, implementation, authorization, failure recovery, persistence, tests, status, and priority, and there is no canonical 18-section audit to verify for decision consistency or evidence traceability.

The available synthesis correctly concludes that Flowstate is not a green repository baseline and is not pilot-ready. Its first five technical recovery packets are mostly well bounded. However, the synthesis is not commercially complete: it omits a public, specific 15% grandfathered-discount promise, an owner-facing one-business-day migration-review promise, and public parent-account language that exceeds the reachable guardian experience. Those are direct buyer commitments or overclaims, not later polish.

Why this matters: recovery documents will govern what the team fixes, what a salesperson or demo operator may safely say, and what Jacky is asked to approve. If the canonical package omits current public promises and actor-boundary conflicts, Flowstate could restore technical gates while continuing to expose unapproved commercial commitments and an unsafe migration cutover model.

## Verdict

**blocked**

This is a deliverable-readiness block, not a rejection of the recovery direction. The matrix and canonical audit must be created from the specialist evidence, then corrected against the findings below before CEO finalization.

## Immediate recommendation

1. Create both canonical files at the required paths.
2. Add a commercial-claim containment gate before the technical sequence: Jacky must explicitly approve, revise, or remove the 15%/grandfathering promise; the unsupported one-business-day migration-review wording should not remain customer-visible without an approved operating commitment.
3. Retain the five technical recovery packets, but do not make migration authorization/readiness repair wait on unrelated index-name drift. Resolve the migration actor/sign-off decision first and allow the safety packet to proceed independently.
4. Reconcile every workflow row against primary code and current QA evidence using the approved status vocabulary. Do not infer shipped behavior from Prisma models, migrations, helper functions, or test files alone.
5. Keep live Stripe, production email, customer migration data, deployment, and external commitments blocked until separately approved and verified.

## Review basis and evidence classification

### Repository facts

- The two required targets do not exist in the reviewed workspace.
- `docs/recovery/evidence/orchestrator-synthesis.md` is the available draft synthesis, not the required canonical audit or matrix.
- Current public copy states that founding gyms receive 15% off monthly pricing, grandfathered after launch, in visible page copy, waitlist copy, success copy, and JSON-LD.
- Current migration defaults promise an initial review within one business day after access or exports are received.
- Current public copy presents parent accounts as part of the operating product.
- The repository contains no approved pricing, discount, grandfathering, migration turnaround, support SLA, or guarantee decision in the inspected decision ledgers.
- The approved application roles are owner, coach, and customer. No internal Flowstate migration-operator principal exists in the current role architecture.
- The owner-authorized migration action can set the migration to complete and the workspace active without server-side evidence that required imports, blockers, reconciliation, and sign-off are complete.
- The isolated migration-first onboarding E2E passed, but that test exercises the same owner self-activation path; a passing browser test does not make the business authorization model safe.
- The connected demo E2E is broken by seed-readiness and public-trial occurrence/cutoff inconsistency.
- Current launch-email foundations do not constitute delivered email. Only migration completion was found producing a notification; there is no production provider/worker path, and failed jobs are not automatically selected for retry by the current pending-only processor query.
- `ClassInstance` is persisted but unused by application paths; one-off cancellation, rescheduling, substitute, room, time, and capacity operations are not shipped workflows.
- Stripe code and webhook abstractions exist, but provider fulfillment and live/test-mode end-to-end safety were not verified. Live money movement must remain disabled.

### Approved product decisions

- Single-location first.
- Responsive web-only MVP/demo.
- Owner, coach, and customer roles only.
- Stripe is the intended payment rail; the demo may degrade gracefully without credentials.
- Member self-service is part of the demo.
- Staff invites remain record-first until delivery and acceptance exist.
- Forms remain PDF/version/signature-record first.
- All new onboarding is migration-first and white-glove: owners provide context and review outcomes; Flowstate handles technical mapping, validation, staging, import, reconciliation, and go-live coordination.
- Migration must be guided, validated, and reviewable; perfect one-click migration must not be promised.

### Hypotheses and unvalidated assumptions

- The ICP and pain language are repository product hypotheses. No interview transcripts, CRM evidence, survey data, signed pilot criteria, usage analytics, or validated buyer quotations were found.
- Muay Thai and Hyrox/HIIT operators may share a class-operations core, but family, progress, events, attendance policies, billing expectations, and migration needs have not been validated as equivalent.
- White-glove migration may reduce switching anxiety, but acceptable owner effort, supported export variants, turnaround, reconciliation tolerance, data-loss tolerance, and willingness to pay remain unknown.
- “Zen Planner replacement” is a product thesis, not verified parity or a safe migration guarantee.

## Gate review of the required workflow matrix

**Status: BLOCKED — file absent.**

The canonical matrix must not be approved unless each material workflow row includes:

- affected actor/persona;
- owner/operator outcome;
- route/action/domain path;
- authorization and tenant boundary;
- state transition and persistence source;
- failure, retry, and recovery behavior;
- current test/runtime evidence;
- one approved status from `VERIFIED COMPLETE`, `IMPLEMENTED BUT UNVERIFIED`, `PARTIAL`, `SCAFFOLDED`, `BROKEN`, `MISSING`, or `UNKNOWN`;
- demo implication, pilot implication, and priority;
- evidence that distinguishes schema foundation from actor-facing implementation.

At minimum, the matrix must include owner authentication/recovery, migration intake, migration import and cutover, rooms/programs, recurring schedule, one-off schedule operations, coach invite/acceptance/substitution, members, guardians/family self-service, public trials, forms, member portal, booking/waitlist, roster/attendance, membership/access products, billing/Stripe, refunds/credits, email, messaging/broadcasts, events/private lessons/progress, reporting, and operational recovery.

### Required matrix classifications

| Workflow                                                 | Required conservative classification                                                  | Buyer/operator implication                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Current isolated migration-first browser path            | `VERIFIED COMPLETE` only for the exact tested path; workflow safety remains `PARTIAL` | Demonstrable, but owner self-activation is not a safe cutover approval model.                                                   |
| Connected operational demo                               | `BROKEN`                                                                              | Do not present the current clean-seed demo as a green end-to-end baseline.                                                      |
| Migration seed readiness                                 | `BROKEN`                                                                              | Demo owner cannot reliably reach daily operations from the committed clean seed.                                                |
| Public trial occurrence/cutoff truth                     | `BROKEN`                                                                              | A prospect can book an already-started class and disappear from the intended roster date.                                       |
| Recurring schedule templates                             | `IMPLEMENTED BUT UNVERIFIED` or scoped tested status                                  | Useful demo foundation; not evidence of day-of exception handling.                                                              |
| One-off cancellation/reschedule/substitute               | `SCAFFOLDED` for persistence and `MISSING` for actor workflow                         | Pilot blocker for real daily operations.                                                                                        |
| Staff invite record management                           | `PARTIAL`                                                                             | Record actions exist; delivery and coach acceptance must not be claimed.                                                        |
| Guardian records/linking                                 | `PARTIAL`                                                                             | Owner record management exists; guardian booking, payment, login, and progress viewing do not.                                  |
| Parent/guardian self-service                             | `MISSING`                                                                             | Public “parent accounts” language exceeds the reachable product.                                                                |
| Member self-service                                      | `IMPLEMENTED BUT UNVERIFIED` at component level; connected demo currently `BROKEN`    | Safe only in a bounded demo after the current red path is repaired.                                                             |
| Forms/signatures                                         | `IMPLEMENTED BUT UNVERIFIED`                                                          | PDF/version/typed-signature records exist; do not call it provider-grade e-sign.                                                |
| Billing state and access products                        | `IMPLEMENTED BUT UNVERIFIED`/`PARTIAL` by subflow                                     | Demonstrate state, not complete financial operations.                                                                           |
| Live/test-mode Stripe fulfillment                        | `PARTIAL`/`UNKNOWN`                                                                   | No live-money or pilot-safe claim.                                                                                              |
| Invoices/receipts, refunds, and credits                  | `PARTIAL` or `SCAFFOLDED` by actor path                                               | Exclude from sales claims or define approved manual controls.                                                                   |
| Launch email                                             | `SCAFFOLDED`/`BROKEN`                                                                 | A queued row is not a received email; retry behavior is not operational.                                                        |
| Password reset                                           | `MISSING`                                                                             | Owner/member lockout remains a pilot support blocker.                                                                           |
| Route loading/error/not-found recovery                   | `MISSING`                                                                             | Demos and operations can fail without product-specific recovery.                                                                |
| Zen Planner-specific adapter/preset                      | `SCAFFOLDED`                                                                          | Enum support is not proof of a supported source-system migration.                                                               |
| Full migration breadth/cutover safety                    | `PARTIAL`                                                                             | Current production import supports only a bounded subset; representative export, rollback/delta, and sign-off proof are absent. |
| Messaging, broadcasts, events, private lessons, progress | `SCAFFOLDED` or `MISSING` by actor path                                               | Schema presence must not become a buyer promise.                                                                                |
| Reporting depth                                          | `PARTIAL`                                                                             | Current operational summaries are not the full approved reporting scope.                                                        |
| Canonical Windows build and clean E2E bootstrap          | `BROKEN`                                                                              | A new checkout cannot reproduce the documented verification path.                                                               |
| Migration/schema index alignment                         | `BROKEN` for drift, despite successful migration replay                               | Indirect buyer impact through release/data-change confidence; not a customer-facing feature.                                    |

## Gate review of the required 18-section audit

**Status: BLOCKED — file absent.**

The finalizer task requires all 18 sections. No section set can be verified because the canonical file does not exist. The audit must incorporate the corrections below rather than copying the synthesis unchanged.

### Material corrections required before finalization

1. **Add the public pricing commitment as an M0 commercial risk.**
   Visible page copy, waitlist copy, submission success copy, and JSON-LD promise 15% off monthly pricing and grandfathering. No matching approval exists. Saying only that pricing is a future Jacky decision is insufficient while the repository already publishes a concrete promise.

2. **Add the migration turnaround promise.**
   The default owner-facing milestone promises an initial migration review within one business day. No staffing model, capacity evidence, SLA decision, or support commitment was found. Remove or explicitly approve it before pilot/customer use.

3. **Correct public family-account positioning.**
   The landing description says parent accounts are operating behind the scenes, while current implementation supports guardian records/linking and tokenized form signing, not a guardian portal, child selection, booking, payment, or progress self-service. The final audit must identify this as an overclaim or narrow it to record support.

4. **Separate ICP evidence from product hypothesis.**
   The target segment is an approved product direction, but customer fit and buyer language have not been validated by external evidence in the repository. The audit must not call the ICP validated or imply proven willingness to switch/pay.

5. **Resolve the migration actor and sign-off model.**
   Product direction says Flowstate handles technical work and the owner confirms launch readiness. Current UI mixes owner status with operator controls; current authorization has no internal operator role. The audit must require an explicit two-party or owner-self-approval decision without inventing a fourth application role.

6. **Do not let browser success erase an unsafe invariant.**
   The migration-first E2E proves the current path executes. It also proves that the newly created owner can complete the handoff. Matrix status must distinguish execution evidence from authorization/readiness correctness.

7. **Keep schema-only foundations out of implementation totals and claims.**
   `ClassInstance`, notifications, messages, announcements, events, private lessons, progress, refunds, and credits need actor-facing paths and appropriate tests before they can be marked implemented.

8. **Reconcile contradictory staff-invite evidence.**
   Any audit language that lists coach invite acceptance as executable conflicts with the accepted record-first decision and current UI. Record creation/resend/revoke is partial; delivery and acceptance are absent/deferred.

9. **Use the freshest QA results for baseline claims.**
   The current evidence is 162 passing Vitest assertions, direct app builds passing, canonical root build failing, all migrations replaying with index-name drift, isolated onboarding E2E passing, and connected demo E2E failing. Historical demo notes must not override this.

10. **State demo and pilot claims separately.**
    A bounded controlled demo is possible after the M0 red paths are repaired. Pilot safety remains blocked by day-of class exceptions, access recovery, communications, Stripe fulfillment, migration/cutover proof, family scope, and production operations evidence.

11. **Reconcile broad approved MVP scope with the recovery baseline.**
    Events, private lessons, progress, messaging, broadcasts, refunds/credits, guardian self-service, reporting depth, one-off schedule operations, and launch email are approved or described in the product ledger but not complete. Jacky must explicitly narrow first-pilot scope or fund the gaps; recovery must not silently redefine approved scope.

12. **Carry unresolved operating decisions into the audit.**
    `ABSENT` versus `NO_SHOW`, make-up handling, end-of-cycle upgrades without automatic proration, coach re-invitation/decline behavior, emergency-contact scope, migration tolerances, and pilot billing/manual controls remain unresolved. They must not be written as accepted behavior.

13. **Treat the public waitlist as non-production until data handling is approved.**
    The current server action appends lead details to a local JSONL file and the visible form has no inspected privacy/retention wording. No production/deployment claim should be made from this implementation; production lead handling requires an approved data, privacy, access, retention, and support path.

## Review of the proposed first five technical work packets

### 1. Enforce public-trial cutoff and occurrence-date truth

**Recommendation: accept.**

- User/business reason: prospects must not book a class that has already started, and staff need trial/member bookings on one consistent occurrence.
- Affected personas: prospect, guardian, owner, coach.
- Risk if deferred: incorrect rosters, capacity confusion, poor first impression, nondeterministic demo failures.
- Required nonblocking clarification: use one shared workspace-local cutoff rule for option generation and submission revalidation; test exact boundary and timezone/date rollover.

### 2. Seed a migration-ready demo workspace deterministically

**Recommendation: accept.**

- User/business reason: the clean demo account must represent either a post-migration operational gym or an intentionally gated gym; docs, seed, and E2E must agree.
- Affected personas: demo operator and owner.
- Risk if deferred: the documented owner login cannot reach the operational demo, undermining buyer confidence.
- Scope note: this is demo reproducibility, not evidence that customer migration is safe.

### 3. Eliminate migration-imported-record index drift

**Recommendation: accept as baseline integrity work, but do not let it outrank or block direct commercial/safety corrections.**

- User/business reason: clean migration replay must match the declared schema so later changes do not hide real drift.
- Affected personas: indirect owner/operator impact through release and data-change confidence.
- Risk if deferred: noisy or misleading migration diffs and reduced confidence in future data changes.
- Sequencing correction: migration handoff authorization does not have a demonstrated business dependency on this physical index-name repair.

### 4. Make Windows build and clean E2E bootstrap reproducible

**Recommendation: accept.**

- User/business reason: the team needs one repeatable path to prove demo and release candidates on the documented host.
- Affected personas: indirect impact to all personas through safer releases and reliable demos.
- Risk if deferred: green claims depend on local artifacts and undocumented workarounds.
- Required proof: supported Node 20/22, pnpm 10.33.0, explicit Prisma generation, canonical build, clean E2E discovery, and direct builds.

### 5. Enforce migration handoff authorization and readiness invariants

**Recommendation: accept, with a blocking product decision on actor/sign-off semantics.**

- User/business reason: an owner should not be able to bypass the white-glove validation/reconciliation process, but the owner must still have a clear review/confirmation role.
- Affected personas: owner and Flowstate migration operator.
- Risk if deferred: false operational readiness, incomplete imports, unclear accountability, and customer trust loss.
- Required correction: do not invent an internal role. Decide whether MVP uses owner self-approval with server-enforced prerequisites, a separate internal operator mechanism outside the three customer-facing roles, or a two-step Flowstate-ready/owner-confirmed handoff.
- Sequencing correction: make this packet independent after the actor decision; do not wait on the demo seed or index-name drift except where a shared integration candidate genuinely requires it.

## Commercial gate missing from the five-packet sequence

The five technical packets may remain the first technical stabilization set only if the recovery plan adds a prior commercial containment gate:

**M0 — Resolve unsupported public commitments and buyer-facing overclaims**

- Decision owner: Jacky for pricing/discount/turnaround commitments; BA/Sales and Localization/Content review; Frontend implementation only after approval.
- Required outcome: approve, revise, or remove the 15%/grandfathering promise consistently across visible page copy, CTA/waitlist copy, submission success copy, and JSON-LD; remove or approve the one-business-day migration review promise; narrow parent-account language to current truth or fund the guardian journey.
- Acceptance: no unapproved price, discount, guarantee, SLA, migration breadth, parent self-service, email-delivery, or production-readiness claim remains in public/customer-facing copy.
- External boundary: no outreach, customer commitment, deployment, pricing choice, or production lead-data use without Jacky's explicit approval.

## Decision consistency review

### Consistent and should be preserved

- Single-location and responsive web-only scope.
- Owner/coach/customer role boundary.
- Migration-first white-glove onboarding.
- Stripe as intended rail with graceful unconfigured demo behavior.
- Member self-service as a required demo proof point.
- Record-first staff invites.
- PDF/version/signature-record forms.
- Conservative evidence vocabulary and release hold.

### Contradicted or underspecified

- “Flowstate handles migration internally” versus owner access to import, reconciliation, stage, and activation controls.
- “Owner confirms launch readiness” versus no separate Flowstate-ready state or operator authorization.
- “Parent accounts” public language versus guardian-record/form-only reachable behavior.
- Approved launch email versus notification foundations without delivery/retry/producer coverage.
- Approved one-off schedule/substitute workflows versus unused `ClassInstance` persistence.
- Approved billing/refund/credit/invoice breadth versus partial or schema-only actor workflows.
- Approved Zen Planner migration path versus CSV-hardcoded upload and no verified preset/representative export.
- Historical green demo/build descriptions versus current clean-seed/E2E/root-build failures.
- Public 15%/grandfathering and one-business-day review promises versus no approved commercial decisions.

## Safe buyer language pending stabilization

- “Flowstate is being built for one-location Muay Thai gyms and class-based HIIT/Hyrox studios that want calmer scheduling, attendance, billing visibility, member self-service, and a guided move from legacy software.”
- “The current controlled demo connects migration-first setup, recurring schedules, member booking, rosters, attendance, forms, and core billing state, subject to the documented recovery blockers.”
- “Migration is designed to be guided, validated, and reviewable rather than one-click.”

## Unsafe buyer language

- “Complete Zen Planner replacement.”
- “Your full history will migrate automatically.”
- “Pilot-ready,” “production-ready,” or “green baseline.”
- “Automated email reminders are live.”
- “Parent accounts are complete.”
- “All billing, refunds, credits, receipts, schedule exceptions, events, private lessons, and reporting are complete.”
- Any price, discount, grandfathering, migration turnaround, uptime, support, data-loss, or go-live guarantee not explicitly approved by Jacky.

## Conditions for BA / Sales PASS

A later review may return `PASS` only when:

1. both canonical files exist;
2. the audit has all required 18 sections;
3. the workflow matrix covers the material actor journeys and uses conservative statuses;
4. public pricing, turnaround, family, migration, and delivery claims are explicitly reconciled;
5. the first-five sequence includes or is preceded by the commercial containment gate;
6. migration actor/sign-off semantics are explicit and compatible with approved roles;
7. current QA failures remain labeled broken until rerun evidence proves otherwise;
8. approved-but-incomplete MVP scope is either ticketed or explicitly narrowed by Jacky for the first pilot;
9. sources, exact paths, tests, and dates are traceable; and
10. no live Stripe, production email, production/customer data, deployment, outreach, or customer commitment is implied or authorized by the audit.

## Evidence / technical details

### Required targets checked

- `docs/PROJECT_RECOVERY_WORKFLOW_MATRIX.md` — absent.
- `docs/PROJECT_RECOVERY_AUDIT.md` — absent.

### Primary project and product sources

- `.hermes.md`
- `README.md`
- `docs/product_decisions_ledger.md`
- `docs/01-decisions/Business Decision Log.md`
- `docs/02-product/Customer And ICP.md`
- `docs/02-product/MVP Scope Brain.md`
- `docs/02-product/initiatives/001-migration-first-onboarding-revamp.md`
- `docs/open-product-questions.md`
- `docs/feature_decision_sheet.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/04-demo/Working Demo State.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/BA Sales.md`

### Recovery evidence reviewed

- `docs/recovery/evidence/orchestrator-synthesis.md`
- `docs/recovery/evidence/ba-sales.md`
- `docs/recovery/evidence/backend.md`
- `docs/recovery/evidence/frontend.md`
- `docs/recovery/evidence/database.md`
- `docs/recovery/evidence/qa.md`
- `docs/recovery/evidence/workflows.md`
- `docs/recovery/evidence/localization.md`
- `docs/recovery/evidence/design.md`
- `docs/recovery/evidence/ux.md`
- `docs/recovery/evidence/ceo-local-verification.md`

### Primary implementation evidence sampled

- `apps/landing-web/app/page.tsx:93-107,149-161`
- `apps/landing-web/app/waitlist-form.tsx:33-45`
- `apps/landing-web/app/actions.ts:36-40`
- `apps/landing-web/lib/content.ts:1-6`
- `apps/landing-web/lib/waitlist.ts:76-85`
- `apps/admin-web/lib/workspace-migration.ts:100-103,2132-2168`
- `apps/admin-web/app/dashboard/migration/actions.ts:116-143`
- `packages/db/prisma/schema.prisma:334-341,387-484`

### Verification boundary

This was a documentation and business-risk review. No production code, schema, migration, seed, pricing, customer record, Stripe resource, email, deployment, external contact, or remote branch was changed. Current command/test claims are taken from the cited dated recovery evidence and are not represented as newly executed by this review.
