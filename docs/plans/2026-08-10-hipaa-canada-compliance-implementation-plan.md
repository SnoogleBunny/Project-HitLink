# Flowstate HIPAA and Canadian Health Privacy Implementation Plan

> **For Hermes:** Implement this plan as scoped work packets in isolated branches/worktrees. Load `subagent-driven-development` before execution. No implementation may begin past Gate 0 without the Phase 0 artifacts and named human approvals.

**Goal:** Determine which health-privacy regimes actually apply to Flowstate, then bring every in-scope creation, read, update, disclosure, export, retention, and deletion path for personal and health-related data under one tested, deny-by-default, auditable, encrypted, jurisdiction-aware control boundary.

**Architecture:** Preserve the existing Next.js/Prisma/PostgreSQL modular monolith. Add explicit privacy policy, data-access, audit, lifecycle, and outbound-flow boundaries inside the monorepo; do not add microservices, an event bus, multi-location behavior, or a public API. Migrate direct Prisma access incrementally by domain behind a fail-closed data-access layer, with each slice independently testable and reversible.

**Tech stack:** Next.js 16, React 19, TypeScript 5.9, Prisma 6, PostgreSQL 16, Vitest, Playwright, pnpm 10.33.0, Turborepo, Stripe. The managed key service, hosting controls, audit store, email provider, monitoring provider, and backup platform are unresolved dependencies and must not be invented by an implementor.

**Status:** Planning artifact only. This document does not assert that Flowstate is currently HIPAA compliant, that Flowstate is a HIPAA Business Associate, that any Canadian health statute applies to a particular customer, or that the directive is legal advice.

---

## 1. Executive outcome and the first blocking decision

Flowstate's current committed product definition is a one-location gym-management platform for Muay Thai and Hyrox/HIIT studios. The compliance directive describes a materially different customer context: physiotherapists, counselors/therapists, life coaches, covered entities, and Health Information Custodians. The repository contains fitness/wellness-adjacent data that can be sensitive—member identity, date of birth, attendance, notes, forms, billing, family relationships, and migration exports—but the code and product docs do not establish that Flowstate currently creates or receives protected clinical records on behalf of a US covered entity or Canadian HIC.

Therefore the shortest safe implementation path begins with an applicability and product-intent gate, not a blanket healthcare rewrite:

1. Jacky/Product confirms whether regulated healthcare customers are an approved target for this product.
2. Qualified US/Canadian privacy counsel determines the customer/entity and data contexts that trigger each regime.
3. Security/operations identify the real hosting, database, backup, logging, monitoring, email, support, and Stripe data locations and agreements.
4. Phase 0 classifies the actual schema and flows, including schema-only/dormant models and free-form migration blobs.
5. Only then may an implementation packet introduce health-specific controls.

Baseline PII security findings discovered in Phase 0 may be prioritized separately, but the directive expressly forbids proceeding to later compliance phases before the data classification report exists.

---

## 2. Sources ingested and precedence

The plan is grounded in the following sources, in this order when they conflict:

1. Current source and tests.
2. `packages/db/prisma/schema.prisma` for implemented database shape.
3. `docs/HIPAA_Canada_Compliance_Agent_Directive.md` for requested compliance scope and acceptance criteria.
4. `README.md` for the current implemented product surface.
5. `docs/product_decisions_ledger.md` for approved product direction.
6. `docs/mvp_ticket_board.md` for roadmap intent.
7. `docs/domain_model.md` and `docs/03-technical/Data Model Brain.md` for domain interpretation.
8. `docs/engineering_rules.md` and `CLAUDE.md` for implementation constraints.
9. `docs/PROJECT_RECOVERY_AUDIT.md` and `docs/PROJECT_RECOVERY_WORKFLOW_MATRIX.md` for known safety and evidence gaps.
10. `docs/04-demo/Working Demo State.md` for historical demo evidence only.
11. `docs/Agents/Agent Operating Model.md`, role briefs, permission matrix, work-packet template, and UI toolkit for execution and review rules.
12. `docs/smoke_test_checklist.md` for current workflow regression coverage.

Important conflicts already identified:

- `README.md` and older domain docs understate migration depth; current Prisma/source contain a substantial migration flow.
- `docs/domain_model.md` labels several domains planned although the Prisma schema now contains their models. Schema presence still does not prove an operational workflow.
- The May demo state predates migration-readiness changes and is historical, not current proof.
- The July recovery audit refers to an older commit and test count; use it as risk context, then reproduce all evidence on the implementation candidate.
- The compliance directive assumes healthcare/health-adjacent customers, while approved product docs target gyms/studios. Human product/legal resolution is mandatory.

---

## 3. Current application baseline

### 3.1 Runtime and boundaries

- `apps/admin-web`: owner/coach Next.js app. Signup, login, onboarding, migration, members, guardians, programs, rooms, schedules, bookings, rosters, attendance, forms, memberships, products, billing, Stripe settings, and the Stripe webhook route.
- `apps/member-web`: customer portal and public trial/signing app. Login, schedule, booking/waitlist, membership, billing, checkout, forms, and magic-link signing.
- `apps/landing-web`: public marketing site and a filesystem-backed JSONL waitlist containing owner name, gym name, email, style, note, and timestamp.
- `apps/api`: health endpoint only. It is not the product's domain API and should not become a public API as a side effect of this program.
- `packages/auth`: password hashing and database-backed cookie sessions.
- `packages/db`: the shared Prisma client plus occurrence, booking/access, forms, migration-adjacent, readiness, and notification helpers.
- `packages/ui`, `packages/types`, `packages/config`: thin shared packages; they do not currently enforce privacy behavior.

Most business behavior uses Next server actions, route handlers, and app-local libraries—not `apps/api`. A compliance design that protects only `apps/api` would miss nearly the entire application.

### 3.2 Database and query surface

- Current schema: 65 models and 48 enums in `packages/db/prisma/schema.prisma`.
- Current migration history contains 16 committed `migration.sql` files. None adds row-level security, field encryption, jurisdiction/consent/retention models, a general audit table, immutable audit permissions, or legal holds.
- A static planning scan found 363 Prisma delegate calls across 39 production files; 299 calls in 36 files are outside `packages/db`. It found no application `$queryRaw`/`$executeRaw` calls. These regex counts are discovery evidence, not the final AST/static-enforcement proof.
- The broadest direct-query hotspot is `apps/admin-web/lib/workspace-migration.ts` (74 calls across many operational and staging models), followed by access products and member memberships (21 each), Stripe billing (16), trial booking (14), forms (13), members/class templates (12 each), and member commerce (10). The implementor must regenerate counts rather than copying these numbers after source changes.
- `packages/db/src/index.ts` publicly exports `prisma`, enabling bypass by any app module.
- Workspace scoping is usually expressed in application query filters. Existing recovery evidence found no comprehensive same-workspace relational enforcement or adversarial PostgreSQL isolation proof.
- Several scalar IDs lack declared Prisma relations, including the payment-method member, failed-case latest payment, migration import job/staging references, participant/sender workspace-user IDs, and creator/operator IDs. These require classification and integrity review rather than assumed referential protection.
- The schema includes dormant/scaffolded domains. Classification must cover them because they can store data even if no UI is complete.

### 3.3 Authentication and authorization

- Session tokens are random and only their SHA-256 hashes are stored.
- Cookies are HTTP-only, `SameSite=Lax`, and secure in production.
- Sessions currently have a fixed seven-day expiry (`SESSION_DURATION_MS`) but no idle timeout, MFA assurance, device/session management, or step-up authentication.
- Admin and member cookies are separate names.
- `proxy.ts` files only check cookie presence; authoritative session/role/workspace checks occur in server helpers.
- Useful role/workspace contexts exist in `apps/admin-web/lib/owner-workspace.ts`, `apps/admin-web/lib/operations-workspace.ts`, and `apps/member-web/lib/member-auth.ts`.
- Authorization is explicit in many routes, but it is not a single deny-by-default policy matrix and is not coupled to every sensitive read/write.
- Owner route resolution currently does not consistently require `Workspace.status === ACTIVE` or migration readiness; coach/member contexts are stricter. The member context selects member status but does not itself terminate portal access for cancelled/frozen members. These are policy decisions and regression-test targets, not assumptions to patch ad hoc.

