# Flowstate Pro Clinical Platform Implementation Plan

> **For Hermes:** Execute this plan as gated work packets in isolated branches/worktrees. Load `subagent-driven-development` before implementation. Use synthetic data only. Do not deploy, use production credentials, contact customers, select legal values or vendors, or make compliance claims without the named human approvals.

**Goal:** Build Flowstate Pro as a separately operated, white-label clinical-record product for approved Virginia healthcare organizations first and approved British Columbia private clinics second, while leaving Flowstate Standard technically, commercially, and operationally separate.

**Architecture:** Add new Pro provider web, patient web, and dedicated workflow API applications to the existing monorepo, backed by a separate Pro Prisma schema and isolated US and Canadian GCP data planes. Keep Pro a Cloud Run modular monolith with central policy, tenant-scoped repositories, PostgreSQL row-level security, append-only audit, transactional outbox, controlled file storage, and fail-closed activation; share with Standard only reviewed data-free UI/configuration primitives and pure utilities.

**Tech stack:** Existing monorepo tooling (Next.js 16, React 19, TypeScript 5.9, Prisma 6, PostgreSQL, Vitest, Playwright, pnpm 10.33.0, Turborepo) plus approved GCP services: Cloud Run, regional external load balancing, Cloud Armor, Cloud SQL for PostgreSQL with HA/PITR/DR, Cloud Storage, Cloud KMS/CMEK, Secret Manager, Cloud Build, Artifact Registry, Artifact Analysis, and regional logging/immutable exports. Patient CIAM, email, malware scanning, eligibility, and all later clinical integration vendors remain blocked selections.

**Status:** APPROVED PLANNING BASELINE. Product and architecture decisions Q1–Q206 are approved; supporting specifications, legal values, vendor agreements, operating evidence, production activation, and public claims remain separately gated. This plan is not legal advice, certification, an executed agreement, or proof that Flowstate currently operates a compliant service.

**Detailed implementation authority:** This file controls implementation sequence and work-packet gates. It cannot override an approved decision or invent a legal, vendor, policy, production, or commercial value.

---

## 1. Goals, scope, and success condition

### 1.1 In scope

- A new Flowstate Pro product, not a healthcare mode inside Standard.
- One Pro codebase deployed into independent Pro-US and Pro-Canada data planes.
- Distinct provider web, patient web, and dedicated workflow API surfaces.
- White-label configuration validated from a controlled registry.
- Virginia-first activation for individually approved customer/applicability profiles.
- British Columbia private-clinic activation as a separately reviewed fast follow.
- Full production separation: projects, deployments, databases, storage, backups, keys, logs, monitoring, secrets, vendors, access groups, credentials, sessions, CI/CD promotion, billing configuration, and production access.
- Pro-US v1's minimum safe clinical journey: organization activation, identities, patient/proxy access, scheduling, intake/consent/forms, longitudinal chart, finalized notes and amendments, controlled clinical files, medication/allergy/history, direct pay, eligibility, released-record sharing, rights workflows, retention/holds/offboarding, audit/incidents, and US operations.
- A versioned control dossier that distinguishes specification, implementation, technical verification, operational exercise, evidence completeness, legal review, profile approval, blockers, supersession, and non-applicability.

### 1.2 Explicit exclusions

- No Standard-to-Pro migration or in-place Standard upgrade.
- No shared identity, credentials, MFA, recovery, sessions, records, database, Stripe objects, webhook secrets, keys, logs, backups, or runtime configuration between products.
- No reuse of Standard roles in Pro.
- No routine Flowstate staff access to patient data and no Flowstate clinical break-glass.
- No self-service regulated tenant activation.
- No universal activation for every healthcare customer type, province, payer, public body, insurer, or government contractor.
- No GKE, global active-active database, HSM, microservices, or event bus unless a measured requirement later defeats the approved simpler architecture.
- No DICOM files in the ordinary upload pipeline; DICOM/PACS is a later separately gated integration.
- No rebuilding PACS, LIS, pharmacy, clearinghouse, payer, or telehealth network cores.
- No hard-coded universal pilot caps. Each activated customer receives an approved operating envelope based on seats, patient records, documents, storage, support, and tested capacity.
- No hard-coded legal deadlines, retention periods, consent language, breach thresholds, public claims, pricing, service levels, credits, or insurance terms.
- No production PHI in development, tests, previews, screenshots, traces, demos, or vendor sandboxes.
- No confidential contracts, legal advice, personnel files, incident evidence, or production secrets in Git; store only templates, metadata, approval state, and protected evidence references.

### 1.3 Program success condition

The program is not complete when code compiles. It is complete for one named customer profile only when the exact Pro build and exact regional configuration are technically verified, operationally exercised, supported by complete evidence, legally reviewed, approved for that profile, and passed through the final pre-production gates in section 15. Other profiles and modules remain disabled.

---

## 2. Source precedence and conflict handling

When sources disagree, stop the affected packet, record the conflict in the decision register, and obtain the required owner. Never silently select the easiest source.

1. Approved entries in `docs/compliance/flowstate-pro/decision-register-and-open-items.md` for product decisions.
2. Qualified-counsel-approved entries in `docs/compliance/flowstate-pro/legal-applicability-matrix.md` and approved policy catalogs for legal values.
3. Current code and `packages/db/prisma/schema.prisma` for claims about implemented Flowstate Standard.
4. `docs/compliance/flowstate-pro/product-requirements-document.md` for specified required behavior.
5. `docs/compliance/flowstate-pro/system-design.md` and `docs/compliance/flowstate-pro/security-privacy-architecture.md` for specified implementation detail.
6. `docs/compliance/flowstate-pro/roadmap.md` and this plan for sequence.
7. `docs/compliance/flowstate-pro/competitor-parity-matrix.md` for dated benchmark evidence only.
8. `docs/HIPAA_Canada_Compliance_Agent_Directive.md` for execution protocol and acceptance themes; it cannot override approved Pro decisions or assert applicability.

The Flowstate Pro dossier paths named in this plan exist and carry their own explicit status. A document marked `SPECIFIED` is a planning contract only; documents awaiting WP0.3 reconciliation retain their current draft/planning status. None is implementation, operating, legal, production, or profile-approval evidence unless its own status and named approvals say so.

---

## 3. Current Flowstate Standard baseline

This section preserves useful current-state evidence so implementers do not retrofit Standard or mistake roadmap models for Pro foundations. Re-run discovery on the implementation candidate; these facts are not future-state acceptance evidence.

### 3.1 Verified repository facts

- Standard is a one-location, web-only gym-management modular monolith for Muay Thai and Hyrox/HIIT studios.
- Standard customer roles are `OWNER`, `COACH`, and `CUSTOMER`.
- Current applications are `apps/admin-web`, `apps/member-web`, `apps/landing-web`, and a thin `apps/api` whose current domain surface is only a health endpoint.
- Current shared packages include `packages/auth`, `packages/db`, `packages/ui`, `packages/types`, and `packages/config`.
- `packages/db/prisma/schema.prisma` currently defines 65 models and 48 enums, with 16 committed Prisma migration SQL files.
- The current schema is Standard-only. It has no Pro clinical aggregate model, Pro role model, Pro organization activation model, Pro policy registry, PostgreSQL RLS policy, general security audit model, legal-hold registry, or Pro residency boundary.
- Standard already implements or represents auth/session, workspace onboarding, staff invites, programs, rooms, scheduling, bookings, rosters, attendance, members/guardians, forms/signing, memberships, punch cards/drop-ins, Stripe billing, failed payments, member portal, and migration staging/recovery models.
- Several Standard roadmap documents lag the Prisma schema. Schema presence still does not prove an operational workflow.

### 3.2 Preserved audited discovery evidence to regenerate

The prior plan recorded a static snapshot of 363 Prisma delegate calls across 39 production files, including 299 calls in 36 files outside `packages/db`, with no application raw-SQL calls found. It also identified Standard sensitivity hotspots: member/guardian identity and notes, attendance, database-stored PDFs, signing evidence, migration raw data, Stripe metadata, notification bodies, plaintext staff invite tokens, URL/query exposure, forwarded-host return URLs, console logging, and a filesystem waitlist.

This is useful Standard risk evidence, not a Pro implementation template. Milestone 0 must regenerate any count used in a dossier. Standard remediation, if approved, is a separate scoped program and must not delay or weaken Pro separation.

### 3.3 Standard boundary rules for every Pro packet

- Do not modify Standard schema to host Pro records.
- Do not point Pro code at `packages/db` or Standard `DATABASE_URL`.
- Do not import Standard authentication or role/session records.
- Do not route Pro billing through Standard Stripe configuration.
- Do not add Pro conditionals to Standard pages, routes, server actions, middleware, jobs, or webhooks.
- Shared code must be data-free and reviewed before import. Default to copying a tiny pure primitive into Pro when review cost or coupling exceeds the duplication cost.
- Add static boundary tests before any clinical feature work so accidental Standard/Pro imports fail in CI.