### 3.4 High-sensitivity paths already present

- Member and guardian identity/contact data, DOB, notes, tags, status, family relationships.
- Attendance state and free-form attendance notes.
- Forms and signed PDFs stored as database bytes; signer snapshots, IP address, and user agent.
- Magic-link signing token in a URL path; current token embeds a request ID plus HMAC.
- Member search in `apps/admin-web/app/dashboard/members/page.tsx` accepts `q` in the query string, which may contain names, emails, or phone numbers.
- Member, form, request, token, and billing identifiers appear in paths. Opaque identifiers are not plaintext PHI, but access-log treatment must be decided and tested.
- Migration intake includes access instructions, raw uploaded CSV content, raw/mapped JSON, issues, and imported IDs. These blobs can contain any source data and must default to the highest expected classification until field-level review proves otherwise.
- Billing and Stripe identifiers/status/failure messages flow to Stripe and local records.
- Stripe payloads currently include member name/email/phone plus internal workspace/member/membership/booking/product IDs in metadata and product/plan/service context. Treat Stripe as a concrete PI/conditional-health-data destination during Phase 0.
- Notification jobs can contain recipient identity and arbitrary body content; there is only a development adapter and no approved production email provider.
- `StaffInvite.token` is stored in plaintext, unlike session and form-link token hashes.
- PDF checks currently cover size, supplied MIME type, `%PDF-` header, and checksum—not malware scanning, sanitization, quarantine, active content, or safe filename/header construction.
- Member checkout return URLs trust forwarded host/protocol headers without a configured-host allowlist.
- Existing owner/migration warnings log identifiers/email or unsanitized domain messages through `console.warn`; there is no shared redaction boundary.
- Landing waitlist PI is appended to local JSONL outside PostgreSQL lifecycle controls.
- Static inspection found no current `localStorage`, `sessionStorage`, IndexedDB, browser analytics SDK, Sentry, Datadog, PostHog, or Segment integration. Preserve that useful absence, but do not treat it as proof about hosting/CDN logs, browser caches, future integrations, or rendered HTML/RSC payloads.

### 3.5 Current outbound and secondary stores

Known from code:

- Stripe API and Stripe webhooks.
- PostgreSQL primary database.
- PostgreSQL/Docker volume in local development.
- Form PDFs and migration raw data stored directly in PostgreSQL.
- Landing waitlist JSONL on the application filesystem.
- Notification outbox records; no approved production delivery service yet.
- Browser-delivered HTML/PDF responses and cookies.
- Playwright traces/reports and test artifacts.
- Client-side migration correction uses a `mailto:` URL, creating an additional browser/email-system disclosure path.

Unknown until infrastructure discovery:

- Hosting/CDN/reverse proxy and request logs.
- Managed PostgreSQL vendor, region, replicas, snapshots, backups, restore copies, and support access.
- Error tracking, APM, analytics, product analytics, session replay, support/chat, and log aggregation.
- Email provider and message routing.
- Object storage, if any exists outside this repository.
- CI/CD logs, preview deployments, artifacts, and secrets management.
- DNS/TLS termination, WAF, rate limiting, incident alerts, and admin access.
- Vendor subcontractors and signed BAA/DPA status.

### 3.6 Preliminary model-level classification hypothesis

This is a planning hypothesis, not the required Phase 0 field-level inventory.

- **Candidate PI-Health / conditional PHI:** `Member`, `Guardian`, `FamilyLink`, `ClassBooking`, `WaitlistEntry`, `AttendanceRecord`, `SignatureRequest`, `SignedDocument`, `FormVersion` contents, `MemberMembership`, `MembershipBillingState`, `BillingRecord`, `Invoice`, `InvoiceLineItem`, `Payment`, `Refund`, `AccountCredit`, `PaymentMethodReference`, `FailedPaymentCase`, `MemberProgressState`, `PromotionRecord`, `ConversationParticipant`, `Message`, `NotificationJob` bodies, `EventBooking`, `PrivateLessonBooking`, and all migration source/staging/reconciliation payloads that can contain these values.
- **PI-General, potentially PHI when combined with health context:** `User`, `WorkspaceUser`, `StaffInvite`, `AuthSession`, `Location`, `WorkspaceMigration`, signer network/device metadata, Stripe identifiers, and landing waitlist submissions.
- **Mostly business/non-personal unless combined with a person:** `Workspace`, `Room`, `Program`, `ClassTemplate`, `ClassInstance`, product catalogs, policy/template definitions, events, and private-lesson slots.
- **Secrets/security data, not normal application PI:** password hashes, session-token hashes, invite tokens, magic-link token hashes, webhook secrets, and encryption key references. These require stronger handling even where they are not PHI.

Classification is contextual. A gym attendance record is not automatically HIPAA PHI; the same structure may become PHI if handled for a covered entity in the required relationship. Do not encode a legal conclusion from a field name alone.

---

## 4. Non-negotiable implementation principles

1. Preserve the modular monolith and one-location MVP.
2. Do not add a fourth customer-facing role. Internal compliance/operator capabilities require an explicit identity and authorization decision.
3. Do not expose a public API as part of this effort.
4. Do not add generic base repositories, factories, an event bus, or a policy DSL. Add concrete boundaries only where repeated sensitive access requires them.
5. Do not store PHI in audit records. Audit metadata identifies the accessed resource but excludes resource payloads and free-form sensitive values.
6. Authorization and jurisdiction ambiguity fail closed.
7. Use synthetic data only in development, test, screenshots, traces, fixtures, and provider sandboxes.
8. Never rewrite applied migration history. Use additive migrations with rehearsed upgrade and rollback/forward-fix plans.
9. No destructive backfill or encryption migration without verified backup/restore and row-count/hash reconciliation.
10. No production key, credential, Stripe resource, customer communication, deployment, or live data action without Jacky's explicit approval.
11. No compliance claim based on vendor marketing. Record actual configuration, regions, controls, and signed agreements.
12. Every behavior-changing work packet leaves one focused regression check and runs the relevant existing gates.
13. UI packets require desktop, tablet, and 390px mobile evidence plus accessibility checks under the approved UI toolkit rules.
14. Legal interpretations, retention periods, breach thresholds, and notice language are approved inputs—not values invented by code.

---

## 5. Target architecture

### 5.1 Request/access context

Introduce one server-only `PrivacyAccessContext` created after authoritative authentication and before a sensitive operation. Minimum fields:

- actor user ID and workspace-user/member identity;
- workspace/tenant ID;
- role and explicit permissions;
- MFA assurance and session ID;
- access purpose/legal-basis code from an approved finite set;
- source IP and user agent captured at the server boundary;
- request/correlation ID;
- record jurisdiction/privacy profile reference.

Do not allow caller-supplied actor, role, tenant, or MFA values. Public trial and magic-link flows use narrowly scoped system/public subjects rather than pretending to be a normal user.

### 5.2 Deny-by-default policy

Use a small concrete policy module keyed by action/resource. Every sensitive repository method must call it. Unknown action/resource/role/regime combinations return denied and emit a denied audit event. Preserve the approved roles (`OWNER`, `COACH`, `CUSTOMER`) and model row-level rules such as assigned-coach and own-member access.

Initial permission matrix must explicitly cover:

- owner versus coach member fields;
- coach roster/attendance fields and assignment scope;
- customer access to own data only;
- guardian access only after the guardian identity model is approved;
- public trial writes with no general reads;
- magic-link access to one request/version only;
- internal migration/compliance operations after an internal-actor decision;
- Stripe webhook operations bound to verified workspace/account mapping.

### 5.3 Sensitive data-access layer

Create concrete domain repositories/functions under `packages/db/src/privacy/` or `packages/db/src/repositories/`; do not create a generic CRUD framework. Each method accepts a trusted access context, enforces policy, performs a tenant-scoped minimal select/write, and emits an audit outcome.

Migration strategy:

1. Inventory each production `prisma` call.
2. Classify its models/fields.
3. Migrate sensitive calls domain by domain.
4. Keep non-personal catalog access direct only if Phase 0 explicitly exempts it.
5. Add static enforcement that blocks direct sensitive-model Prisma access outside allowed package paths.
6. Remove the public `prisma` export from `packages/db/src/index.ts` only after callers are migrated.

### 5.4 Audit store

Use a separate append-only audit store with separate credentials and no application update/delete permission. Keep it inside the monorepo as a package/client, not a microservice. Production deployment must use an approved managed destination and immutable/WORM retention configuration.

Audit event fields:

- event ID, occurred-at, request ID;
- actor type/ID, session ID, workspace ID;
- action, resource type, opaque resource ID;
- purpose/legal-basis code and policy version;
- outcome (`SUCCESS`, `DENIED`, `FAILURE`), reason code;
- encrypted or otherwise approved source IP representation;
- user-agent classification if retained;
- destination ID for disclosures/exports;
- previous-event hash/event integrity metadata if approved;
- no request body, response body, member name, email, notes, PDF content, or free-form error details.

Audit writes for denied/failed attempts must survive application transaction rollback. Audit-store outages must follow an approved fail-closed/fail-safe matrix: sensitive interactive reads/writes should normally fail closed; safety-critical/provider reconciliation paths need an explicit operational decision and alert.

### 5.5 Privacy/jurisdiction configuration

Add a workspace privacy profile without introducing multi-location behavior. Support multiple regimes per workspace and, where legally required, a record/member-level override. Unknown applicability remains `PENDING_LEGAL_REVIEW` and blocks regulated disclosure/export behavior.

Configuration must drive:

- applicable regime keys;
- covered-entity/HIC/service-provider determination status;
- default data origin and member/record override;
- consent model and approved consent text version;
- retention policy version;
- permitted destinations and residency region;
- PIA/transfer assessment approval references;
- incident notification rule references;
- policy effective dates and approver identities.

### 5.6 Encryption

Use provider-managed encryption at rest for all stores/backups and envelope encryption with a managed KMS/HSM for Phase 0-designated highest-sensitivity fields. Store ciphertext, algorithm/version, encrypted data key/key reference, and migration state; never store a plaintext key in `.env`, source, logs, tests, or database rows.

Likely first candidates, subject to Phase 0 approval:

- member/guardian/attendance/promotion free-form notes;
- message and notification bodies containing personal/health content;
- form PDF bytes and signed-document sensitive metadata;
- migration access instructions, raw source content, raw/mapped JSON, and reconciliation payloads.

Use dual-read/dual-write and verified backfill before removing plaintext. Do not encrypt fields needed for equality/search without a separate approved blind-index/tokenization design; first minimize/remove the search requirement.

### 5.7 Lifecycle metadata

Prefer one central `PrivacyRecordLifecycle` table keyed by workspace, resource type, and resource ID over adding repeated policy columns to dozens of domain models. It must track policy version, created/classified date, scheduled review/disposition, legal hold, disposition state, and last decision. Repository writes create/update lifecycle metadata in the same transaction; a reconciliation test/job detects missing metadata. This is acceptable only if Database and legal/security reviewers approve the polymorphic integrity trade-off.

### 5.8 Outbound-flow gateway

All transmissions of PI/PI-Health outside the primary application boundary use one concrete gateway that:

- identifies destination/subprocessor;
- resolves data origin and applicable regimes;
- checks the destination allowlist, BAA/DPA status, and PIA/transfer approval;
- minimizes/redacts payload fields;
- records the disclosure and audit outcome;
- rejects unknown or disallowed flows.

Initial destinations include Stripe and any approved email/monitoring providers. Logging is handled at the logging boundary; it must never become a general-purpose outbound gateway that receives raw sensitive payloads.

### 5.9 Rights and lifecycle workflows

Implement access, correction/amendment, accounting/disclosure, export, offboarding, retention hold, archive, and deletion as auditable state machines—not immediate destructive buttons. Requests require identity verification, scope, deadlines, review, approval/denial reasons, and evidence. Deletion checks retention minimums and legal holds and may result in `RETENTION_BLOCKED` or `ARCHIVED` rather than deletion.

### 5.10 Breach monitoring

Generate security signals from audit metadata, not copied PHI. Start with deterministic rules: repeated denials, cross-workspace guesses, bulk reads/exports, unusual volume, disabled-account access, MFA downgrade, high-risk token use, and disallowed outbound attempts. Route signals into an incident record and approved notification channel. Human legal/privacy review determines reportability and notices.

---

## 6. Decision register: required before dependent code

Create `docs/compliance/legal-open-items.md` and track each item with owner, counsel status, decision date, source, affected tasks, and expiry/review date.

### Product/legal decisions

- Is healthcare an approved Flowstate market, or is this work a conditional future-control architecture?
- For each customer class, is Flowstate a HIPAA Business Associate, Canadian service provider/agent to an HIC, neither, or unresolved?
- Which US states and Canadian provinces are in launch/pilot scope?
- What makes a record's jurisdiction: customer organization, service location, individual residence, treatment location, contractual choice, or a reviewed combination?
- Which fields are PHI/PI-Health in each approved context?
- Which uses/disclosures rely on consent versus another legal basis?
- Approved access/correction/accounting timelines, verification standards, exceptions, and appeal path.
- Approved retention minimum/maximum and legal-hold rules by record type/regime.
- Approved breach risk assessment, escalation, regulator/individual notice responsibilities, and evidence retention.
- Whether current form-signing evidence is legally sufficient.
- Whether opaque IDs and magic-link bearer tokens may appear in access logs, and required log templating/redaction.

### Security/operations decisions

- Production hosting, database, audit store, KMS/HSM, backup, log, monitoring, email, CI, and support vendors and regions.
- BAA/DPA/contract status for Stripe and every actual vendor.
- Canadian/Quebec residency and transfer architecture.
- MFA approach and account recovery policy.
- Idle/absolute session timeouts and step-up duration.
- Audit-store availability behavior and immutable retention.
- Field-encryption algorithm/key rotation/recovery procedure.
- Backup retention, restore testing, deletion propagation, and cryptographic erasure position.
- Approved anomaly thresholds and on-call owners.
- Internal operator/compliance identity model without adding a customer-facing role.

No unresolved item defaults to the least restrictive option.

---

## 7. Phased implementation roadmap

Each work packet follows RED-GREEN-REFACTOR where code changes behavior. Run focused tests first, then affected workspace tests/lint/types/build, then the root gates. Database packets additionally require disposable PostgreSQL fresh-deploy and upgrade-path evidence. Do not commit, merge, deploy, or push unless separately authorized.

### Phase 0 — Discovery, applicability, and classification

**Exit gate:** Reviewed data inventory, flow diagram, applicability matrix, threat/risk analysis, vendor registry baseline, and legal-open-items register exist. Jacky, legal/privacy, Security/Operations, Database, Backend, and QA sign the gate. No later schema/control implementation starts before this gate.

#### Task 0.1 — Freeze the evidence baseline

**Objective:** Record the exact candidate and reproducible current behavior before compliance refactoring.

**Create:**
- `docs/compliance/baseline.md`
- `docs/compliance/evidence/README.md`

**Inspect/run:**
- `git status --short --branch`
- `pnpm db:generate`
- `pnpm db:validate`
- `pnpm run test`
- `pnpm run lint`
- `pnpm run check-types`
- `pnpm run build`
- `pnpm exec playwright test --list`