---

## 4. Target Flowstate Pro architecture

### 4.1 Product applications

The following paths are **PROPOSED — FUTURE**; exact names may be changed once in Milestone 1, then frozen in the architecture record:

- `apps/pro-provider-web/` — organization administration and workforce clinical workflows.
- `apps/pro-patient-web/` — invitation-only patient and guardian/proxy self-service.
- `apps/pro-api/` — dedicated REST workflow API and modular-monolith backend.
- `packages/pro-db/` — separate Prisma client, schema, migrations, tenant repositories, RLS transaction context, and outbox persistence.
- `apps/pro-api/src/modules/auth/` — Pro-only identity/session/MFA/step-up adapters and authorization context.
- `apps/pro-api/src/modules/policy/` — versioned profile, purpose, authority, access, consent, retention, hold, destination, and activation resolution.
- `apps/pro-api/src/modules/audit/` — PHI-free security audit event contract and regional append-only writer.
- `apps/pro-api/src/modules/files/` — controlled Cloud Storage metadata, upload, quarantine, scan, release, immutable versions, and amendment linkage.
- `apps/pro-api/src/modules/integrations/` — destination gateway and separately enabled provider adapters.
- `tests/pro/fixtures/` — synthetic-only tenant/profile/clinical fixtures and canaries.
- `infra/pro/` — provider-approved IaC, project/environment manifests, regional topology, policy tests, and read-back verification. The IaC tool is an owner decision; do not scaffold one before approval.

Provider and patient web applications may call only the dedicated Pro API. They may not import Prisma, vendor SDKs, KMS internals, policy internals, or direct storage clients. The API owns orchestration; concrete domain modules remain in one deployable modular monolith until measured scale or isolation requirements justify a split.

The following packet ownership paths are also **PROPOSED — FUTURE**. Keep each module in `apps/pro-api` unless a second real server consumer proves a package is necessary:

| Work | API implementation | API test | Provider route | Patient route |
|---|---|---|---|---|
| Activation | `apps/pro-api/src/modules/activation/index.ts` | `apps/pro-api/src/modules/activation/index.test.ts` | `apps/pro-provider-web/app/(public)/apply/page.tsx` | Not applicable |
| Patients/proxies | `apps/pro-api/src/modules/patients/index.ts` | `apps/pro-api/src/modules/patients/index.test.ts` | `apps/pro-provider-web/app/(protected)/patients/page.tsx` | `apps/pro-patient-web/app/(protected)/profile/page.tsx` |
| Scheduling/intake | `apps/pro-api/src/modules/encounters/index.ts` | `apps/pro-api/src/modules/encounters/index.test.ts` | `apps/pro-provider-web/app/(protected)/schedule/page.tsx` | `apps/pro-patient-web/app/(protected)/appointments/page.tsx` |
| Chart/notes | `apps/pro-api/src/modules/chart/index.ts` | `apps/pro-api/src/modules/chart/index.test.ts` | `apps/pro-provider-web/app/(protected)/patients/[patientId]/chart/page.tsx` | `apps/pro-patient-web/app/(protected)/records/page.tsx` |
| Files | `apps/pro-api/src/modules/files/index.ts` | `apps/pro-api/src/modules/files/index.test.ts` | `apps/pro-provider-web/app/(protected)/patients/[patientId]/files/page.tsx` | `apps/pro-patient-web/app/(protected)/records/files/page.tsx` |
| Billing/eligibility | `apps/pro-api/src/modules/billing/index.ts` | `apps/pro-api/src/modules/billing/index.test.ts` | `apps/pro-provider-web/app/(protected)/billing/page.tsx` | `apps/pro-patient-web/app/(protected)/billing/page.tsx` |
| Rights/lifecycle | `apps/pro-api/src/modules/rights/index.ts` | `apps/pro-api/src/modules/rights/index.test.ts` | `apps/pro-provider-web/app/(protected)/privacy/requests/page.tsx` | `apps/pro-patient-web/app/(protected)/privacy/page.tsx` |
| Incidents | `apps/pro-api/src/modules/incidents/index.ts` | `apps/pro-api/src/modules/incidents/index.test.ts` | `apps/pro-provider-web/app/(protected)/security/incidents/page.tsx` | Not applicable |

These are ownership anchors, not permission to scaffold every file in Milestone 1. Create a path only when its packet begins with a failing test.

### 4.2 Identity, tenancy, and authorization

- Pro roles are `ORGANIZATION_ADMIN`, `PROVIDER`, `CLINICAL_SUPPORT`, `ADMINISTRATIVE_STAFF`, `BILLING_STAFF`, `PRIVACY_OFFICER`, `PATIENT`, and `GUARDIAN_OR_PROXY`.
- The same email may exist in Standard and Pro only as unrelated identities.
- Organization admins are manually verified. Workforce and patient accounts are invitation-controlled.
- Workforce and patients require approved MFA. Workforce clinical actions and high-risk patient identity/security changes use step-up.
- Initial security-owned ceilings are workforce idle/absolute 15 minutes/12 hours, patient 30 minutes/24 hours, and privileged step-up 5 minutes; the security-owned configuration is versioned and bounded so tenants cannot weaken it.
- Flowstate workforce uses managed Cloud Identity, device controls, and just-in-time privileged access. No routine patient-data access is granted.
- Tenant-clinician break-glass is narrow, time-limited, MFA-protected, justified, audited, notified, and reviewed. It does not grant Flowstate staff clinical access.
- Every request enters with trusted actor, tenant, patient/record scope, session assurance, purpose, operation ID, correlation ID, and approved profile context. Caller-supplied tenant, role, purpose, or assurance is rejected.
- Authorization denies unknown roles, actions, resources, profiles, relationships, authority, or assurance.

### 4.3 Database and regulated aggregate rules

- Pro uses its own PostgreSQL database and Prisma schema.
- Default tenancy is a shared regional database with mandatory tenant IDs, composite tenant integrity, PostgreSQL RLS, trusted transaction context, tenant repositories, and adversarial cross-tenant tests.
- Dedicated tenant projects/databases are separately priced and approved profiles, not the default architecture.
- Regulated aggregate roots carry lifecycle and policy references.
- Central versioned policy, legal-hold, and lifecycle-event registries govern disposition.
- No uncontrolled destructive cascades cross regulated aggregate roots.
- Draft clinical content may be edited. Finalized records are immutable; corrections are linked amendments or late entries with author, time, reason, prior version, signatures, and audit.
- Patient-reported information remains distinct from clinician-verified information.
- High-risk operations use durable intent and outcome records, idempotency keys, optimistic concurrency/version checks, and a transactional outbox.
- Audit outage fails closed for regulated operations except a separately approved, time-bound emergency mode with reconciliation and review.

### 4.4 Policy and lifecycle

Policy resolution uses verified organization status, customer type, service location, patient residence where legally relevant, record origin, care relationship, payer/public-body involvement, contract, destination, and approved overrides. Tenant admins cannot author legal rules.

Distinct versioned records represent:

- consent;
- HIPAA authorization;
- acknowledgement;
- contract acceptance;
- non-consent legal authority;
- representative/proxy authority;
- retention policy;
- legal hold;
- disclosure;
- rights request and fulfilment;
- tenant responsibility matrix;
- activation and profile approval.

Unknown policy blocks the dependent use, disclosure, export, destruction, or activation and creates a review item. Withdrawal is prospective and does not erase lawful history. Backups expire and reconcile truthfully; the product does not promise immediate mutation of immutable backup media.

### 4.5 Files and encryption

- File bodies live in governed regional Cloud Storage, never PostgreSQL blobs.
- PostgreSQL stores metadata, hashes, classification, provenance, patient/encounter linkage, immutable version lineage, quarantine/scan state, lifecycle, and storage references.
- File types are allowlisted; uploads enter quarantine, are scanned by an approved service, and fail closed before release.
- DICOM is rejected from the ordinary pipeline until the separate PACS/DICOM profile is approved.
- Cloud SQL, Storage, backups, audit exports, and supported services use provider encryption plus approved CMEK boundaries.
- Highest-risk values use envelope encryption with tenant/record-bound authenticated context and key-version metadata where the approved threat model requires it.
- No plaintext key, secret, token, or production identifier enters source, logs, tests, fixtures, screenshots, or database metadata.

### 4.6 Audit, disclosure, and incidents

Security audit events are append-only, regionally retained, request/operation-correlated, and contain no PHI payload or free-form clinical text. Record actor, tenant, action, opaque resource reference, purpose/authority reference, policy version, time, outcome/reason code, assurance, destination reference, and integrity metadata.