**Acceptance:** Exact commit/tree state, environment class, command output, current failures, and pre-existing dirty files are recorded without secrets. Historical reports are not substituted for fresh output.

#### Task 0.2 — Generate the complete schema inventory

**Objective:** Enumerate every model and field from the Prisma source of truth with drift detection.

**Create:**
- `scripts/compliance/generate-data-inventory.mjs`
- `docs/compliance/data-inventory.csv`
- `docs/compliance/data-inventory.md`
- `tests/tooling/compliance-data-inventory.test.mjs`

**Modify:**
- `package.json` with a deterministic `compliance:inventory`/check script only if the project approves the script.

**Required columns:** model, field, database table/column, type, nullable, relation, candidate classification, approved classification, sensitivity rationale, encryption state, access roles/actors, write/read paths, destination IDs, retention policy ID, jurisdiction source, lifecycle state, reviewer, review date.

**Acceptance:** All 65 models and every scalar field are represented; relations and enums are accounted for; the check fails if the schema changes without inventory review. Generated output contains no live data.

#### Task 0.3 — Map all data-access paths

**Objective:** Trace every sensitive read/write/delete/export from route/action to Prisma model.

**Create:**
- `docs/compliance/data-access-map.md`
- `docs/compliance/data-access-map.json`
- `scripts/compliance/scan-data-access.mjs`

**Inspect:**
- `packages/db/src/**`
- `packages/auth/src/**`
- `apps/admin-web/app/**`, `apps/admin-web/lib/**`
- `apps/member-web/app/**`, `apps/member-web/lib/**`
- `apps/landing-web/**`
- `apps/api/**`

**Acceptance:** Every production Prisma call and filesystem personal-data write is assigned an owner, input actor, model/fields, tenant filter, authorization check, URL exposure, output destination, and target migration phase. Type-only imports are distinguished from runtime DB access.

The scanner must reproduce or explain drift from the discovery baseline of 39 production files / 363 delegate calls (36 files / 299 calls outside `packages/db`), report the highest-volume files, and prove separately that raw SQL is absent or inventoried. Use an AST-aware implementation for the enforcement gate; the initial regex counts are not sufficient to certify compliance.

#### Task 0.4 — Classify fields and free-form containers

**Objective:** Complete legal/privacy classification with conservative handling of unbounded content.

**High-priority review:**
- `Member.notes`, `Guardian.notes`, `AttendanceRecord.note`, `PromotionRecord.notes`, `Message.body`.
- `FormVersion.fileData`, `SignedDocument.*` signer/network evidence.
- `WorkspaceMigration.accessInstructions`.
- `ImportSourceFile.rawContent`, `StagingRecord.rawData`, `StagingRecord.mappedData`, `ReconciliationReport.summary`.
- Notification/email subject/body and provider errors.
- Stripe failure messages and metadata.
- Landing waitlist `note`.

**Acceptance:** Every scalar field is approved as PHI/PI-Health, PI-General, Non-personal, Secret/Security, or prohibited/unbounded. Context-dependent classifications identify the controlling condition. Unknown free-form containers default high sensitivity.

#### Task 0.5 — Map outbound, cross-border, cache, log, and backup flows

**Objective:** Produce the real deployment data-flow diagram and destination inventory.

**Create:**
- `docs/compliance/data-flow-diagram.md` (Mermaid source plus plain-text table)
- `docs/compliance/destinations.yml`
- `docs/compliance/subprocessors.yml`
- `docs/compliance/backup-and-replica-inventory.md`

**Known starting points:** Stripe, PostgreSQL, filesystem waitlist, notification outbox, browser/PDF responses, CI/test artifacts. Add actual infrastructure only from verified configuration/vendor evidence.

**Acceptance:** Every destination has provider, service, data classes, purpose, origin/destination region, transfer direction, encryption, retention, deletion behavior, support access, BAA/DPA status, and PIA/transfer approval status. Unknown destination/region is blocking, not allowed.

#### Task 0.6 — Determine customer and record jurisdiction inputs

**Objective:** Establish which facts the application can know and which require human/legal input.

**Create:**
- `docs/compliance/jurisdiction-applicability-matrix.md`
- `docs/compliance/legal-open-items.md`

**Inspect:** workspace/location country/region fields, customer contracts/onboarding outside the repo, prospective customer list under authorized access.

**Acceptance:** At least US and Canadian examples are evaluated without inventing conclusions. Multi-regime and unknown cases are explicit. One-location product scope remains unchanged.

The reviewed matrix must explicitly address the directive's named regimes: HIPAA; PIPEDA; Alberta PIPA; British Columbia PIPA; Quebec's private-sector law as modernized by Law 25; Ontario PHIPA; New Brunswick PHIPAA; Nova Scotia PHIA; and Newfoundland and Labrador PHIA. It must also record whether the FTC Health Breach Notification Rule or any approved US state medical-record, breach, or consumer-health law is relevant. Inclusion in the matrix is not a conclusion that a law applies.

#### Task 0.7 — Complete security risk analysis and threat model

**Objective:** Establish administrative, physical/vendor, and technical risks before designing controls.

**Create:**
- `docs/compliance/security-risk-analysis.md`
- `docs/compliance/threat-model.md`
- `docs/compliance/risk-register.md`

**Include:** auth/session takeover, tenant-ID guessing, coach overreach, magic-link leakage, public trial abuse, file upload/malware, migration blobs, Stripe callback trust, backups, logs, CI artifacts, insider/support access, data export, key loss, audit outage, and incident response.

**Acceptance:** Risks have likelihood/impact, existing control, gap, owner, mitigation task, residual risk, and approval. This is reviewed by a qualified security owner; a code agent does not self-certify it.

#### Task 0.8 — Gate 0 review

**Objective:** Prevent implementation from outrunning legal/product facts.

**Reviewers:** Jacky/Product, qualified counsel, Security/Operations, `hitlink-db`, `hitlink-backend`, `hitlink-qa`, BA/Sales, CEO.

**Acceptance:** Inventory and diagrams are complete; legal unknowns are linked to blocked tasks; approved first-pilot jurisdictions and vendors are named; healthcare product intent is recorded; Phase 1 work packets are narrowed to approved scope.

### Phase 1 — Logging, access context, authorization, audit, and data-access boundary

**Exit gate:** A minimal fail-closed jurisdiction/privacy profile exists; sensitive operations in the selected first domain use trusted access context, deny-by-default policy, append-only audit, and the designated data-access layer. Static checks prevent bypass in the migrated domain.

#### Task 1.0 — Establish the minimal jurisdiction prerequisite

**Objective:** Resolve the directive's sequencing defect: consent, transfer, retention, and disclosure policy cannot be enforced before a tenant/record jurisdiction foundation exists.

**Modify:**
- `packages/db/prisma/schema.prisma` plus an additive migration.
- Create the smallest concrete privacy-profile and jurisdiction resolver under `packages/db/src/privacy/`.
- Add focused database and resolver tests.

**Acceptance:** Existing workspaces backfill to `PENDING_LEGAL_REVIEW`, never to an inferred permissive regime. The model supports multiple approved regime keys and a reviewed member/record override without adding locations. Unknown/conflicting context denies regulated operations. Phase 3 later adds the full consent, destination, and transfer policy around this foundation rather than creating a competing model.

#### Task 1.1 — Add safe structured logging

**Objective:** Ensure application logs cannot receive raw sensitive payloads.

**Create:**
- `packages/config/src/safe-log.ts`
- `packages/config/src/safe-log.test.ts`
- `docs/compliance/logging-standard.md`

**Modify:**
- `packages/config/src/index.ts`
- Existing `console.warn` call sites in onboarding/migration.
- Seed/demo scripts if Phase 0 finds PI output.

**Design:** Allowlist event keys and typed metadata; recursively replace prohibited keys/values; reject arbitrary Error/request/form payload serialization. Keep operational error codes, never raw provider/body details.

**Test:** Canary names/emails/phones/notes/tokens/PDF text never appear in captured output; nested objects, arrays, errors, and provider payloads are covered.

#### Task 1.2 — Create trusted privacy access context

**Objective:** Resolve actor, tenant, session assurance, source metadata, purpose, and record privacy context once at server boundaries.

**Create:**
- `packages/auth/src/access-context.ts`
- `packages/auth/src/access-context.test.ts`

**Modify:**
- `packages/auth/src/index.ts`
- Admin/member context helpers.
- Public trial, magic-link, and webhook boundary adapters.

**Acceptance:** Caller form/query values cannot set actor/tenant/role/MFA. Public/system/webhook contexts are narrowly typed. Missing required context fails closed.

#### Task 1.3 — Implement explicit authorization policy

**Objective:** Replace implicit data visibility with a tested action/resource permission matrix.

**Create:**
- `packages/auth/src/privacy-policy.ts`
- `packages/auth/src/privacy-policy.test.ts`
- `docs/compliance/authorization-matrix.md`

**Test matrix:** positive and negative owner/coach/customer/public/system cases, own-versus-other member, assigned-versus-unassigned coach, cross-workspace, inactive user, migration-not-ready, MFA missing, unknown action/resource.

**Acceptance:** Unknowns deny. Policy returns stable reason codes for audit, not sensitive messages. Tests explicitly settle disabled/pre-ready owner access and cancelled/frozen member portal behavior from approved product/legal policy rather than preserving the current inconsistency accidentally.

#### Task 1.4 — Provision append-only audit storage

**Objective:** Store complete access metadata separately from mutable app records.

**Proposed create (final path depends on approved store):**
- `packages/audit-db/package.json`
- `packages/audit-db/prisma/schema.prisma`
- `packages/audit-db/src/client.ts`
- `packages/audit-db/src/write-audit-event.ts`
- `packages/audit-db/src/write-audit-event.test.ts`
- additive SQL enforcing insert-only application permissions
- `docs/compliance/audit-log-standard.md`

**Infrastructure:** add local synthetic-only audit database support; production destination/immutability comes from the approved provider, not Docker configuration.

**Acceptance:** App credential cannot update/delete; required fields are validated; no PHI payload fields exist; tamper/retention configuration is evidenced; denied and failed attempts are persistable independently of the business transaction.

#### Task 1.5 — Add the sensitive-operation wrapper

**Objective:** Make policy check, minimal query/mutation, and success/denied/failure audit one unavoidable flow.

**Create:**
- `packages/db/src/privacy/access.ts`
- `packages/db/src/privacy/access.test.ts`

**Acceptance:** One wrapper records exactly one terminal outcome; denial occurs before query; thrown DB/provider errors are sanitized; audit failure behavior follows approved matrix; resource payload is never passed to audit.

#### Task 1.6 — Migrate the first vertical slice: members/guardians

**Objective:** Prove the architecture on the broadest current personal-data domain before mass migration.

**Create/modify:**
- concrete member/guardian repository functions under `packages/db/src/privacy/` or `packages/db/src/repositories/`.
- `apps/admin-web/lib/members.ts`
- `apps/admin-web/app/dashboard/members/**`
- `apps/admin-web/lib/rosters.ts` only for member field reads.
- member/guardian unit and PostgreSQL integration tests.

**Acceptance:** List/search/create/update/link/detail operations use the sensitive DAL; coach receives only approved fields; cross-workspace IDs deny and audit; member search no longer places names/email/phone in URL query strings; existing member workflows remain functional.

#### Task 1.7 — Migrate remaining sensitive domains

Execute as separate, reviewable packets in this order:

1. Attendance, rosters, booking, waitlist, trial.
2. Forms, PDFs, signatures, magic links.
3. Memberships, billing, Stripe mapping/webhook.
4. Migration intake/files/staging/reconciliation.
5. Messaging/notifications (including schema-only paths before activation).
6. Progress, events, and private lessons (schema-only restrictions if workflows remain deferred).
7. Landing waitlist filesystem PI.
8. Auth/session repositories.

For each packet: enumerate old Prisma calls, write failing policy/audit/isolation tests, add concrete DAL functions, migrate callers, verify no sensitive over-select, run regression gates, and update the data-access map.

#### Task 1.8 — Enforce no direct sensitive Prisma access

**Objective:** Turn the architectural rule into a build-time gate.

**Create:**
- `scripts/compliance/check-sensitive-data-access.mjs`
- `tests/tooling/sensitive-data-access.test.mjs`

**Modify after migration:**
- `packages/db/src/index.ts` to stop exporting raw `prisma` to app code.
- app imports to use approved repository exports.
- `package.json`/CI scripts to run the check.

**Acceptance:** A fixture/direct query against a sensitive model outside allowlisted server-only DAL paths fails. Type-only imports and approved non-personal models are handled explicitly; no broad path wildcard permits bypass.

### Phase 2 — Authentication hardening and session controls

**Exit gate:** Every account that can access classified PI-Health has unique identity, approved MFA assurance, idle and absolute session expiry, secure recovery, session revocation, and negative tests.

#### Task 2.1 — Record session activity and assurance

**Modify:**
- `packages/db/prisma/schema.prisma`
- additive migration
- `packages/auth/src/session.ts`
- `packages/auth/src/session.test.ts`

**Add conceptually:** absolute expiry, idle expiry/last activity, MFA assurance time/method, revoked time/reason, session/device label only if approved.

**Acceptance:** Idle and absolute boundaries are server-enforced; expired/revoked sessions are deleted or denied; rolling activity is throttled to avoid a write on every request; clock-boundary tests pass.

#### Task 2.2 — Implement approved MFA

**Dependency gate:** Select managed IdP or concrete TOTP/WebAuthn approach only after BAA/DPA, recovery, browser, and operations review. Do not invent a provider.

**Affected:** `packages/auth/**`, Prisma schema/migration, admin/member login and account-security UI, protected contexts.

**Acceptance:** Enrollment, challenge, recovery, reset, lockout/rate limit, backup code handling, and admin/support reset authorization are tested. Secrets are encrypted using managed keys. PI-Health policy denies missing/stale assurance.

#### Task 2.3 — Add session management and step-up UI

**Create/modify:** account-security and re-auth routes in admin/member apps under approved paths.

**Acceptance:** Users can view/revoke their sessions without exposing raw tokens; sensitive exports/rights/bulk operations require recent MFA; timeout and re-auth states are accessible and do not lose unsafe form state silently.

#### Task 2.4 — Add recovery and invite/token lifecycle

**Scope:** password recovery, staff invite acceptance, guardian/magic-link token rotation/revocation/rate limits, and single-use semantics. Coordinate with existing unresolved guardian and internal operator decisions.

**Acceptance:** Tokens are random, hashed at rest, short-lived, single-use, purpose-bound, rate-limited, revocable, and never logged. The existing plaintext `StaffInvite.token` is migrated with expand/backfill/contract sequencing. Enumeration-safe responses and adversarial tests pass.

### Phase 3 — Jurisdiction, consent, disclosure, and outbound controls

**Exit gate:** A US-context and a Canadian-context synthetic tenant demonstrate different approved consent/retention/flow behavior; multi-regime and unknown cases fail closed.

#### Task 3.1 — Add privacy profile and policy version models

**Objective:** Extend and stabilize the minimal Task 1.0 profile with counsel-approved policy versioning; do not create a second jurisdiction model.

**Modify:** `packages/db/prisma/schema.prisma` plus additive migration only where Task 1.0's reviewed tracer slice needs expansion.

**Proposed minimal models:** workspace privacy profile, applicable regime entries or validated regime keys, member/record origin override, policy version references, and legal-review state. Avoid duplicating location or adding multi-location support.

**Acceptance:** Multiple regimes can apply; unknown status is explicit; no default to permissive; existing workspaces are backfilled as `PENDING_LEGAL_REVIEW`, not guessed.