Disclosure accounting is a distinct legally scoped record derived from approved disclosure events; it is not the raw security audit. Automated signals can open incidents, but Legal/Privacy makes reportability and notice decisions. Preserve distinct discovery, containment, assessment, and notice clocks plus minimal chain-of-custody evidence.

### 4.7 White-label configuration

Use a validated registry for branding, origins, languages, enabled modules, profile approvals, operating envelope, support contacts, and integration destinations. Branding cannot change security headers, identity boundaries, policy behavior, approved legal text, audit, retention, or tenant isolation. Each brand has explicit allowed origins and browser/session boundaries.

---

## 5. GCP US and Canada topology

### 5.1 Pro-US data plane

- Primary region: `us-east4`.
- Manual whole-region DR region: `us-east1`.
- Separate workload project(s) and recovery/archive project(s).
- Regional Cloud Run services for provider web, patient web, and API.
- Regional external load balancer and Cloud Armor.
- Cloud SQL PostgreSQL HA, PITR, regional backups, and approved cross-region DR replication/recovery design.
- Regional Cloud Storage for clinical files and quarantine, with separate immutable backup/audit destinations after retention policy approval.
- Regional KMS/CMEK, Secret Manager, logs, metrics, and audit export.
- Artifact Registry and Cloud Build promotion isolated from Canada and Standard.

### 5.2 Pro-Canada data plane

- Primary region: `northamerica-northeast2` (Toronto).
- Manual whole-region DR region: `northamerica-northeast1` (Montréal).
- Separate workload project(s) and recovery/archive project(s) from Pro-US and Standard.
- The same service pattern as Pro-US, deployed from the same reviewed Pro source but with Canada-specific configuration, resources, credentials, keys, logs, and vendors.
- Do not claim BC-only hosting: GCP has no Vancouver region in the approved topology.
- Canadian target boundary includes configurable application data, files, database, backups, keys, and logs. Identity control plane, CI control plane, support access, vendor subprocessors, and any US transfer remain explicit transfer-review items.

### 5.3 Topology invariants

- No cross-plane database connection, bucket replication, log sink, key access, secret access, support credential, session, queue, or fallback exists unless a named transfer profile is approved and tested.
- DNS/origins, service accounts, workload identity, IAM groups, KMS keys, secrets, billing, monitoring, and promotion approvals are plane-specific.
- DR activation is manual, documented, rehearsed, and region-contained. Failover never silently moves US data to Canada or Canadian data to the US.
- Logs, metrics, traces, alerts, and build outputs are PHI-free by design and canary-tested.
- Non-production projects contain synthetic data only and cannot reach production data resources.

---

## 6. Execution protocol for every work packet

Each packet must declare:

1. Objective and patient/customer safety outcome.
2. Approved decision IDs and dossier sources.
3. Allowed and forbidden paths.
4. **PROPOSED — FUTURE** paths versus existing paths.
5. Data classes, aggregate roots, actors, regions, and profiles affected.
6. Human/legal/vendor dependencies and explicit blocker state.
7. Failing test or verification added first.
8. Minimal implementation needed to pass it; no speculative module or abstraction.
9. Migration, backfill, idempotency, concurrency, failure, audit, and rollback behavior.
10. Synthetic fixtures and evidence destinations.
11. Focused test commands, affected workspace gates, and full candidate gates.
12. Required code, database, security, privacy/legal, product, UX/accessibility, operations, and independent review.
13. Dossier artifacts/status transitions updated after verification.
14. Confirmation that no production deployment, credential, live data, customer contact, contract decision, vendor selection, or public claim is included.

Use RED-GREEN-REFACTOR for behavior. Database packets must prove fresh install and upgrade from the prior released Pro schema against disposable PostgreSQL. Infrastructure packets must test policy before apply and read back the real non-production configuration after apply. A green unit suite cannot replace restore, failover, incident, access-review, or legal evidence.

---

## 7. Milestone 0 — Complete and approve the Pro specification dossier

**Entry:** Binding README and Q1–Q206 register exist.

**Exit gate G0:** The complete supporting dossier exists, conflicts are resolved, legal/vendor unknowns are represented as blockers, and Product, Security/Privacy, Database, Backend, Operations, QA, and the executive risk owner approve implementation scope. Counsel approves only legal values within its remit. No production resources or clinical code are authorized by G0.

### WP0.1 — Freeze evidence and boundaries

**Packet status:** `TECHNICALLY_VERIFIED` on 2026-09-22; specialist and owner review remains required.

**Exact candidate:** `d4f2098b4940cae61b9f36345cb480bda33d990d` on `hermes/pro-wp0-1-baseline` in `/Users/alvinlo/Desktop/Project-HitLink-wp0-1`.

**Artifacts:**

- `docs/compliance/flowstate-pro/current-standard-baseline.md`
- `docs/compliance/flowstate-pro/evidence/README.md`
- `docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/`
- mandatory decision, control/evidence, data-flow, plan, and work-packet updates

**Acceptance evidence:**

- [x] Commit, branch/worktree, initial dirty state, redacted remote, Node, pnpm/Corepack, Git, and platform recorded.
- [x] Regenerated 65 Prisma models, 48 enums, and 16 committed migration SQL files.
- [x] Regenerated 363 production delegate calls across 39 files and 299 calls across 36 files outside `packages/db`, with explicit exclusions and limitations.
- [x] Searched tracked code for Prisma raw-SQL APIs; found 0 call sites under the documented rules.
- [x] Documented Standard applications, packages, route/action/API boundaries, sessions/auth, direct database access, files, Stripe/webhooks, notification helper, logs, browser/URL risks, and filesystem storage with exact paths.
- [x] Separated `IMPLEMENTED`, `SCHEMA_ONLY`, `HISTORICAL`, and `UNKNOWN`; no Pro model/control is described as implemented.
- [x] Ran every required root command exactly. All returned exit 127 because `pnpm` was unavailable on `PATH`; `node_modules` was absent. Results remain `BLOCKED`, not passed.
- [x] Added redacted evidence artifacts and updated all four mandatory dossier/plan artifacts.
- [x] Documentation/content checks and `git diff --check` completed; final allowed-path status is recorded in the WP0.1 handoff.

**Deviations/limitations:** no dependency installation, Corepack shim, database, `.env`, production credential, customer/demo payload, vendor console, deployment, or external system was used. The blocked root gates must be rerun on an exact candidate with declared prerequisites before any later release claim.

**Review/gate:** Database, Backend, Security/Privacy, QA/Assurance, and CEO/Product owner review remain required. Gate G0 remains `BLOCKED`; WP0.1 does not authorize Pro implementation.

**Next authorized packet:** WP0.2.

### WP0.2 — Author the product and architecture specifications

**Packet status:** `COMPLETED` on 2026-09-22 after technical verification and explicit project-owner acceptance for all five required WP0.2 review roles; Gate G0 remains `BLOCKED`.

**Changed files:**