#### Task 3.2 — Implement jurisdiction policy resolution

**Create:**
- Extend `packages/db/src/privacy/jurisdiction.ts` from Task 1.0.
- focused unit/property-boundary tests.

**Acceptance:** Workspace default plus approved record override produces a deterministic policy set; conflicting/unknown inputs block restricted operations and create a legal-review item/audit event.

#### Task 3.3 — Add versioned consent/evidence records

**Modify:** schema/migration, privacy DAL, trial/member creation and forms UI only after counsel-approved text/purpose catalog exists.

**Capture:** subject, scope/purpose, legal basis/model, text/version, language, granted/withdrawn times, collector/actor, channel, jurisdiction policy, evidence reference.

**Acceptance:** Consent is not conflated with existing migration acknowledgment or PDF-sign checkbox. Withdrawal affects future uses/disclosures but does not silently erase records subject to retention.

#### Task 3.4 — Create destination and agreement registry enforcement

**Create:**
- `docs/compliance/destinations.yml`
- `docs/compliance/subprocessors.yml`
- JSON schema or small validator under `scripts/compliance/`
- tooling tests.

**Acceptance:** A destination touching classified data cannot be enabled without region, purpose, data classes, agreement status/evidence, retention/deletion, and transfer approval. Do not commit contract documents or confidential vendor terms; store references and approval metadata.

#### Task 3.5 — Implement outbound-flow gateway

**Create:** `packages/db/src/privacy/outbound-flow.ts` or a narrowly named package if provider boundaries require it.

**Migrate:** Stripe payload construction, approved email delivery, exports, monitoring/error payload adapters.

**Acceptance:** Quebec-origin and Canada-US/US-Canada synthetic cases follow approved allowlist/PIA rules; unknown origin/destination denies; every disclosure is auditable; fields are minimized. Stripe metadata is reduced to approved opaque references, and all checkout/return URLs use configured allowed origins rather than untrusted forwarded host values.

#### Task 3.6 — Eliminate sensitive URL/query leakage

**Modify:**
- member search route/form.
- magic-link token design/routes.
- any URL carrying names/emails/phones or provider-sensitive values.
- client-side migration-correction `mailto:` payloads.
- reverse-proxy/access-log configuration once identified.

**Acceptance:** Automated route/network scan finds no classified values in URLs, query strings, Referer headers, redirects, or log captures. Opaque IDs/tokens follow the legal/security decision and access logs store route templates or approved redacted forms.

### Phase 4 — Encryption, storage, backups, and data migration

**Exit gate:** Approved high-sensitivity fields and all stores/backups are encrypted with tested key operations; plaintext backfill is reconciled and removed; restore/rollback evidence exists.

#### Task 4.1 — Verify managed encryption at rest and TLS

**Create:** `docs/compliance/encryption-and-transport-evidence.md`.

**Verify:** database, audit store, backups/snapshots, replicas, filesystem/object storage, CI artifacts, provider transport, internal connections, certificate/TLS policy, and administrative channels.

**Acceptance:** Evidence is configuration/API output from the real provider with secrets redacted. Local Docker is explicitly non-production. Unknowns block release.

#### Task 4.2 — Implement KMS envelope encryption

**Create after provider selection:** a small server-only encryption module with encrypt/decrypt/rewrap, key-version metadata, authenticated encryption, and strict plaintext buffer disposal where practical.

**Acceptance:** Managed key calls are mocked for unit tests and exercised in an authorized non-production provider environment. Tampering, wrong context/tenant, disabled key, rotation, and outage cases are tested. No application-embedded master key exists.

#### Task 4.3 — Encrypt one highest-sensitivity field slice

Start with a low-query, high-sensitivity field selected in Phase 0 (for example notes or migration access instructions), not all fields at once.

**Steps:** additive ciphertext columns/model, dual-write, read-old/read-new compatibility, synthetic backfill, row/hash reconciliation, switch reads, stop plaintext writes, verified backup, remove plaintext in a later migration.

**Acceptance:** Raw database/storage inspection finds canary plaintext nowhere in primary, logs, audit, backup sample, or artifacts. Rollback/forward-fix behavior is rehearsed.

#### Task 4.4 — Continue field encryption by domain

Separate packets for notes/messages, forms/PDFs, migration blobs, notification bodies, and any counsel-approved identifiers. Each repeats Task 4.3; no bulk one-shot migration.

The forms/PDF packet also defines an approved quarantine and malware/active-content scanning path, safe filename/header construction, and failure handling. A `%PDF-` prefix and checksum remain useful validation/integrity checks but are not security scanning or encryption.

#### Task 4.5 — Move unmanaged filesystem PI

**Scope:** `apps/landing-web/lib/waitlist.ts` and deployment storage.

**Acceptance:** Either remove waitlist persistence if no longer needed (preferred) or move it to an approved encrypted/lifecycle-managed store with consent, abuse controls, access policy, and retention. No ephemeral production filesystem is treated as a durable compliant store.

#### Task 4.6 — Backup/restore and deletion propagation

**Create:** backup/restore runbook and synthetic rehearsal evidence.

**Acceptance:** Backup encryption, access, region, retention, legal hold, restore isolation, deletion/expiry behavior, key-loss recovery, and audit logging are proven. A restored copy cannot bypass current policy unnoticed.

### Phase 5 — Retention, legal hold, deletion, and offboarding

**Exit gate:** Every classified record has lifecycle metadata or a documented exemption; jobs enforce approved policy with dry-run, hold, audit, reconciliation, and rollback controls.

#### Task 5.1 — Add versioned retention policy catalog

**Create:**
- `docs/compliance/retention-policy-catalog.yml`
- validator and tooling test.

**Acceptance:** Policies are keyed by regime and record type, with minimum, maximum, trigger, action, legal basis/source, approver, effective date, and review date. Unknown values block scheduling.

#### Task 5.2 — Add lifecycle/hold/disposition schema

**Modify:** Prisma schema/migration and privacy DAL.

**Acceptance:** Every new classified record gets lifecycle metadata transactionally; legal hold blocks disposition; duplicate metadata is constrained; a reconciliation query detects missing/orphaned metadata.

#### Task 5.3 — Implement dry-run lifecycle planner

**Create:** server-only lifecycle module and synthetic tests.

**Acceptance:** Planner returns retain/archive/delete/blocked/review without mutating; rules handle multiple regimes by applying the most restrictive approved requirement; unknown policy returns review/blocked.

The planner and integration tests must enumerate existing Prisma cascade paths from workspace/member deletion. No direct `delete`/cascade may bypass hold, export, retention review, disposition audit, or backup policy.

#### Task 5.4 — Implement automated disposition worker

Use a platform-scheduled command/job inside the monolith, not a new service. Deployment scheduler remains provider-specific.

**Acceptance:** Claim/idempotency, batch limits, retries, hold race, audit, archive verification, delete transaction, and failure recovery are tested. First production mode is report-only until approved.

#### Task 5.5 — Build tenant offboarding workflow

**Acceptance:** Offboarding inventories data, freezes new writes as approved, exports through the outbound gateway, applies holds/retention, schedules disposition, handles backups, and records approvals. Workspace closure never cascades blindly through regulated records.

### Phase 6 — Individual rights and disclosure accounting

**Exit gate:** Authenticated, identity-verified, auditable access/correction/accounting requests complete end to end with approved timelines and exceptions.

#### Task 6.1 — Add rights-request state machine

**Modify:** schema/migration and privacy DAL.

**Request types:** access, correction/amendment, disclosure accounting, export, and deletion/restriction only where approved. Include identity verification, scope, status, due date, assignee/internal actor, decision reason code, delivery destination, completion evidence, and appeal/review.

**Acceptance:** Invalid transitions are constrained; request payloads are classified/encrypted; no automatic legal decision.

#### Task 6.2 — Build member-facing request routes/UI

**Create:** authenticated member privacy center in `apps/member-web`; route handlers/server actions remain internal product surfaces.

**Acceptance:** Customer sees own requests/data only; recent MFA/identity verification is required where approved; accessible loading/error/empty/success states and desktop/tablet/mobile evidence exist.

#### Task 6.3 — Build owner/compliance review routes/UI

**Dependency:** internal reviewer/processor identity must be approved. Do not make a gym owner the platform privacy officer by default.

**Acceptance:** Scoped queues, least-privilege data, approved denial/correction flows, deadlines, and immutable audit are present. Free-form legal reasoning is not exposed to logs.

#### Task 6.4 — Generate access/export packages

**Acceptance:** Export is assembled from the DAL, minimized to approved scope, encrypted in transit/at rest, time-limited, delivered through an approved destination, checksum/retrieval audited, and automatically expired. Synthetic tests cover cross-workspace and omitted-data failures.

#### Task 6.5 — Accounting of disclosures

**Acceptance:** Approved disclosures derive from immutable audit/outbound records, exclude internal accesses where law/policy says so, are human-readable, and do not reveal another person's data. Legal rules remain versioned inputs.

### Phase 7 — Frontend privacy controls

**Exit gate:** Browser storage, telemetry, third-party scripts, rendering, caching, downloads, and session UX are verified not to expose classified values.

#### Task 7.1 — Add frontend no-storage/no-telemetry guard tests

**Create:** Playwright privacy audit using synthetic canaries.

**Inspect:** localStorage, sessionStorage, IndexedDB, Cache API, service workers, cookies, console, network, Referer, error payloads, traces, screenshots, and downloaded filenames.

**Acceptance:** Canaries exist only in intended authenticated responses/rendering; no third-party request receives them; test artifacts are securely handled and synthetic.

#### Task 7.2 — Minimize server-to-client field projections

**Modify:** sensitive pages/components and DAL selects by domain.

**Acceptance:** Components receive only fields they render; coach/member projections differ; hidden CSS/conditional rendering is not used as authorization; React serialization/RSC payload inspection confirms minimization.

#### Task 7.3 — Add timeout and re-auth UX

**Acceptance:** Server remains authoritative; client warning is advisory; expired sessions cannot continue with stale cached content; sensitive screen content is cleared on logout/expiry as feasible; accessibility and recovery are tested.

#### Task 7.4 — Harden PDF/download behavior

**Modify:** owner/member/magic-link document routes.

**Acceptance:** `Cache-Control: no-store` or counsel/security-approved equivalent, safe content disposition/filename, anti-sniffing/CSP/frame policy, authorization/audit on each access, token expiry/single-use behavior, and access-log redaction are tested.

#### Task 7.5 — Consent and rights UX content

**Dependency:** Counsel-approved language and Localization/UX review.

**Acceptance:** Correct version/regime/language shown; user can review purpose/consequences; no pre-checked consent; evidence is recorded; withdrawal/request paths are discoverable; 390px/tablet/desktop and keyboard/screen-reader checks pass.

### Phase 8 — Breach detection, incident response, and recurring controls

**Exit gate:** Deterministic detection feeds a tested incident workflow; human reportability decisions, notification clocks, evidence, and recurring review ownership are documented and rehearsed.

#### Task 8.1 — Create security-signal rules

**Create:** audit-metadata detector module and tests.

**Signals:** repeated denied/cross-workspace access, bulk reads/exports, disabled-user attempts, unusual actor/time/geo where lawful, token abuse, outbound deny, audit integrity failure, KMS failure, and provider reconciliation anomalies.

**Acceptance:** Thresholds/config are approved and versioned; no PHI is copied into signals; false-positive handling and suppression expiry are documented.

#### Task 8.2 — Add incident state and response trigger

**Acceptance:** Incident records capture signal references, severity, owner, containment, evidence preservation, jurisdiction assessment, counsel/privacy review, notice deadlines, decisions, and closure. The system never auto-declares a legally reportable breach.

#### Task 8.3 — Build incident runbooks and tabletop tests

**Create:**
- `docs/compliance/runbooks/incident-response.md`
- `docs/compliance/runbooks/breach-assessment.md`
- `docs/compliance/runbooks/key-compromise.md`
- `docs/compliance/runbooks/audit-outage.md`

**Acceptance:** Synthetic scenarios cover US, Canada, Ontario/Quebec where in scope, cross-border, vendor breach, lost export, and insider access. Roles, clocks, evidence, and communication approval are explicit.

#### Task 8.4 — Add recurring review process

Use the approved project scheduler/issue system; do not rely solely on application cron. Minimum annual security risk analysis and data-inventory review, plus schema/integration drift checks on each change.

**Acceptance:** Named owner, due dates, escalation, completion evidence, and missed-review handling exist. Build checks fail when a new sensitive model/integration lacks inventory/registry review.

### Phase 9 — Release, migration, and assurance

**Exit gate:** Synthetic staging, security review, provider evidence, restore rehearsal, legal review, and all directive acceptance criteria are met for a narrowly named jurisdiction/customer cohort. Compliance claims remain scoped to that cohort/configuration.

#### Task 9.1 — Synthetic fixture and environment isolation

**Acceptance:** Synthetic data generator covers every classified field and edge case; production exports cannot be imported into non-production; environment credentials/databases/buckets/keys are isolated; screenshots/traces cannot contain real data.

#### Task 9.2 — Migration rehearsal

For every schema/encryption/lifecycle change: backup, fresh deploy, upgrade deploy, backfill dry run, backfill, reconciliation, application compatibility, rollback/forward fix, restore sample, and performance/batch evidence on synthetic scale.

#### Task 9.3 — Full verification matrix

Run and retain real output for:

- `pnpm db:generate`
- `pnpm db:validate`
- `pnpm run test`
- `pnpm run lint`
- `pnpm run check-types`
- `pnpm run build`
- compliance inventory/access/subprocessor validators
- PostgreSQL fresh and upgrade migration tests
- authorization matrix and cross-workspace adversarial tests
- audit completeness tests
- log/telemetry canary tests
- MFA/session tests
- encryption raw-storage/backup tests
- retention/hold/disposition tests
- cross-border/PIA gating tests
- rights request E2E
- frontend storage/network/console audit
- existing connected Flowstate E2E and smoke checklist

#### Task 9.4 — Independent reviews

Required at minimum: Backend, Database, Frontend/UX/Design/Localization for affected UI/copy, QA, Security/Operations, BA/Sales, qualified privacy counsel, and CEO/Jacky. Provider penetration/security assessment scope is a human decision.

#### Task 9.5 — Controlled rollout

Start with no regulated production data. Then an approved synthetic staging environment, then a specifically approved pilot cohort with named jurisdictions and vendors. Use feature/config gates that fail closed for unresolved privacy profiles. Document rollback, support, incident owner, and on-call coverage before enabling.

---

## 8. Model inventory coverage checklist

Phase 0 must cover every model below, including schema-only/dormant models:

`User`, `Workspace`, `WorkspaceMigration`, `Location`, `Room`, `Program`, `WorkspaceUser`, `ClassTemplate`, `Member`, `Guardian`, `FamilyLink`, `ClassBooking`, `AttendanceRecord`, `ClassInstance`, `MembershipPlan`, `MembershipPlanProgramRestriction`, `PunchCardProduct`, `PunchCardProductProgramRestriction`, `MemberPunchCard`, `DropInProduct`, `DropInProductProgramRestriction`, `WaitlistEntry`, `FormDocument`, `FormVersion`, `RequiredFormAssignment`, `SignatureRequest`, `SignedDocument`, `MemberMembership`, `WorkspaceStripeSettings`, `MembershipBillingState`, `BillingRecord`, `Invoice`, `InvoiceLineItem`, `Payment`, `Refund`, `AccountCredit`, `CreditRule`, `BillingPolicy`, `PaymentMethodReference`, `FailedPaymentCase`, `StripeWebhookEvent`, `ImportJob`, `ImportSourceFile`, `ImportFieldMapping`, `StagingRecord`, `ValidationIssue`, `ReconciliationReport`, `MigrationImportedRecord`, `ProgressModuleSetting`, `BeltDefinition`, `MemberProgressState`, `PromotionRecord`, `ConversationThread`, `ConversationParticipant`, `Message`, `Announcement`, `NotificationJob`, `EmailTemplate`, `Event`, `EventBooking`, `PrivateLessonSlot`, `PrivateLessonBooking`, `AuthSession`, `StaffInvite`, and `WorkspaceSetting`.