- `docs/compliance/flowstate-pro/product-spec.md`
- `docs/compliance/flowstate-pro/product-requirements-document.md`
- `docs/compliance/flowstate-pro/roadmap.md`
- `docs/compliance/flowstate-pro/system-design.md`
- `docs/compliance/flowstate-pro/security-privacy-architecture.md`
- `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- `docs/compliance/flowstate-pro/work-packets/WP0.2-author-product-and-architecture-specifications.md`

**Acceptance checklist:**

- [x] Reconciled product identity, target lanes/profiles, roles/surfaces, Pro-US v1 journey, deferred scope, patient release, commercial/offboarding boundaries, parity semantics, exclusions, decision sources, and blockers.
- [x] Preserved all 44 `FR-*` and 20 `NFR-*` IDs; every requirement has scope, decision source, owner/approving role, requirement, concrete acceptance evidence, failure/rollback behavior, and blocked dependencies where applicable. The completed semantic audit documents an exact 50-requirement blocker set, including FR-029 release-policy/authority/revocation/expiry inputs and FR-031 legally/emergency-required access, custody, and offboarding inputs; exact-set validation detects drift but does not substitute for the audit.
- [x] Specified the minimal modular-monolith/API/repository/RLS, identity/authority, clinical-integrity, outbox/job, audit, file, destination, activation, regional, failure, and rollback contracts. `LEASED` can CAS to `BLOCKED` after execution-time reauthorization; provider submission requires current unexpired lease ownership; recovery persists lease expiry before reconciliation/retry and rejects stale-owner submission.
- [x] Reconciled trust boundaries, identity classes, data-bearing crossings, deny-by-default policy, support/break-glass, logging/audit, encryption/files, lifecycle/cross-border, threat, fail-closed, evidence, and non-claim behavior.
- [x] Mapped roadmap M0–M9 to implementation-plan packets and G0–G4 without reordering packets or converting blocked inputs into defaults.
- [x] Reconciled stale dossier-as-future/only-two-files claims and DRAFT-versus-SPECIFIED references without changing product decisions; validation is repository-relative and durable in the WP0.2 packet.
- [x] Required deterministic requirement, cross-document/link, status-vocabulary, secret/regulated-data, complete-diff, and root `git diff --check` checks passed on 2026-09-22. The root status still includes nine inherited WP0.1 paths that this packet did not edit and cannot remove without violating scope; results are recorded in the WP0.2 work packet.
- [x] Product owner/CEO review accepted by explicit project-owner authorization on 2026-09-22.
- [x] Architecture/Backend review accepted by explicit project-owner authorization on 2026-09-22.
- [x] Database review accepted by explicit project-owner authorization on 2026-09-22.
- [x] Security/Privacy review accepted by explicit project-owner authorization on 2026-09-22.
- [x] Operations/QA-Assurance review accepted by explicit project-owner authorization on 2026-09-22.

**Unresolved blockers:** exact first customer/profile classifications; counsel-owned legal/policy values; patient CIAM; production vendors/configurations and agreements; BC excluded-lane applicability; pricing/packaging/envelopes/support/SLA/claims/insurance; and named accountable humans, counsel, assessor, and executive approvals.

**Review/gate:** WP0.2 cannot self-approve. Gate G0 remains `BLOCKED`; no Milestone 1 application, schema, infrastructure, vendor, PHI-capable, or production work is authorized.

**Next authorized packet:** WP0.3. Counsel-owned values remain blocked in WP0.3/G0; this approval does not authorize G0 or implementation.

### WP0.3 — Author legal, data, control, and operations specifications

**Packet status:** `COMPLETED` on 2026-09-23. Specification review is `PASS`; independent technical quality/security/evidence review is `APPROVED`; explicit project-owner acceptance is recorded for all six required WP0.3 review functions. WP0.4 is authorized but not started. G0 remains `BLOCKED`; WP1.x is unauthorized.

**Current WP0.3 path state:** all eight allowed WP0.3 paths are changed in the current checkout: `docs/compliance/flowstate-pro/legal-applicability-matrix.md`, `docs/compliance/flowstate-pro/data-classification-and-flows.md`, `docs/compliance/flowstate-pro/control-and-evidence-matrix.md`, `docs/compliance/flowstate-pro/operations-and-governance.md`, `docs/compliance/flowstate-pro/competitor-parity-matrix.md`, `docs/compliance/flowstate-pro/decision-register-and-open-items.md`, `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`, and `docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md`. The worktree also contains the inherited WP0.1/WP0.2 paths and hashes encoded by the WP0.3 validator; they are not WP0.3 edits and must remain byte-identical.

**Independent specification review outcome:** `PASS`

**Independent specification review date:** `2026-09-23`

**Independent specification review candidate:** `WP0.3-MUTABLE-MANIFEST-V1` — base commit `d4f2098b4940cae61b9f36345cb480bda33d990d` plus the exact eight-path SHA-256 manifest recorded in the WP0.3 packet

**Independent quality review outcome:** `APPROVED`

**Independent quality review date:** `2026-09-23`

**Independent quality review candidate:** `WP0.3-MUTABLE-MANIFEST-V1`

**Acceptance checklist:**

- [x] WP0.3 packet exists with the eight-path scope, exact `LEG-*`, control, `MAP-*`, blocker, review, gate, and validator contracts.
- [x] Decision register records the five exact blockers `WP03-B01`–`WP03-B05` with category, `BLOCKED` status, owner, dependency/evidence, affected profiles/controls, and next review.
- [x] Decision register records the five document roles, all 11 exact `MAP-*` IDs, stable treatment of all 35 control IDs, known contradictions, required reviews, G0 `BLOCKED`, and WP1.x unauthorized.
- [x] Legal candidate preserves `LEG-01`–`LEG-11` as counsel-owned inputs with `COUNSEL_REVIEW_REQUIRED`; no legal approval is claimed.
- [x] Data candidate preserves `D0`–`D9` and `DX` and adds the minimum decision-input, destination, protected-evidence, and fail-closed contracts without claiming implementation.
- [x] Reconciled `control-and-evidence-matrix.md` to the exact 11-column control table, all 35 stable control rows, all 11 canonical `MAP-*` rows, substantive evidence/exercise/cadence/gate fields, and top-level status/release metadata.
- [x] Reconciled `operations-and-governance.md` for accountable functions, named-human blockers, access/screening/training/sanctions, incident/vendor/risk/assessment/insurance procedures, exercises, protected evidence, cadence, G0, and WP1.x metadata without claiming staffing or completion.
- [x] Reconciled `competitor-parity-matrix.md` for dated benchmark-only treatment, control/profile boundaries, G0, and WP1.x metadata without refreshing sources or creating procurement, legal, compliance, production, or release authority.
- [x] Hardened the shared semantic scanner so inline code is not a blanket exemption and negation applies only to the matched claim's immediate grammar. Mutation fixture: `G0 approved.`; mutation fixture: `G0 PASS`; mutation fixture: `G0 is authorized.`; mutation fixture: `WP1.x authorized.`; mutation fixture: `Flowstate Pro is HIPAA-compliant`; mutation fixture: `Flowstate Pro is production-ready`. Clearly labelled quoted/example fixtures and legitimate negative/boundary statements remain allowed.
- [x] Embedded validator passed on 2026-09-23 with exact output recorded in the WP0.3 packet, including mutable-manifest/self-hash verification, explicit review records, accountable-function coverage, legal-`DRAFT` semantics, hardened claim/status mutations, inherited hashes, exact scope, and `git diff --check`.
- [x] Separate `git diff --check` returned exit 0 with no output; exact status contained the eight WP0.3 paths plus 13 byte-identical inherited paths; inherited hashes matched; relative links passed in the validator; and the complete eight-path diff was reviewed.
- [x] Independent specification review returned `PASS` on 2026-09-23 for the exact manifested candidate.
- [x] Independent technical quality/security/evidence review returned `APPROVED` on 2026-09-23 with no critical, important, or minor issues. Evidence: embedded validator exit 0; 11 legal decisions, 35 controls, 11 mappings, five blockers; exact transcripts; perfect-tense open 12/12 rejected; declared regressions 148/148 rejected, 48/48 allowed, independent matrix 34/34; perfect-tense matrix 72 rejected/0 bypasses and 72 allowed/0 false positives; bounded present/past/perfect/optional-now matrix 144 rejected/0 bypasses and 192 allowed/0 false positives; stale-identity expected failure, exact restore, and post-restore pass; mutable 8/8, inherited 13/13, exact scope 21 including untracked, and `git diff --check` exit 0. The packet canonical self-hash before recording approval was `99e9b81acfd376dcf1857d31b78450a79a19010029b4eab3e7bea3dd45c3f2a6`; the manifest is regenerated after this record.
- [x] Human acceptance is recorded on 2026-09-23 by explicit project-owner authorization for all six required WP0.3 review functions: Product; Architecture; Database; Security/Privacy; Operations/QA; and legal/counsel. The acceptance applies to the exact pre-recording `WP0.3-MUTABLE-MANIFEST-V1` candidate with packet canonical self-hash `9bf74694d580ff123fca2033ecaa0bf1d25fa26c0839a7399766c61178c6d04a`. It accepts the specification within those functions' WP0.3 remit only; every counsel-owned value remains `COUNSEL_REVIEW_REQUIRED`, and vendor, customer/profile, named-human, evidence, exercise, assessor, commercial, compliance, and production blockers remain unresolved.
- [x] WP0.3 is complete after validator success, specification `PASS`, quality `APPROVED`, required human acceptance, and explicit project-owner authorization. WP0.4 is authorized as the next packet but was not started.

**Blockers:** `WP03-B01` first customer/profile and entity facts; `WP03-B02` counsel-owned legal/policy values; `WP03-B03` vendors/configurations/agreements/regions/support/transfers; `WP03-B04` commercial/claims/insurance/operating-envelope/production inputs; `WP03-B05` named accountable humans/protected evidence/exercises/assessor/coverage. All remain `BLOCKED` under the owners and evidence requirements in the decision register.

**Review/gate:** Independent specification review is `PASS`, independent technical quality/security/evidence review is `APPROVED`, and required project-owner human acceptance is recorded for Product, Architecture, Database, Security/Privacy, Operations/QA, and legal/counsel. WP0.3 is complete. WP0.4 is authorized but not started. G0 remains `BLOCKED`; WP1.x is unauthorized.

**Next packet:** `AUTHORIZED — NOT STARTED`. WP0.4 may begin only as a separate reviewed task. This authorization does not approve G0, WP1.x, production use, compliance status, a customer/profile, a vendor, or a counsel-owned value.

### WP0.4 — Establish change control and dossier validators

**Packet status (2026-11-19):** `IMPLEMENTED — INDEPENDENT REVIEWS AND HUMAN ACCEPTANCE PENDING` on `feat/flowstate-pro-implementation` at base `5b1b84b103a0cea9a521d5857c0b49fdeb710473`. The external handoff pins the exact current scope and verification inputs. G0 remains `BLOCKED`; WP1.x is unauthorized.

**Exact WP0.4 paths:**

- `docs/compliance/flowstate-pro/schemas/change-control-record.schema.json`
- `docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json`
- `docs/compliance/flowstate-pro/dossier-manifest.json`
- `docs/compliance/flowstate-pro/change-control-register.json`
- `scripts/pro-compliance/validate-dossier.mjs`
- `tests/tooling/pro-compliance-dossier.test.mjs`
- `package.json`
- `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
- this implementation plan
- `docs/compliance/flowstate-pro/work-packets/WP0.4-establish-change-control-and-dossier-validators.md`