Also inventory non-Prisma stores and artifacts:

- landing waitlist JSONL;
- environment/config secrets and URLs;
- cookies and browser caches/storage;
- form/PDF responses and downloads;
- request/access/proxy/CDN logs;
- application/error/APM/analytics/support payloads;
- Stripe objects/webhooks/metadata;
- email bodies and provider records;
- CI logs, build artifacts, Playwright traces/screenshots/reports;
- database replicas, snapshots, backups, restored copies;
- local Docker volumes and developer machines;
- audit and incident stores introduced by this plan.

---

## 9. Directive acceptance-criteria traceability

| Directive criterion | Primary tasks | Release evidence |
|---|---|---|
| Complete field inventory | 0.2–0.4 | Schema drift check + reviewed inventory |
| No sensitive query outside DAL | 1.6–1.8 | Static gate + repository integration tests |
| Immutable audit for every sensitive request | 1.2–1.7 | Audit completeness matrix + DB permission proof |
| Deny-by-default authorization | 1.3, 1.6–1.7 | Role/resource positive and negative tests |
| MFA and session timeout | 2.1–2.4 | Idle/absolute/MFA/recovery E2E |
| No sensitive logs/telemetry/URLs | 1.1, 3.6, 7.1 | Canary scanning of logs/network/browser |
| Encryption at rest and field-level | 4.1–4.4 | Provider config + raw storage/backup inspection |
| Retention metadata and jobs | 5.1–5.4 | Lifecycle reconciliation + disposition tests |
| Rights endpoints/workflows | 6.1–6.5 | Authenticated E2E + audit proof |
| Tenant jurisdiction changes behavior | 3.1–3.3 | US/Canada/multi-regime/unknown fixtures |
| Cross-border/Quebec controls | 3.4–3.5 | Destination allowlist/PIA deny tests |
| Subprocessor BAA/DPA registry | 0.5, 3.4 | Build validator + human agreement review |
| Frontend exclusion | 7.1–7.5 | Browser storage/network/console audit |
| Versioned safeguards docs | all phases | `docs/compliance/**` review manifest |
| Legal unknowns explicitly tracked | 0.6, Gate 0, all phases | Open-items register with blocking links |

---

## 10. Test architecture

### Unit tests

- Policy decisions, context construction, redaction, jurisdiction resolution, retention planning, encryption envelope/tamper behavior, token lifecycle, disclosure decisions, and incident thresholds.

### PostgreSQL integration tests

- Tenant isolation and guessed-ID/swap attacks.
- Repository + lifecycle atomicity.
- Business transaction versus independent audit outcome.
- Append-only audit permissions.
- Migration fresh/upgrade/backfill/constraint behavior.
- Retention claim/hold/delete races.
- Stripe/event idempotency with audit writes.

Use `TEST_DATABASE_URL` and a separate synthetic audit-test URL. Tests must fail—not silently skip—in the dedicated compliance CI job when prerequisites are absent.

### Route/action integration tests

For every sensitive route/action: unauthenticated, wrong role, wrong workspace, wrong member, missing MFA, unknown jurisdiction, allowed case, denied audit, success audit, sanitized failure audit, and minimal response projection.

### Playwright privacy tests

Use unique synthetic canaries in each data category. Inspect page content, browser storage, cookies, console, requests, responses, redirects, Referer, downloads, and artifacts. Cover admin owner, assigned/unassigned coach, member own/other, public trial, magic-link signing, rights request, timeout, and export.

### Infrastructure/manual evidence

TLS scan, managed encryption configuration, KMS policy/rotation, database/audit credentials, immutable retention, backup/restore, destination regions, BAA/DPA registry review, PIA references, incident tabletop, and human legal review cannot be replaced by unit tests.

---

## 11. Work-packet and review routing

Every implementation packet must state:

- goal and human outcome;
- allowed and forbidden paths;
- exact source-of-truth docs and approved legal/policy inputs;
- data classes/models/fields affected;
- actor/authorization/jurisdiction impact;
- migration/backfill/rollback and audit behavior;
- synthetic fixture requirements;
- focused RED/GREEN evidence and full regression commands;
- infrastructure/provider assumptions;
- required reviewers and release blocker status;
- no deploy/push/live credentials/production data/customer contact boundaries.

Routing:

- Prisma/migration/retention/encryption metadata: `hitlink-db` + Backend + QA + CEO.
- Auth/policy/DAL/audit/outbound/rights: `hitlink-backend` + Database + Security/Legal + QA.
- User-visible privacy/MFA/consent/rights UI: Frontend + UX + Design/Localization as material + QA + BA/Sales + CEO.
- Gym workflow visibility changes: Gym Workflow review.
- Legal text, classification, retention, breach, agreement status: qualified human legal/privacy review; no AI approval substitute.

---

## 12. Rollback and failure policy

- Phase 0 is documentation-only and reversible by normal document review.
- DAL migrations retain old implementations only behind test-only or short-lived compatibility paths; no permanent bypass flag.
- New policy defaults deny for unknown; rollback must not re-enable broad access silently.
- Audit schema/store changes are additive. Never delete audit history to roll back application code.
- Encryption uses expand/migrate/contract. A rollback can read old/new during the compatibility window; once plaintext is removed, rollback is a forward fix or restore under approved incident procedure.
- Retention workers start report-only, then archive-only where approved, then deletion only after restore rehearsal and sign-off.
- Outbound destinations start disabled and are enabled per tenant/policy after agreement/transfer approval.
- MFA rollout requires enrollment/recovery support and staged enforcement; emergency bypass is time-limited, named, audited, and human-approved.
- Rights and incident deadlines remain operational obligations even if a deployment is rolled back; runbooks must cover manual continuity.

---

## 13. Definition of done

This roadmap is complete only when:

1. Gate 0 legal/product/applicability decisions are recorded.
2. Every schema field and non-database store is inventoried and reviewed.
3. Every classified operation routes through the approved DAL/policy/audit boundary with static bypass prevention.
4. Unique identity, MFA, session timeout, recovery, and revocation are proven.
5. Highest-sensitivity data and all stores/backups are encrypted with managed keys and tested restoration.
6. Jurisdiction, consent, destination, retention, and legal-hold policy changes behavior and fails closed on unknowns.
7. Access/correction/accounting requests and offboarding complete end to end.
8. Browser/log/telemetry/URL canaries show no unintended disclosure.
9. Breach detection and incident runbooks are rehearsed without auto-making legal conclusions.
10. BAA/DPA/PIA and legal-open-item reviews are complete for the exact pilot vendors/jurisdictions.
11. Existing Flowstate workflows and full quality gates pass on the exact candidate.
12. Qualified human reviewers approve the exact deployment configuration and narrowly scoped compliance claims.

---

## 14. Immediate next handoff

Do not begin with repository refactors or encryption. Hand the next AI implementor only **Phase 0, Tasks 0.1–0.3** in an isolated documentation/tooling worktree. Their deliverable is a generated field inventory and code-grounded data-access map—not a compliance claim and not production code. Then route Tasks 0.4–0.8 to human legal/privacy/security review before authorizing Phase 1.

Ponytail boundary: this plan deliberately skips microservices, a public API, a policy DSL, a generic CRUD repository framework, multi-location jurisdiction modeling, speculative analytics, and provider selection. Add any of them only when an approved requirement cannot be met by the concrete modular-monolith boundaries above.