**Historical implementation evidence and current gate checklist:**

- [x] Two dependency-free JSON contracts, one deterministic manifest, one append-only register, one Node standard-library validator, and one focused Node test file were implemented.
- [x] Recovery rerun found the preserved partial candidate already green at 12/12 tests and `VALIDATION_PASSED documents=18 records=1 files=22`; historical pre-rate-limit RED output was unavailable and was not fabricated.
- [x] New behavior-first probes failed before repair for invalid profile vocabulary and governed-JSON symlink escape (`13 pass, 2 fail`), then for alphabetic bearer tokens and `client_secret` assignments (`14 pass, 1 fail`).
- [x] The first independent specification review returned `FAIL` on 2026-09-23 with eight findings; the first through ninth exact-candidate re-reviews returned `FAIL` on the previously recorded gaps; the tenth exact-candidate re-review returned `FAIL` with four Important gaps and one Minor gap; and the eleventh through nineteenth exact-candidate re-reviews returned `FAIL` on 2026-09-24 with the recorded H1, reference-destination, and record-state gaps. The nineteenth review reported one Important finding: angle destinations accepted ASCII whitespace, C0 controls, and DEL, while bare destinations accepted a dangling final escape, allowing malformed definitions to suppress real Setext H1s. The bounded shared-destination remediation was implemented without broadening scope. The twentieth exact-candidate specification re-review returned `FAIL` on 2026-09-24 solely because this packet-status headline still reported the eighteenth failure remediated and nineteenth review pending. That governed-record inconsistency is remediated across the implementation plan, decision register, and WP0.4 work packet; the twenty-first exact-candidate specification re-review remains pending and no `PASS` or approval is claimed.
- [x] Final focused test passes 51/51; an independent counted production-path harness passes all 51 tests with 1,697 validator executions. The independent 250-case status corpus and 261-case extension remain green. H1 verification passes the prior 15, 13, 19, 27, 11, 20, 24, 41, 8, 109, 15, and 115-case matrices plus the fresh destination-character corpus 38/38 after reproducing exactly eight pre-fix failures. One shared bounded recognizer rejects ASCII whitespace, C0 controls, DEL, and unmatched/nested angle syntax inside angle destinations; bare destinations require balanced parentheses, bounded nesting, and no dangling final escape before any continuation state is entered. The transition matrix passes 225/225; diagnostic/trust/error/nondisclosure checks pass; reference-path controls pass 6/6; complete schema-leaf mutation coverage, including `$schema`/`$id`, remains green. Separate angle-character and dangling-escape mutations fail in exactly six and two cases, then restore validator bytes identically at SHA-256 `a6ae890e267b4216498194df90456c1e49febe6b83c9cb248614ddfdd5be1b2a`; counted-harness instrumentation restores the test file identically at SHA-256 `7653ab2082f465f5129cd97e6f09f5fd204a7a7133e0e49794aab2a9199fbedb`.
- [x] Incomplete and unknown metadata, duplicate IDs/paths, invalid and symlink-escaped paths, all 15 canonical declared statuses with matching and contradictory manifest values, lowercase/mixed-case and ASCII/NBSP/zero-width value variants, declarations after line 14, same-status duplicates, cross-syntax conflicts, malformed declaration-like lines including all sixth- and seventh-review families, bounded current approved-prose forms and contradictions, exact heading/bold declaration controls, ordinary bold `Status quo`, `Status indicators:`, and `Status page:` labels, ordinary `## Status indicators` and `## Status history` headings, ordinary status prose, an H1 title merely containing status, ignored inline/code-fenced examples, the inherited evidence README with no declaration, manifest status validation despite declaration absence, invalid vocabulary/date/timestamp, illegal transitions, missing profile-approval prerequisites, missing/placeholder named approval, fabricated-person owners/review functions, non-accountable approval roles, empty superseded text, secret-bearing invalid IDs without disclosure, missing/escaped references and intermediate/final symlinks across every governed reference field, readable-but-invalid schemas, every contract-bearing leaf in both schemas, secret/contract payloads, malformed JSON, missing files, invalid UTF-8, CLI misuse, deterministic diagnostics, safe redaction/reference controls, current dossier coverage, and exact dependency-free package scripts are exercised through the production validator path.
- [x] Current dossier result is `VALIDATION_PASSED documents=18 records=1 files=22`.
- [x] The September candidate was pinned to base commit `d4f2098b4940cae61b9f36345cb480bda33d990d` on `hermes/pro-wp0-3-controls` in `/Users/alvinlo/Desktop/Project-HitLink-wp0-3`, with its own ten-path SHA-256 manifest. That manifest is historical, not the current handoff.
- [x] The inherited completed WP0.3 candidate was verified before WP0.4 documentation updates: all seven ordinary WP0.3 mutable hashes matched the accepted manifest, and inherited WP0.1–WP0.3 paths outside WP0.4 scope were not rewritten.
- [x] No dependency or lockfile changed; no application, Prisma, migration, database, infrastructure, vendor, profile, production, or WP1.x behavior changed.
- [ ] Independent specification re-review: pending for the current exact candidate after prerequisite key and handoff remediation.
- [ ] Independent quality/security/evidence review: pending until specification review passes.
- [ ] Required Product, Architecture/Backend, Database, Security/Privacy, Operations/QA-Assurance, and legal/counsel metadata-boundary acceptance: pending.

**Boundaries:** the scanner is intentionally bounded to explicit credential shapes, Luhn-valid payment-card shapes, explicit contract-body markers, and prohibited JSON payload keys. Declared status is optional when absent: the packet requires the registered inherited evidence README to pass from schema-valid manifest metadata, while any present declaration must match the exact bounded grammar and reconcile without conflict. It does not classify natural-language agreements or decide legal authority. Every counsel-owned value remains `COUNSEL_REVIEW_REQUIRED`; `WP03-B01`–`WP03-B05` remain `BLOCKED`.

**Next packet:** WP0.5 is identified only. Do not draft or start it until both WP0.4 independent reviews, required human acceptance, and explicit project-owner stop/review are complete.

**November 19, 2026 review:** The recovered candidate did not pass independent specification review. The September record above remains historical. The [WP0.4 decision register disposition](../compliance/flowstate-pro/decision-register-and-open-items.md#wp04-review-disposition--2026-11-19) records the remediation and the project-owner direction for named profile approval and terminal dispositions. No completion checkoff or next packet authorization has been issued.

**November 20 scope review:** Independent specification review failed on the prior candidate because manifest registration could include unrelated repository Markdown. The schema and CLI now limit registrations to the Pro dossier subtree and the existing implementation plan. The CLI checks resolved paths before reading dossier Markdown, while reference-only paths retain their existing contract. The new synthetic registration test failed before the repair and passed after it. Current-dossier validation also passed. A fresh exact-candidate specification review, subsequent quality/security/evidence review, and named human acceptance are pending. G0 remains blocked.

### WP0.5 — G0 review

- Resolve all product/architecture contradictions.
- Keep CIAM, vendors, legal values, exact first specialty/profile, claims, pricing, SLAs, and insurance as blockers if unanswered.
- Authorize only Milestone 1 packets whose dependencies are satisfied.

---

## 8. Milestone 1 — Product separation and synthetic non-production foundation

**Dependency:** G0.

**Exit gate G1:** Pro applications and packages are structurally isolated from Standard; US synthetic development/CI environments can build and run; no clinical journey or production activation is implied.

### WP1.1 — Add architectural boundary tests first

**PROPOSED — FUTURE:** `tests/tooling/pro-product-boundaries.test.mjs`, `docs/compliance/flowstate-pro/architecture-boundaries.md`.

Fail when:

- a Pro app imports Standard `packages/db`, `packages/auth`, role/session/domain modules, Stripe configuration, or app-local libraries;
- a Standard app imports Pro clinical packages;
- provider/patient web imports Prisma, policy internals, KMS/storage/vendor SDKs, or a repository;
- a shared package exposes data-bearing types, product policy, credentials, or runtime clients to both products.

Then add only the minimum package/app manifests required to make the approved graph pass.

### WP1.2 — Create Pro application shells and separate configuration

**PROPOSED — FUTURE:** paths in section 4.1 plus plane-specific, schema-validated environment manifests under `infra/pro/`.

- Health/readiness endpoints contain no tenant or dependency secrets.
- Origins, cookies, session names, database URLs, Stripe configuration, and keys are Pro-only.
- White-label host lookup rejects unknown brands/origins.
- Acceptance: each app builds independently; browser cookies do not cross Standard/Pro or provider/patient origins; Standard smoke checks remain unchanged.

### WP1.3 — Create the separate Pro schema baseline

**PROPOSED — FUTURE:** `packages/pro-db/prisma/schema.prisma`, first additive migration, migration tests.

Initial schema includes only foundations needed by the next packets: organization/tenant, site/service location facts (without speculative multi-location workflow), workforce/patient identities as references to the approved identity boundary, role assignment, invitation, patient, representative authority, profile/activation references, operation/idempotency record, outbox, audit/disclosure references, policy/lifecycle references, and version metadata.

- Add tenant ID to every tenant-owned root and composite tenant constraints to relationships.
- Add RLS policies and a trusted transaction-context contract.
- Avoid clinical module tables until their failing tests/work packets.
- Acceptance: app credentials cannot query without tenant context; guessed/swapped tenant IDs fail at repository and PostgreSQL layers; fresh and upgrade migrations pass.

### WP1.4 — Establish synthetic data and artifact controls

**PROPOSED — FUTURE:** `tests/pro/fixtures/`, CI canary tests, non-production data policy.

- Generate adults, minors, proxies, providers, clinical drafts/finals, files, billing, rights, holds, and cross-region cases using unmistakably synthetic canaries.
- Block production export imports and production credentials in non-production.
- Scan logs, screenshots, traces, reports, and build artifacts for canaries outside intended test assertions.
- Acceptance: synthetic dataset covers every current classified field; preview/CI resources cannot reach production resources.

### WP1.5 — Provision Pro-US non-production platform

**PROPOSED — FUTURE:** `infra/pro/` manifests/IaC after tool approval, `docs/compliance/flowstate-pro/runbooks/us-nonprod.md`.

- Create isolated US non-production workload/recovery projects and the approved regional services.
- Apply least-privilege service accounts, Cloud Armor baseline, secrets, CMEK, PHI-free logging, regional sinks, budget/alerting, artifact scanning, and promotion separation.
- Acceptance: policy tests pass before apply; read-back proves project/region/IAM/key/log/storage/database boundaries; destroy/recreate is rehearsed with synthetic data.

### WP1.6 — G1 review

Evidence must prove import graph, database/RLS isolation, origin/session isolation, CI isolation, and GCP non-production topology. Do not authorize clinical UI until failed cross-tenant and boundary tests are retained in CI.

---

## 9. Milestone 2 — Identity, activation, policy, audit, files, and operational control plane

**Dependency:** G1 plus approved patient CIAM and required agreements for any external identity service. If CIAM remains blocked, implement only provider-independent interfaces/tests and do not activate accounts.

**Exit gate G2:** A synthetic organization can move through reviewed activation, invitation, MFA, authorization, audit, lifecycle, and controlled-file foundations; unknown profiles and missing agreements fail closed.

### WP2.1 — Identity, invitations, MFA, recovery, and sessions

**PROPOSED — FUTURE:** `apps/pro-api/src/modules/auth/`, provider/patient security routes, Pro schema migrations.

- Separate workforce and patient credentials/sessions; invitations are random, hashed, short-lived, single-use, purpose-bound, rate-limited, and revocable.
- Enforce configured idle/absolute/step-up ceilings server-side.
- Implement secure enrollment, recovery, reset, session listing/revocation, lockout/rate limiting, and enumeration-safe responses.
- Acceptance: positive/negative tests for every Pro role, stale/missing MFA, expired/revoked sessions, recovery abuse, identity change review, and Standard/Pro cookie/credential separation.

### WP2.2 — Organization verification and fail-closed activation

**PROPOSED — FUTURE:** organization application, classification, agreement registry, responsibility matrix, operating envelope, and activation state machine.

Activation sequence:

1. Minimal business-contact application with no PHI.
2. Manual organization/admin verification.
3. Customer/entity/applicability classification.
4. Data-flow and destination review.
5. Required customer and downstream agreement evidence.
6. Approved profile, specialty, purpose/authority, policy versions, region, and operating envelope.
7. Security/Privacy and independent second approval.
8. Invitation enablement.

Unresolved classification or missing required BAA/DPA blocks activation. Registry entries store metadata/evidence references, not contracts.

### WP2.3 — Central policy resolution and authorization

**PROPOSED — FUTURE:** `apps/pro-api/src/modules/policy/` and policy matrix artifacts.

- Resolve verified organization/customer/profile/location/residence/origin/care/payer/contract/destination inputs.
- Enforce explicit actor/resource/action/field/relationship/purpose/authority/assurance rules.
- Support scoped representative authority, effective/expiry/revocation dates, evidence, and age-of-majority transitions.
- Acceptance: unknown/conflicting inputs deny; patient, proxy, provider, support, billing, admin, and privacy-officer projections are field-minimal; tenant admins cannot author legal rules.

### WP2.4 — Append-only audit and durable operation outcomes

**PROPOSED — FUTURE:** `apps/pro-api/src/modules/audit/`, regional audit persistence and immutable export configuration.

- Write security-significant attempts and one terminal outcome per operation.
- Persist high-risk intent before execution and reconcile provider/DB outcomes through idempotent operation IDs.
- Test audit outage fail-closed behavior and approved emergency mode separately.
- Acceptance: app credentials cannot update/delete audit; PHI canaries never enter audit; business rollback cannot erase denied/failed audit evidence; integrity/export/retention read-back exists.

### WP2.5 — Transactional outbox and destination gateway

**PROPOSED — FUTURE:** outbox worker inside the modular monolith and `apps/pro-api/src/modules/integrations/`.

- Claim rows with bounded retries, idempotency, leases, dead-letter/review state, and outcome reconciliation.
- Every destination requires approved purpose, data classes, region, agreement, retention/deletion behavior, transfer approval, and enabled profile.
- Start with no destinations enabled. Add email, Stripe Pro, eligibility, or monitoring adapters only in their dependent packets.
- Acceptance: unknown/disallowed destination never transmits; payload is minimized; disclosure/audit records reconcile to each attempt and outcome.

### WP2.6 — Controlled clinical file pipeline

**PROPOSED — FUTURE:** `apps/pro-api/src/modules/files/`, regional quarantine/released buckets, metadata schema, scanner adapter.

- Presigned/upload authorization is tenant/patient/encounter scoped and size/type bounded.
- Verify checksum, quarantine, scanner result, classification, provenance, immutable version, and release state.
- Reject DICOM and unknown types.
- Acceptance: malware/timeout/scan outage fails closed; quarantine objects cannot be served; released downloads require fresh authorization/audit and safe headers; delete/hold/backup behavior is tested.

### WP2.7 — Human safeguards and operations baseline

**PROPOSED — FUTURE:** policy templates, training/access/vendor registers, incident and privileged-access runbooks, evidence references.

Name at minimum: Security/Privacy lead and Security Official, incident owner, executive signatory/risk owner, independent second approver, Virginia counsel, BC counsel, and independent assessor. Missing screening, training, sanctions, device rules, on-call, vendor review, risk analysis, penetration testing, insurance review, or protected evidence storage remains a launch blocker.

### WP2.8 — G2 review

Run activation, identity, authorization, RLS, audit, outbox, file, and privileged-access adversarial scenarios. Approve only the v1 clinical packets whose policy/vendor dependencies are complete.

---

## 10. Milestone 3 — Pro-US clinical v1

**Dependency:** G2, Virginia customer/applicability profile approval, US legal-policy inputs, and approved vendors for each enabled integration.

**Exit gate G3:** The complete minimum safe clinical journey works in US synthetic staging. Finalized records are immutable, patient/proxy authority is explicit, every classified operation is tenant/policy/audit controlled, and deferred modules remain disabled.

Each packet adds only its own schema, repository, API, provider UI, patient UI, policy entries, lifecycle hooks, audit/disclosure events, synthetic fixtures, and tests. All listed paths are **PROPOSED — FUTURE** under the Pro applications/packages.

### WP3.1 — Patients, demographics, contacts, and representatives

- Patient identity and approved demographics/contact fields.
- Adults, minors, guardians, proxies, substitute decision-makers, evidence, scope, dates, expiry/revocation, and age transition.
- High-risk identity fields remain disabled by default and require separate purpose/security/retention approval.
- Tests: duplicate/match policy, wrong tenant, wrong proxy scope, expired/revoked authority, patient-reported versus verified status, and field-level projections.

### WP3.2 — Scheduling, intake, consent, and forms

- Provider availability and appointment/encounter scheduling required for v1; do not add generalized multi-location behavior.
- Versioned intake, consent, HIPAA authorization, acknowledgement, contract acceptance, and non-consent authority remain distinct.
- Withdrawal affects future dependent operations without deleting lawful history.
- Tests: version/language/purpose evidence, no pre-checked consent, unknown authority denial, cutoff/concurrency, proxy signing scope, and accessible patient/provider journeys.

### WP3.3 — Longitudinal chart and encounter timeline

- Minimal clinical chart organizes encounters, problems/diagnoses where profile-enabled, treatment/history, allergies, medications, documents, tasks, and released items.
- High-risk categories (SSN/government ID, biometrics, genetics, unrestricted narratives) stay disabled unless separately approved.
- Tests: tenant/patient integrity, provenance, patient-reported distinction, field minimization, concurrency, and profile feature gates.

### WP3.4 — Clinical notes, finalization, amendments, and late entries

- Editable drafts with ownership/version checks.
- Finalization creates immutable content, author/time/signature/evidence and lifecycle references.
- Corrections create linked amendments/late entries with reason and prior version; never overwrite final history.
- Tests: finalize race, stale edit, amendment lineage, unauthorized co-sign, audit outage, restoration, and raw-store immutability.

### WP3.5 — Controlled clinical files

- Link released files to patient and encounter with classification/provenance/version lineage.
- Enforce quarantine pipeline from WP2.6 and append-only amendment/version semantics.
- Tests include safe downloads, cache headers, filenames, malware, wrong patient/tenant, expired links, holds, and DICOM rejection.

### WP3.6 — Medication, allergy, and clinical history minimum

- Structured v1 records sufficient for the approved specialties; do not build e-prescribing, medication administration, interaction engines, or external pharmacy networks.
- Preserve status, source, verification, effective dates, recorder, and amendment history.
- Tests: patient-reported/verified separation, contraindication display integrity, archival versus deletion, and profile-specific required fields.

### WP3.7 — Direct pay, Pro Stripe boundary, and eligibility

- Separate Pro Stripe account/configuration, keys, products/prices, customers, webhook secrets, access, and reconciliation.
- Nonpayment enters controlled suspension/offboarding and never deletes records or blocks legally/emergency-required access.
- Eligibility is enabled only after vendor/agreement/profile approval; it is not claims or full revenue cycle.
- Tests: idempotent webhook lifecycle, opaque/minimized metadata, tenant/account mapping, failed provider calls, reconciliation, suspension safety, and no Standard Stripe resource use.

### WP3.8 — Patient portal, release, and secure sharing

- Invitation-only patient login, approved profile maintenance, scheduling, intake/consent/forms, released records, payment, account security, proxy management, and rights submission.
- Records are visible only after explicit release policy; patient amendment requests do not mutate finalized clinical content directly.
- Tests: own/other patient, proxy scopes, release/revoke timing, high-risk identity change review, session expiry, no browser persistence/telemetry leakage, and WCAG 2.2 AA.

### WP3.9 — Rights, disclosure accounting, retention, holds, and offboarding

- Authenticated rights requests with risk-based verification, policy deadlines, customer-authority decisions, amendment/appeal states, secure fulfilment, and evidence.
- Versioned retention catalog and lifecycle planner; unknown policy blocks destruction.
- Independently controlled legal holds and dry-run/report-only disposition worker before any deletion mode.
- Offboarding separates cancellation from custody, access, retention, export, holds, integration shutdown, staging destruction, and final disposition.
- Export includes human-readable and structured formats, manifest, hashes, reconciliation, secure transfer, expiry, and staging destruction.
- Tests: state transitions, due-date policy versions, hold races, multiple regimes, no destructive cascades, backup truth, manual continuity, and nonpayment.

### WP3.10 — Audit review, incident workflow, and operational dashboards

- Deterministic signals: repeated denials, cross-tenant guesses, bulk reads/exports, disabled-account access, MFA downgrade, high-risk token use, disallowed destination, KMS/audit/file failures, and reconciliation anomalies.
- Human incident command owns severity, containment, evidence, legal/privacy assessment, notice decisions, and closure.
- Operational dashboards use PHI-free metrics/metadata.
- Tests: no auto-declaration of legal breach, independent clocks, evidence references, suppression expiry, and regional alert routing.

### WP3.11 — US synthetic staging journey and G3 review

Exercise organization application through offboarding, including adult/minor/proxy variants, record finalization/amendment, malicious file, payment failure, rights request, legal hold, export, incident, restore, and support-access denial. Confirm every deferred module and unapproved high-risk field remains disabled.

---

## 11. Milestone 4 — Pro-Canada platform and BC private-clinic profile

**Dependency:** G3 architecture stability; BC counsel decisions; approved Canadian customer profile, vendors, agreements, identity/control-plane/support transfer analysis, and Canada operating staff.

**Exit gate G4:** The Pro-Canada plane passes topology read-back, synthetic BC profile tests, Canada-contained backup/DR exercises, and legal/operational review. This does not approve public bodies, health authorities, E-Health Act participants, insurers, or government contractors.

### WP4.1 — Provision Canada non-production and staging

- Apply the section 5 Canada topology with independent resources, identities, keys, logs, secrets, build promotion, and monitoring.
- Prove no implicit US fallback or cross-plane replication.
- Acceptance: configuration/API read-back, network/IAM/KMS tests, synthetic deploy, destroy/recreate, and region assertions pass.

### WP4.2 — Implement the approved BC private-clinic profile

- Add only counsel-approved purpose/authority, consent, rights, representative, retention, transfer, incident, and responsibility values.
- Keep unresolved customer classes blocked.
- Acceptance: profile fixtures demonstrably change policy behavior from US; unknown/mixed-origin cases deny and route to review.

### WP4.3 — Validate Canadian identity, support, and vendor transfers

- Record residency and subprocessors for CIAM, support, CI/CD, monitoring, email, Stripe/eligibility, malware scanning, and any administrative control plane.
- Enforce approved destinations in the gateway.
- Acceptance: a Canada-to-US or unapproved interprovincial transfer is blocked; approved transfer has profile, purpose, assessment, agreement, disclosure, and audit evidence.

### WP4.4 — Canada DR, backup, rights, and incident exercises

- Restore within Canada, activate manual regional DR, rotate/recover keys, process a synthetic rights request, apply a legal hold, and run vendor/insider/transfer incident tabletops.
- Acceptance: RTO/RPO evidence is labeled internal until commercial approval; logs and evidence remain regionally controlled; no claim of BC-only hosting appears.

### WP4.5 — G4 review

Qualified BC counsel, Security/Privacy, Operations, Database, Backend, QA, independent assessor, and executive risk owner review the exact BC profile and configuration. Canada production remains disabled until section 15 is separately satisfied.

---

## 12. Later competitor-parity modules — disabled until separately gated

Parity is a dated roadmap, not a v1 launch gate. Benchmark verified Jane.app and Epic clinic journeys, not Epic's full enterprise catalog. Every module starts with updated competitor evidence, profile need, legal/data-flow analysis, vendor decision, capacity/security impact, and a new approval gate.

1. Secure messaging and notifications.
2. Telehealth.
3. Medication/e-prescribing and pharmacy integration.
4. Laboratory orders/results and referrals.
5. Imaging/PACS/RIS and DICOM gateway.
6. Claims, clearinghouse, payer automation, and broader revenue cycle.
7. Standards APIs through a separate standards gateway.
8. Governed migration from external clinical systems.
9. Multi-location organizations.
10. Native mobile applications.
11. Clinical AI with provenance, evaluation, human review, and separately approved data use.
12. Additional specialty, public-sector, insurer, health-authority, government-contract, or dedicated-tenant profiles.

Do not scaffold disabled modules "for later." Add the smallest module boundary only when its gate is approved. Prefer integration with established networks and systems over rebuilding their cores.

---

## 13. TDD and verification architecture

### 13.1 Required layers

- **Unit:** policy resolution, authorization, state transitions, redaction, validation, encryption envelopes, token/session boundaries, retention planning, incident thresholds.
- **PostgreSQL integration:** RLS, trusted transaction context, composite tenant integrity, cross-tenant ID swaps, immutable finalization/amendment, outbox claims, audit permissions, lifecycle atomicity, hold/disposition races, idempotency/concurrency, fresh/upgrade migrations.
- **API contract/integration:** unauthenticated, wrong role, wrong tenant/patient, wrong proxy scope, missing/stale MFA, unknown profile, allowed case, denied/success/failure audit, minimal projection, idempotent retry.
- **Browser/E2E:** provider and patient journeys, invitations, MFA/re-auth, accessibility, responsive layouts, storage/network/console/Referer/download canaries, timeout, rights/export, safe files.
- **Static/supply chain:** Standard/Pro import boundaries, web-to-backend boundaries, no direct Prisma/vendor SDK use, dossier/destination/policy schema checks, lockfile/license/vulnerability/secrets/artifact scans.
- **Synthetic performance/capacity:** per-customer operating-envelope workload for seats, patients, concurrent sessions, chart size, files, jobs, exports, and support load. No universal cap is inferred.
- **Infrastructure:** IaC policy tests, actual GCP read-back, IAM negative tests, region assertions, CMEK/secret/log/bucket/database configuration, blocked cross-plane paths.
- **Operational:** backup restore, regional failover, key compromise/rotation, audit outage, scanner outage, incident tabletop, privileged access/JIT revocation, rights/offboarding manual continuity.
- **Human:** legal applicability and values, agreements, policy approval, workforce safeguards, risk acceptance, penetration test review, public claims, and profile approval.

### 13.2 RED-GREEN packet sequence

1. Add one focused test that fails for the missing invariant.
2. Run it and retain the expected failure.
3. Implement the minimum behavior.
4. Run the focused test and affected package suite.
5. Run migration/integration or browser checks required by the packet.
6. Run root lint, type, test, and build gates.
7. Update dossier status/evidence only after real verification.
8. Obtain required reviews before merge or next-gate authorization.

### 13.3 Candidate commands

Use the exact scripts that exist on the implementation revision. The current Standard root baseline is:

```bash
pnpm db:generate
pnpm db:validate
pnpm test
pnpm lint
pnpm check-types
pnpm build
pnpm exec playwright test --list
```

Milestone 1 must add Pro-specific scripts without changing the meaning of Standard commands, including focused Pro unit/integration/E2E, fresh/upgrade migration, boundary, dossier, destination, and infrastructure checks. CI must fail rather than silently skip dedicated database, browser, or infrastructure gates when their prerequisites are expected.

### 13.4 UI acceptance

Every user-facing packet includes loading, empty, error, denied, expired, conflict, and success states; keyboard and screen-reader paths; WCAG 2.2 AA checks; and desktop, tablet, and 390px evidence. Hidden rendering is not authorization. Inspect React/RSC payloads, browser storage, requests, logs, traces, screenshots, and downloads for synthetic canaries.

---

## 14. Dependencies, blockers, rollback, and dossier maintenance

### 14.1 Hard blockers owned outside code

- Exact customer/entity classification for each Virginia and BC applicant.
- Approved retention schedules, consent/authorization text, rights deadlines, breach rules, purpose/legal-authority catalogs, and representative-authority rules.
- Patient CIAM provider and residency, passkey/MFA, recovery, support, and BAA/DPA commitments.
- Email, calendar, clearinghouse, lab, pharmacy, PACS/RIS, telehealth, eligibility, malware, and future integration vendors.
- Executed Google/customer/subprocessor agreements and precise covered configurations.
- BC public-sector, health-authority, E-Health Act, insurer, and government-contract requirements.
- Cyber/E&O insurance limits/exclusions.
- Pricing, contractual SLAs, support promises, credits, and exact operating envelopes.
- First activated specialty/customer profiles.
- Exact public privacy/HIPAA/PIPEDA language.
- Named Security/Privacy, Security Official, incident, executive risk, second-approver, counsel, assessor, operations, and support/on-call owners.

A missing blocker never defaults to the least restrictive behavior. Implement independent packets where possible; keep the dependent feature disabled.

### 14.2 Rollback and failure policy

- Documentation changes use explicit supersession; never erase approved history.
- Schema changes are additive, rehearsed from the prior release, and never rewrite applied migrations.
- Feature/profile flags default disabled and cannot bypass core authorization, RLS, audit, or region boundaries.
- Policy rollback restores a previously approved version with reason/effective time; it never silently broadens access or legal authority.
- Audit and disclosure history is append-only and is not deleted to roll back application code.
- Clinical finalization is irreversible; correction uses amendments, not rollback mutation.
- Encryption uses expand/migrate/contract and forward-fix after plaintext removal; key loss/compromise follows an exercised runbook.
- File versions and quarantine evidence remain immutable; bad releases are revoked and superseded.
- Outbox/destination enablement rolls back to disabled without losing durable intents/outcomes; retries remain idempotent.
- Retention workers progress report-only → approved archive → approved destruction. Unknown policy or hold returns blocked.
- Infrastructure rollback preserves region, keys, logs, audit, backups, and evidence. Never fail over across countries as a convenience.
- Identity/MFA rollout requires enrollment/recovery support. Any emergency mechanism is named, time-limited, MFA/device protected, audited, reconciled, and reviewed.
- Rights, retention, custody, and incident clocks continue operationally during deployment rollback or outage.
- If tenant isolation, audit completeness, record immutability, key access, file quarantine, or destination controls regress, disable the affected module/profile and preserve evidence before restoration.

### 14.3 Dossier update rule

After every packet, update the control/evidence matrix and affected specifications with:

- decision/control/requirement IDs;
- exact implementation revision and configuration version;
- affected region/profile/module;
- test and exercise evidence references;
- owner/reviewer and date;
- status transition using the approved vocabulary;
- known gaps, residual risk, expiry/review date;
- rollback evidence;
- superseded artifact references.

Code completion can reach `IMPLEMENTED` or `TECHNICALLY_VERIFIED`; it cannot self-award `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, or `APPROVED_FOR_PROFILE`.

---

## 15. Final pre-production gates

Run these gates separately for Pro-US Virginia and Pro-Canada BC. A pass in one region/profile does not transfer to another.

### Gate P1 — Scope and applicability

- Named customer, entity/customer classification, specialty, jurisdiction, data flows, profile, modules, vendors, operating envelope, responsibility matrix, and contracts are approved.
- All unresolved inputs are linked blockers; no universal compliance claim is implied.

### Gate P2 — Technical candidate

- Exact commit, image digests, SBOM, dependency/artifact scan, migrations, configuration, IaC revision, and feature/profile flags are frozen.
- Unit, integration, API, browser, boundary, cross-tenant, clinical integrity, migration, capacity, accessibility, and canary suites pass.
- Deferred modules and high-risk data classes are demonstrably disabled.

### Gate P3 — Infrastructure and data plane

- Actual project/region/IAM/network/Cloud Armor/Cloud SQL/Storage/KMS/Secret Manager/log/audit/backup configuration is read back and matches the approved topology.
- No Standard or cross-country resource path exists.
- Fresh deploy, upgrade, backup restore, regional failover, key rotation/recovery, and rollback/forward-fix are exercised with synthetic data.

### Gate P4 — Security and privacy assurance

- Current risk analysis and threat model are reviewed.
- Independent penetration/security assessment is complete and remediation accepted.
- RLS/authorization/audit/file/outbound/identity negative evidence is complete.
- Legal/privacy approves exact policy values, agreements, transfers, rights/retention/hold/offboarding behavior, and incident responsibilities.

### Gate P5 — Operational readiness

- Named workforce roles, screening, training, sanctions, device/access rules, JIT process, on-call, incident command, support boundaries, vendor reviews, access reviews, evidence protection, insurance review, and manual continuity are operationally exercised.
- Incident, audit outage, scanner outage, vendor breach, lost export, insider access, and regional outage tabletops have findings closed or explicitly accepted by the risk owner.
- RTO/RPO remain internal unless commercial terms are approved.

### Gate P6 — Customer and release readiness

- Organization/admin verification and activation checklist are complete.
- Synthetic staging acceptance passes for the exact profile and white-label origins.
- Export/offboarding and emergency/legal access obligations are supportable even during suspension or outage.
- Support, rollback, communications, incident, and escalation owners are on duty for the controlled rollout.

### Gate P7 — Claims and production approval

- Qualified counsel, Security/Privacy, independent assessor, executive risk owner, Product, Operations, Database, Backend, Frontend/UX, QA, and required commercial owners approve the exact candidate/configuration/profile within their remit.
- Public and contractual wording is separately approved and precisely scoped; no guarantee of universal compliance is made.
- Production credentials, deployment, and activation receive explicit human authorization.

**Fail behavior:** Any failed or expired gate leaves production/profile/module activation disabled. There is no provisional production launch with missing legal, contractual, human, evidence, tenant-isolation, audit, identity, file, backup, or incident controls.

---

## 16. Immediate implementation handoff

Authorize only Milestone 0 first. Its deliverable is the complete, internally consistent Pro dossier and reproducible Standard boundary baseline—not clinical code, vendor selection, production infrastructure, or a compliance claim. After G0, execute Milestone 1 in isolated packets beginning with the failing Standard/Pro architectural boundary tests. Do not begin by modifying `packages/db/prisma/schema.prisma`, Standard apps, or Standard authentication.
