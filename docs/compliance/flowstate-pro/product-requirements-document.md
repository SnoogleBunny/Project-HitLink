# Flowstate Pro product requirements document

**Status:** SPECIFIED — WP0.2 HUMAN REVIEWS ACCEPTED 2026-09-22; Gate G0 remains `BLOCKED`

**Release target:** Pro-US v1 for individually approved Virginia profiles

**Canadian lane:** British Columbia private clinics after a separate gate

**Decision baseline:** Q1–Q206, confirmed 2026-08-24

**Last updated:** 2026-09-22

## 1. Purpose and requirement semantics

This PRD defines testable Flowstate Pro functional requirements (`FR`) and non-functional requirements (`NFR`). Product identity, markets, module purpose, exclusions, and commercial boundaries live in `product-spec.md`. Milestones, dependencies, evidence packages, and rollback live in `roadmap.md`.

This is a planning artifact. `MUST` denotes a release requirement for the named profile when applicable; `MUST NOT` denotes a prohibition. A requirement is complete only when its acceptance evidence exists for the exact release candidate and activated profile. Code or tests alone do not establish legal review, operating evidence, or production approval.

### 1.1 Scope labels

- **V1:** required for Pro-US v1 unless formally marked not applicable to the named profile.
- **BC:** additional or repeated requirement for the BC private-clinic lane.
- **DEFERRED:** must remain disabled until a later approved milestone.
- **ALL:** applies to every Flowstate Pro profile and environment.

### 1.2 Global acceptance rules

Every applicable requirement must have:

1. an owner and approving role;
2. positive, negative, tenant-isolation, authorization, and failure-path tests where relevant;
3. synthetic fixtures only outside approved production use;
4. audit evidence for security-significant actions without PHI payloads;
5. a documented rollback or fail-closed disable path;
6. accessible desktop, tablet, and 390px web evidence for user-visible flows;
7. the exact policy, vendor, agreement, region, and profile references on which behavior depends; and
8. no unresolved prerequisite silently defaulted to a permissive value.

### 1.3 Blocked-status mapping

`BLOCKED` is the dossier, work-packet, requirement-dependency, or release-gate status: required documentation, evidence, approval, or external input is unresolved, so release authorization does not exist. It is not a runtime activation state.

`REVIEW_BLOCKED` is the runtime activation state for a tenant, customer profile, or module whose required classification, policy, owner, vendor, agreement, region, transfer, operating envelope, evidence, or approval input is missing, expired, conflicting, or revoked. Any applicable `BLOCKED` dossier or gate dependency keeps the corresponding runtime subject in `REVIEW_BLOCKED`; clearing the documentary blocker does not activate it automatically. Runtime advancement still requires the exact versioned evidence and named approval transition defined in `system-design.md`.

## 2. Functional requirements

### 2.1 Product separation, activation, and configuration

#### FR-001 — Separate product boundary
**Scope:** ALL

**Decision source:** Q1–Q11, Q16, Q31

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Pro MUST use separate applications, schema/database, identity, credentials, MFA, recovery, sessions, infrastructure, storage, backups, keys, logs, monitoring, vendors, access groups, CI/CD promotion, Stripe configuration, and production access from Standard. Only reviewed data-free primitives and pure utilities may be shared.

**Acceptance evidence:**
- Architecture and deployment inventories show no shared regulated store, credential, session, key, billing object, or production access group.
- Automated tests prove a Standard identity/session/record cannot authorize or resolve in Pro and vice versa.
- Dependency/static checks identify and reject unapproved Standard domain imports into Pro.

**Failure / rollback behavior:** Block the shared dependency/resource and stop Pro implementation until separation is restored; do not fall back to Standard.


#### FR-002 — No Standard migration or downgrade
**Scope:** ALL

**Decision source:** Q27–Q28, Q50, Q131

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Pro MUST NOT offer Standard-to-Pro migration, upgrade, downgrade, shared account linking, or conversion into Standard.

**Acceptance evidence:**
- No route, job, UI, API, or operator procedure offers the prohibited transitions.
- Negative tests reject Standard source identifiers and credentials in Pro migration/activation paths.
- Customer-facing copy distinguishes separate products.

**Failure / rollback behavior:** Reject the transition and preserve both products unchanged; remove or disable any discovered route, job, or copy implying conversion.


#### FR-003 — Application-only public intake
**Scope:** ALL

**Decision source:** Q13–Q15, Q157

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** The public site MAY collect minimal business contact/application data but MUST NOT activate a regulated tenant or solicit patient/clinical data.

**Acceptance evidence:**
- Allowed fields are enumerated and validated; patient/clinical fields and file uploads are absent.
- Submission copy prohibits PHI and records the applicable notice/consent version.
- Abuse controls, access, retention, and deletion behavior are tested.

**Failure / rollback behavior:** Reject patient/clinical fields or files, quarantine prohibited submissions if received, and keep the applicant inactive.

**Blocked dependencies:** Applicable public-intake notice/consent wording, retention/deletion policy, and approving owner are `COUNSEL_REVIEW_REQUIRED`/`OWNER_APPROVAL_REQUIRED`.


#### FR-004 — Reviewed organization activation
**Scope:** V1, BC

**Decision source:** Q13–Q15, Q25–Q30, Q38, Q165–Q166

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Pro MUST keep production and PHI-capable evaluation disabled until organization, admin, legal status, customer type, use case, jurisdiction, data flow, contracts, vendors, responsibility matrix, operating envelope, and human owner approvals are complete.

**Acceptance evidence:**
- Activation is an explicit state machine; skipped, expired, unresolved, or revoked prerequisite states deny activation.
- Two-person approval is required where the approved control matrix designates it.
- Every transition records actor, time, evidence reference, profile/configuration version, and audit outcome.
- A synthetic tenant can complete activation; fixtures with each prerequisite missing remain `REVIEW_BLOCKED`.

**Failure / rollback behavior:** Keep the runtime activation in `REVIEW_BLOCKED`; keep the applicable dossier/release gate `BLOCKED`; revoke or deny invitations and PHI-capable access without deleting application evidence.

**Blocked dependencies:** Exact applicant classification, agreements, vendors/configurations, responsibility matrix, operating envelope, and named human approvals are `BLOCKED`.


#### FR-005 — Customer/applicability profiles
**Scope:** ALL

**Decision source:** Q25–Q26, Q39, Q49, Q51–Q58

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Each tenant MUST be bound to a versioned, approved customer/applicability profile. Profiles MUST support broad target specialties without granting universal activation.

**Acceptance evidence:**
- Profile records identify jurisdiction, organization/customer class, specialty/use case, enabled modules/data classes, legal/policy versions, vendors/destinations, and approval state.
- Unknown, conflicting, expired, or unapproved profile inputs deny regulated operations.
- Virginia and BC synthetic fixtures resolve to distinct policies and data planes.

**Failure / rollback behavior:** Deny regulated operations under unknown, expired, conflicting, or unapproved profiles; restore the last approved profile version only.

**Blocked dependencies:** First Virginia/BC profiles and legal-policy catalogs are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-006 — White-label configuration
**Scope:** V1

**Decision source:** Q173–Q177

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Authorized organization admins MUST be able to manage validated branding, organization identity, locale, and approved patient-facing configuration without altering security, legal policy, retention, audit, tenant isolation, or infrastructure controls.

**Acceptance evidence:**
- Allowed configuration has schema validation, versioning, preview, audit, and rollback.
- Negative tests reject executable content, unsafe URLs/files, and attempts to override protected settings.
- Branding remains accessible and consistent across provider and patient web.

**Failure / rollback behavior:** Reject protected-setting overrides and roll back to the last approved configuration version.


#### FR-007 — Per-customer operating envelope
**Scope:** V1, BC

**Decision source:** Q37, Q40, Q56, Q158, Q194–Q206

**Owner / approving role:** Product + Architecture; Product owner approves

**Requirement:** Activation MUST reference an approved operating envelope for seats, active patients, documents/files, storage, workload, integrations, tested capacity, support, and recovery.

**Acceptance evidence:**
- No universal fixed user/patient cap is embedded as product policy.
- Monitoring warns before and blocks or routes review at approved safety boundaries.
- Capacity evidence matches or exceeds the envelope; changes are versioned and approved.

**Failure / rollback behavior:** Stop expansion at the last evidenced envelope and route excess or changed demand to review; never weaken access or audit controls.

**Blocked dependencies:** Operating-envelope defaults, support promises, capacity thresholds, and commercial treatment are `OWNER_APPROVAL_REQUIRED`.


### 2.2 Identity, authorization, sessions, and support access

#### FR-008 — Pro role model
**Scope:** ALL

**Decision source:** Q22, Q60

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Pro MUST support ORGANIZATION_ADMIN, PROVIDER, CLINICAL_SUPPORT, ADMINISTRATIVE_STAFF, BILLING_STAFF, PRIVACY_OFFICER, PATIENT, and GUARDIAN_OR_PROXY as separate, least-privilege roles; Standard roles MUST NOT be reused.

**Acceptance evidence:**
- A versioned permission matrix maps actions and resource scope for every role.
- Unknown roles/actions/resources deny by default.
- Positive and negative tests cover each role, own/other patient, assigned/unassigned provider, and cross-tenant access.

**Failure / rollback behavior:** Deny unknown or Standard roles; disable the affected grant without broadening another role.


#### FR-009 — Invitation and administrator verification
**Scope:** V1

**Decision source:** Q47

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Organization admins MUST be manually verified. Workforce and patient accounts MUST be invitation-controlled and bound to one verified identity and tenant relationship.

**Acceptance evidence:**
- Invitation tokens are random, hashed, purpose-bound, short-lived, single-use, rate-limited, revocable, and never logged.
- Duplicate, expired, cross-tenant, and replayed invitations fail safely.
- Admin verification evidence and reviewer identity are required before admin privileges activate.

**Failure / rollback behavior:** Reject invalid invitations or unverified admin elevation; revoke the token and retain audit evidence.

**Blocked dependencies:** Administrator-verification policy, acceptable evidence, authorized reviewers, and production operating procedure are `BLOCKED` pending named owner approval.


#### FR-010 — MFA, recovery, and account security
**Scope:** V1

**Decision source:** Q47, Q89–Q93, Q106–Q107

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Workforce and patients MUST use the approved MFA/CIAM configuration. Recovery and high-risk identity changes MUST use risk-based verification and human review where configured.

**Acceptance evidence:**
- Enrollment, challenge, recovery, reset, rate limit, lockout, factor replacement, and support paths pass adversarial tests.
- Missing or stale assurance denies regulated and step-up operations.
- Patient CIAM remains blocked until residency, passkey, recovery, support, and BAA requirements are approved.

**Failure / rollback behavior:** Deny regulated access or high-risk changes when assurance/recovery requirements are unmet; disable the affected identity flow.

**Blocked dependencies:** Patient CIAM vendor, residency, passkey/MFA, recovery, support, and agreement commitments are `BLOCKED`.


#### FR-011 — Session ceilings and step-up
**Scope:** V1

**Decision source:** Q89–Q93

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Security-owned configurable ceilings MUST initially enforce workforce idle/absolute 15 minutes/12 hours, patient 30 minutes/24 hours, and privileged step-up freshness of 5 minutes.

**Acceptance evidence:**
- Server-side clock-boundary tests enforce idle, absolute, revoked, and step-up expiry.
- Client warnings are advisory; expired sessions cannot continue from stale UI state.
- Configuration changes require security approval, versioning, staged rollout, and rollback.

**Failure / rollback behavior:** Expire or revoke the session/step-up server-side; roll back only to a previously approved security configuration.


#### FR-012 — Guardian, proxy, and representative authority
**Scope:** V1

**Decision source:** Q59, Q127–Q128, Q150

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Pro MUST represent guardians, proxies, substitute decision-makers, and representatives through explicit patient-scoped authority, evidence, effective dates, scope, expiry, revocation, and age-of-majority transition.

**Acceptance evidence:**
- Proxy access is denied before effective date, after expiry/revocation, and outside scope.
- Authority changes use step-up, notify affected parties as approved, and are audited.
- Age-of-majority transition produces a review task and does not silently preserve access.
- The patient or authorized reviewer can inspect current delegated access where allowed.

**Failure / rollback behavior:** Deny proxy access outside verified scope or dates; revoke the grant and preserve its history.

**Blocked dependencies:** Representative/minor/authority rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-013 — Tenant-clinician break-glass
**Scope:** V1

**Decision source:** Q63

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Approved tenant clinicians MAY use a narrow, reasoned, time-limited, MFA-protected emergency access flow. Flowstate staff MUST NOT receive clinical break-glass.

**Acceptance evidence:**
- Access requires approved role, recent MFA, reason code, duration, and patient/resource scope.
- Use is prominently indicated, audited, notified, automatically revoked, and queued for independent review.
- Missing audit service fails closed except a separately approved emergency continuity mode.

**Failure / rollback behavior:** Deny break-glass when any prerequisite or audit path is unavailable; auto-revoke expired access and preserve review evidence.

**Blocked dependencies:** Any emergency continuity mode and its approval policy are `BLOCKED` until named approval.


#### FR-014 — Flowstate workforce and JIT support
**Scope:** ALL

**Decision source:** Q35, Q63, Q93

**Owner / approving role:** Security/Privacy + Backend; Product owner approves role/user scope

**Requirement:** Flowstate workforce MUST use separate managed identity. Exceptional support access MUST be approved, JIT, scoped, time-limited, device/MFA protected, audited, revoked, and reviewed; routine patient-data access is prohibited.

**Acceptance evidence:**
- Standing production patient-data grants are absent.
- JIT tests prove scope and expiry; access cannot be self-approved.
- Session recording/evidence references follow approved policy without copying PHI into general logs.

**Failure / rollback behavior:** Deny or revoke support access outside approved scope/time; suspend the support path, not tenant clinical continuity.

**Blocked dependencies:** Production managed-identity/JIT configuration, support-access policy, evidence handling, and named independent approvers are `BLOCKED`.


### 2.3 Patient administration and self-service

#### FR-015 — Patient record and source distinction
**Scope:** V1

**Decision source:** Q41, Q51–Q54, Q62, Q147, Q197

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Pro MUST maintain a tenant-scoped patient record and distinguish patient-reported, imported, clinician-entered, and clinician-verified facts with provenance.

**Acceptance evidence:**
- Every regulated fact has source/provenance and lifecycle/policy references where required.
- Patient changes do not overwrite clinician-verified values without an approved review transition.
- Cross-tenant and guessed-ID tests deny and audit.

**Failure / rollback behavior:** Reject cross-tenant or provenance-invalid writes and return no unauthorized projection; preserve the prior verified fact.

**Blocked dependencies:** The first profile’s approved clinical fields, provenance rules, and lifecycle/policy references are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-016 — Patient profile maintenance
**Scope:** V1

**Decision source:** Q144–Q154

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Authenticated patients MUST be able to view and update approved demographic/contact fields and submit high-risk identity changes for review.

**Acceptance evidence:**
- Field allowlists are profile-driven and the response exposes only the patient’s permitted data.
- High-risk fields cannot update directly; review status and outcome are visible.
- Updates use recent assurance where required and emit audit/lifecycle events.

**Failure / rollback behavior:** Reject disallowed direct changes and route high-risk changes to review; keep the prior approved value active.

**Blocked dependencies:** Profile-approved editable fields and high-risk identity-change verification/review policy are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-017 — Patient security and proxy management
**Scope:** V1

**Decision source:** Q89–Q93, Q127–Q128, Q150

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Patients MUST be able to manage password/factors, inspect/revoke sessions, and view/request changes to proxy relationships within approved authority rules.

**Acceptance evidence:**
- Raw session tokens/factor secrets are never displayed.
- Revocation is immediate server-side.
- Proxy requests cannot self-grant authority and high-risk changes enter review.

**Failure / rollback behavior:** Revoke affected sessions/factors immediately and route authority changes to review; never self-grant proxy access.

**Blocked dependencies:** Proxy/representative authority, change, revocation, expiry, and review rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-018 — Patient appointment self-service
**Scope:** V1

**Decision source:** Q144–Q154, Q189–Q193

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Invited patients or authorized proxies MUST be able to request/book, view, reschedule, and cancel appointments within organization/profile rules.

**Acceptance evidence:**
- Availability, provider/resource constraints, cutoff rules, concurrency, timezone, duplicate submission, and authorization are tested.
- Proxy actions retain the acting identity and patient context.
- Notifications contain the minimum approved data.

**Failure / rollback behavior:** Reject conflicting or unauthorized booking changes; preserve the last confirmed appointment state and reconcile duplicates.

**Blocked dependencies:** Profile-specific scheduling/cancellation rules and any production notification vendor, content, and agreement are `BLOCKED`.


#### FR-019 — Patient intake, consent, and forms
**Scope:** V1

**Decision source:** Q115, Q122, Q144–Q154

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Patients/proxies MUST be able to complete assigned intake, consent, authorization, acknowledgment, contract, and form workflows with versioned text/evidence.

**Acceptance evidence:**
- Distinct legal/evidence record types are not conflated.
- No consent is preselected; subject, scope, purpose, text/version, language, actor, channel, policy, and time are recorded.
- Withdrawal changes future approved use/disclosure but preserves lawful history.
- Proxy signature/authority is validated for the specific action.

**Failure / rollback behavior:** Reject incomplete, wrong-version, or unauthorized evidence; preserve prior lawful history and block dependent processing.

**Blocked dependencies:** Consent/authorization/representative text and authority rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-020 — Patient released-record access
**Scope:** V1

**Decision source:** Q144–Q154, Q189–Q193

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Patients/proxies MUST be able to view and download only records/files explicitly released to them and within current authority.

**Acceptance evidence:**
- Draft, unreleased, revoked, expired, other-patient, and other-tenant content remains inaccessible.
- Each read/download reauthorizes and audits; headers prevent unintended caching/sniffing/framing.
- Safe filenames, content type, integrity, and malware status are enforced.

**Failure / rollback behavior:** Deny unreleased, revoked, expired, wrong-patient, or unsafe content; revoke delivery access without deleting source records.

**Blocked dependencies:** Representative-authority and release revocation/expiry/access rules for the activated profile are `COUNSEL_REVIEW_REQUIRED`.


#### FR-021 — Patient payment self-service
**Scope:** V1

**Decision source:** Q31, Q144–Q155, Q189–Q193

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Patients/proxies MUST be able to view approved balances/receipts and complete direct-pay actions through Pro’s separate commerce boundary.

**Acceptance evidence:**
- Payment-provider payloads are minimized and use approved opaque references.
- Idempotency, webhook authenticity, tenant/account mapping, duplicate events, failure, and reconciliation are tested.
- Payment status cannot change clinical record integrity or legally required access.

**Failure / rollback behavior:** Leave payment state pending/failed/uncertain until provider reconciliation; preserve clinical access and record integrity.

**Blocked dependencies:** Production payment configuration, approved balances/prices, agreements, and commercial policy are `BLOCKED`/`OWNER_APPROVAL_REQUIRED`.


#### FR-022 — Patient rights center
**Scope:** V1

**Decision source:** Q116, Q123–Q126, Q154

**Owner / approving role:** Product + Backend; Privacy/Security and customer record authority approve

**Requirement:** Patients/proxies MUST be able to submit, verify, track, and receive approved access, correction/amendment, export, and other profile-applicable rights requests.

**Acceptance evidence:**
- Request type, scope, verification, status, due date, decision, fulfilment, and appeal/review state are represented.
- The workflow never auto-makes a legal decision.
- Delivery is secure, time-limited, checksum-audited, and restricted to the verified recipient.

**Failure / rollback behavior:** Accept only a reviewable request state when legal inputs are unresolved; block automated decision or insecure delivery.

**Blocked dependencies:** Rights scope, deadlines, exceptions, verification, and delivery rules are `COUNSEL_REVIEW_REQUIRED`.


### 2.4 Scheduling, clinical chart, records, and files

#### FR-023 — Workforce scheduling
**Scope:** V1

**Decision source:** Q189–Q193

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Authorized workforce MUST manage provider/resource availability, appointments, patient assignment, intake readiness, and operational queues.

**Acceptance evidence:**
- Role/assignment, timezone, recurrence if enabled, conflicts, concurrent booking, cancellation, and audit tests pass.
- Clinical detail is excluded from schedule views unless explicitly required and authorized.

**Failure / rollback behavior:** Reject conflicting or unauthorized schedule mutations; preserve the confirmed schedule and create a review/audit outcome.


#### FR-024 — Encounter and longitudinal chart
**Scope:** V1

**Decision source:** Q41, Q51–Q54, Q189–Q193

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Authorized clinical users MUST create and view tenant-scoped encounters and a longitudinal chart containing profile-approved clinical and administrative data.

**Acceptance evidence:**
- Minimal role-based projections are enforced server-side.
- Encounter status transitions and patient linkage are constrained and auditable.
- Unapproved high-risk categories cannot be captured or returned.

**Failure / rollback behavior:** Reject invalid transitions, links, or projections; preserve the prior chart state and audit the denial.

**Blocked dependencies:** The activated profile’s permitted clinical/administrative data classes, purpose/authority, and access policy are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-025 — Medication, allergy, and history
**Scope:** V1

**Decision source:** Q41, Q51–Q54, Q189–Q193

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Pro MUST support profile-approved medication, allergy, and health-history records with source, status, verification, author, and time.

**Acceptance evidence:**
- Current/historical/error-entered states remain distinguishable.
- Patient-reported values remain separate until clinician verification.
- Updates preserve provenance and do not destructively erase prior clinical meaning.

**Failure / rollback behavior:** Reject destructive or provenance-losing updates; retain prior states and require an attributable correction.

**Blocked dependencies:** Profile-approved medication, allergy, history fields, verification rules, purpose/authority, and retention are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-026 — Draft, finalization, amendment, and late entry
**Scope:** V1

**Decision source:** Q62, Q147, Q197

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Draft clinical content MAY be edited. Finalized clinical records MUST be immutable; corrections MUST use linked amendments or late entries with author, time, reason, prior version, signatures where required, and audit.

**Acceptance evidence:**
- Database/application tests reject update/delete of finalized content.
- Concurrent finalization and amendment conflicts resolve deterministically without lost updates.
- UI displays current record and complete amendment lineage without implying the original vanished.

**Failure / rollback behavior:** Reject stale or direct mutation of finalized content; require linked amendment/late entry and preserve all versions.

**Blocked dependencies:** Profile-specific signature, finalization, amendment, late-entry, lifecycle, and approving-authority rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-027 — Controlled high-risk data classes
**Scope:** ALL

**Decision source:** Q41, Q51–Q54

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** SSN/SIN, government ID, biometrics, genetics, diagnoses, treatments, unrestricted narratives, and profile-designated high-risk categories MUST default disabled and require approved purpose, authority, security, access, and retention before enablement.

**Acceptance evidence:**
- Disabled categories are absent from UI/API schemas and rejected server-side.
- Enablement is profile-versioned, approved, audited, and reversible without data loss.
- Existing records remain controlled when a category is later disabled.

**Failure / rollback behavior:** Reject collection, storage, return, or transmission while the category is disabled; disabling later preserves controlled records.

**Blocked dependencies:** Exact high-risk fields, purpose, authority, roles, security, destinations, and retention are `BLOCKED`.


#### FR-028 — Controlled clinical file pipeline
**Scope:** V1

**Decision source:** Q42, Q54, Q102, Q188

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Clinical files MUST use approved types, size limits, malware/active-content scanning, quarantine, classification, provenance, patient/encounter linkage, integrity hash, governed object storage, immutable versioning, and lifecycle policy.

**Acceptance evidence:**
- Unscanned, failed, malicious, mismatched, oversized, or unapproved files cannot be released or downloaded.
- PostgreSQL stores metadata/references, not file-body blobs.
- Upload, scan, quarantine, release, version, amendment, retention, and deletion failure paths are tested.
- DICOM is rejected unless the separate PACS integration profile is active.

**Failure / rollback behavior:** Keep the object quarantined or rejected; revoke release/download and preserve scan/version evidence.

**Blocked dependencies:** Production malware-scanning vendor/configuration, covered service, agreements, and lifecycle values are `BLOCKED`.


#### FR-029 — Provider-controlled release
**Scope:** V1

**Decision source:** Q144–Q154, Q189–Q193

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Authorized providers MUST explicitly release approved chart items/files to a patient or current representative; creation/finalization MUST NOT imply portal release.

**Acceptance evidence:**
- Release state is patient/resource/version-specific and records releaser, time, policy, recipient scope, and notification.
- Revocation/expiry rules behave according to the approved profile without deleting source records.
- Bulk release requires step-up and preview/reconciliation.

**Failure / rollback behavior:** Do not expose unreleased content; revoke/expire the release record while preserving source history.

**Blocked dependencies:** Release-eligible content/profile policy, representative authority, notification rules, and release revocation/expiry behavior are `COUNSEL_REVIEW_REQUIRED`; production notification configuration is `BLOCKED` where used.


### 2.5 Billing, privacy, lifecycle, and portability

#### FR-030 — Direct-pay billing and eligibility
**Scope:** V1

**Decision source:** Q31, Q76–Q87, Q189–Q193

**Owner / approving role:** Clinical/Product + Backend; customer record authority and Security/Privacy approve

**Requirement:** Pro MUST support approved direct-pay billing and eligibility inquiry without enabling claims/revenue-cycle workflows.

**Acceptance evidence:**
- Separate Pro products/prices/customers/webhooks/reconciliation are evidenced.
- Eligibility vendors and response retention are profile-approved and destination-gated.
- Claims submission controls remain disabled and negative-tested.

**Failure / rollback behavior:** Keep unapproved eligibility and all claims routes disabled; reconcile payment/provider ambiguity before retry.

**Blocked dependencies:** Production eligibility vendor/configuration and agreements are `BLOCKED`; prices/packaging remain `OWNER_APPROVAL_REQUIRED`.


#### FR-031 — Controlled commercial suspension
**Scope:** ALL

**Decision source:** Q28, Q131, Q156

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** Nonpayment or cancellation MUST enter a controlled suspension/offboarding state and MUST NOT delete records or block legally or emergency-required access.

**Acceptance evidence:**
- State transitions separate commercial access, clinical continuity, custody, rights, export, hold, retention, integration, and destruction decisions.
- Suspension fixtures retain approved patient/provider emergency and rights access.
- No destructive cascade is triggered by billing state.

**Failure / rollback behavior:** Enter controlled suspension only; preserve records, audit, custody, rights, holds, export, and required access.

**Blocked dependencies:** Legally/emergency-required access, custody/control, rights, export, retention/hold, integration, offboarding, and destruction rules are `COUNSEL_REVIEW_REQUIRED`; named operational owners remain `BLOCKED`.


#### FR-032 — Policy resolution
**Scope:** V1, BC

**Decision source:** Q61, Q64, Q70, Q121

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** The system MUST resolve versioned policy from verified organization status, customer type, service location, patient residence where relevant, record origin, care relationship, payer/public-body involvement, contract, destination, and approved overrides.

**Acceptance evidence:**
- Virginia, BC private-clinic, multi-regime, conflict, unknown, and expired-policy fixtures produce deterministic results.
- Unknown/conflicting inputs deny the dependent action and create review/audit records.
- Tenant admins cannot author legal rules.

**Failure / rollback behavior:** Deny the dependent action and open review when policy inputs are unknown/conflicting; restore only an approved policy version.

**Blocked dependencies:** Applicability, purpose/authority, consent, rights, retention, disclosure, and override catalogs are `COUNSEL_REVIEW_REQUIRED`.


#### FR-033 — Retention, hold, and disposition
**Scope:** V1

**Decision source:** Q68–Q69, Q117–Q118, Q129–Q130

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** Regulated records MUST carry or resolve lifecycle/policy references. Versioned retention, scoped legal holds, review, archive, disposition, and destruction MUST be controlled and auditable.

**Acceptance evidence:**
- Unknown policy blocks destruction.
- Holds independently prevent disposition, including concurrent worker races.
- Workers begin report-only, are idempotent/bounded/retryable, reconcile missing metadata, and preserve immutable audit.
- Backup expiry/reconciliation is described truthfully; no immediate backup mutation is promised.

**Failure / rollback behavior:** Retain and block disposition on unknown policy, hold, race, or failed reconciliation; stop the worker without deleting evidence.

**Blocked dependencies:** Retention schedules, legal-hold values, disposition authority, and backup expiry rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-034 — Rights processing and disclosure accounting
**Scope:** V1

**Decision source:** Q116, Q123–Q126, Q154

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** Authorized privacy users MUST process verified rights requests, approved deadlines, correction/amendment and appeal flows, secure fulfilment, and legally scoped disclosure accounting separate from security audit.

**Acceptance evidence:**
- Queues enforce assignee authority, due dates, least privilege, valid transitions, and immutable outcomes.
- Accounting includes only profile-applicable disclosures and does not expose another person’s data.
- Deadline and decision policy versions are traceable; automation does not make legal conclusions.

**Failure / rollback behavior:** Pause decision/fulfilment at human review when authority or deadline policy is unresolved; preserve request clocks and evidence.

**Blocked dependencies:** Rights deadlines, exceptions, disclosure-accounting rules, and decision authority are `COUNSEL_REVIEW_REQUIRED`.


#### FR-035 — Offboarding export and destruction staging
**Scope:** V1

**Decision source:** Q28, Q119–Q120, Q131

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** Offboarding MUST inventory data and integrations, preserve holds/retention, export approved human-readable and structured formats, produce manifests/hashes/reconciliation, transfer securely, destroy staging, and schedule later disposition.

**Acceptance evidence:**
- Export completeness is reconciled to source counts and hashes.
- Interrupted/retried exports are idempotent and do not create uncontrolled copies.
- Customer cancellation does not bypass custody or legal review.
- Staging expiry/destruction and retrieval events are evidenced.

**Failure / rollback behavior:** Stop export/disposition, retain custody and holds, and clean only approved staging after reconciliation.

**Blocked dependencies:** Custody, retention, hold, transfer, and destruction rules are `COUNSEL_REVIEW_REQUIRED`.


#### FR-036 — External clinical migration
**Scope:** V1 only for an approved initial connector; broader connectors DEFERRED

**Decision source:** Q27, Q50, Q76–Q87, Q189–Q193

**Owner / approving role:** Privacy + Backend/Database; Legal/Privacy or customer record authority approves policy inputs

**Requirement:** Approved external clinical migration MUST use isolated intake, classification, staging, mapping, validation, preview, deduplication, provenance, reconciliation, owner/operator approval, cutover, and source/staging lifecycle controls.

**Acceptance evidence:**
- Source access instructions and payloads receive highest expected classification until reviewed.
- Dry run makes no production writes; finalization requires locked input and reviewed reconciliation.
- Duplicate, invalid, partial, retry, rollback, and failed-cutover cases preserve lineage.
- Standard sources are rejected.

**Failure / rollback behavior:** Abort before cutover or stop/reconcile partial import; preserve source, provenance, and prior Pro state; reject Standard sources.

**Blocked dependencies:** Initial external connector/source, vendor, agreement, field mapping, and cutover approval are `BLOCKED`; Standard is prohibited.


### 2.6 Audit, incidents, integrations, and deferred modules

#### FR-037 — Security audit
**Scope:** ALL

**Decision source:** Q66–Q67, Q185

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Every required security-significant access/action MUST emit an append-only event with actor, tenant, action, opaque resource reference, purpose/policy, request/operation correlation, outcome, reason code, and time, without PHI payloads.

**Acceptance evidence:**
- Application credentials cannot update/delete audit records.
- Success, denial, and sanitized failure completeness is tested for every sensitive route/action.
- Canary scanning finds no names, contact details, clinical text, file content, secrets, or raw provider errors.
- High-risk operations persist durable intent and terminal outcome.

**Failure / rollback behavior:** Deny or fail the sensitive operation when required audit cannot persist; reconcile missing terminal outcomes.

**Blocked dependencies:** The required event catalog, audit retention/WORM policy, production audit destination/configuration, protected evidence system, and accountable reviewers are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### FR-038 — Audit outage behavior
**Scope:** ALL

**Decision source:** Q66–Q67, Q185

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Audit outage MUST fail closed for sensitive operations except a separately approved, time-limited emergency continuity mode.

**Acceptance evidence:**
- The action/audit failure matrix is versioned and tested.
- Emergency mode requires named approval, narrow scope, alerting, independent reconciliation, expiry, and post-event review.
- No silent buffering loss or false success is possible.

**Failure / rollback behavior:** Fail closed; emergency mode is unavailable unless pre-approved, then expires automatically and requires reconciliation.

**Blocked dependencies:** Emergency audit mode scenarios, approvers, limits, and buffer configuration are `BLOCKED`.


#### FR-039 — Incident workflow
**Scope:** V1

**Decision source:** Q94–Q97, Q132

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Deterministic signals MUST feed human incident command with separate discovery, containment, assessment, and notice clocks, evidence references, owner, and review. The system MUST NOT auto-declare reportability.

**Acceptance evidence:**
- Synthetic scenarios cover cross-tenant access, credential compromise, malicious file, vendor incident, lost export, insider/support misuse, KMS failure, and audit outage.
- Legal/Privacy decision and notification actions require named humans.
- Evidence handling is minimal, access-controlled, and chain-of-custody tracked.

**Failure / rollback behavior:** Contain and route to named human incident command; never auto-declare reportability or issue notices.

**Blocked dependencies:** Breach/reportability rules, notice owners, recipients, content, and deadlines are `COUNSEL_REVIEW_REQUIRED`.


#### FR-040 — Destination and integration gating
**Scope:** ALL

**Decision source:** Q64, Q70, Q106–Q114, Q174–Q188

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Any outbound PI/clinical flow MUST pass a versioned destination registry and gateway checking purpose, data class, minimization, origin/destination region, transfer approval, agreement status, retention/deletion, support access, and audit.

**Acceptance evidence:**
- Unknown, expired, unapproved, or mismatched destination/configuration denies.
- Every approved disclosure records destination and minimized field set.
- Provider SDKs are not called directly from web UI code.

**Failure / rollback behavior:** Block the outbox item and transmit nothing; disable the destination on expired/mismatched approval and reconcile in-flight work.

**Blocked dependencies:** Every vendor, region, covered service, agreement, transfer approval, retention/deletion behavior, and support path is `BLOCKED` until approved.


#### FR-041 — Standards gateway
**Scope:** V1 minimal capability; broader coverage DEFERRED

**Decision source:** Q76–Q87, Q174–Q188

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Standards exchange MUST use a separately controlled gateway with profile-scoped resources, authentication, authorization, consent/authority, rate limits, idempotency, audit, destination checks, and versioning.

**Acceptance evidence:**
- General public API access is absent.
- Conformance and negative authorization/tenant/destination tests pass for each enabled resource/operation.
- Non-enabled resources and bulk access deny by default.

**Failure / rollback behavior:** Deny non-enabled resources/operations and disable credentials/queues for the affected gateway profile.

**Blocked dependencies:** Enabled standards resources, partners, conformance scope, agreements, and transfer approvals are `BLOCKED`.


#### FR-042 — Deferred module disablement
**Scope:** ALL

**Decision source:** Q76–Q87, Q189–Q193

**Owner / approving role:** Security/Privacy + Backend/Operations; Architecture approves

**Requirement:** Secure messaging, telehealth, e-prescribing, lab/referral, PACS/DICOM, claims/revenue cycle, expanded standards, broad migration connectors, multi-location, native mobile, clinical AI, and unapproved specialty/public-sector profiles MUST remain disabled until their own gates complete.

**Acceptance evidence:**
- Routes, jobs, webhooks, background workers, credentials, and UI entry points are absent or fail closed for disabled modules.
- Configuration cannot enable a module without its approved profile/control/evidence version.
- CI and deployment read-back tests detect accidental enablement.

**Failure / rollback behavior:** Keep all entry points, workers, credentials, and webhooks absent or disabled; revert accidental enablement immediately.

**Blocked dependencies:** Each deferred module retains its own legal/vendor/policy/commercial/operational blockers.


#### FR-043 — Competitor journey benchmark registry
**Scope:** ALL

**Decision source:** Q71–Q75

**Owner / approving role:** Product; Product owner approves

**Requirement:** Jane.app/Epic parity MUST be managed as dated, source-backed clinic journeys with applicability, gap, target wave, decision, and evidence—not as a full-catalog launch promise.

**Acceptance evidence:**
- Each parity item has source/date, user journey, profile relevance, current state, gap, owner, milestone, acceptance measure, and defer/reject rationale.
- Stale benchmarks trigger review and do not silently become product requirements.
- Parity activation still satisfies all applicable FR/NFR gates.

**Failure / rollback behavior:** Mark stale or unsupported parity items for review; do not convert them into release requirements or enablement.


#### FR-044 — BC private-clinic activation
**Scope:** BC

**Decision source:** Q5–Q8, Q32, Q57, Q98–Q114

**Owner / approving role:** Product + Security/Privacy + Operations; BC counsel and executive risk owner approve activation inputs

**Requirement:** BC activation MUST use the isolated Canadian data plane and a separately approved private-clinic profile, legal/policy catalog, vendors, contracts, transfer assessment, support model, and evidence package.

**Acceptance evidence:**
- Data, backups, keys, and logs are configured in the approved Canadian regions.
- Identity/control-plane/support transfers are explicitly reviewed; the product does not claim BC-only hosting.
- Public-body, health-authority, E-Health Act, insurer, and government-contracting fixtures remain blocked.
- Virginia approval does not satisfy any BC approval field automatically.

**Failure / rollback behavior:** Keep BC runtime activation `REVIEW_BLOCKED` and the BC release gate `BLOCKED`; disable the Canadian profile without shifting data/service to the US or inheriting Virginia approval.

**Blocked dependencies:** BC private-clinic applicability, policy, CIAM/support transfers, vendors, agreements, and first customer profile are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


## 3. Non-functional requirements

#### NFR-001 — Tenant isolation and integrity
**Scope:** ALL

**Decision source:** Q88, Q174–Q188

**Owner / approving role:** Database + Security/Privacy; Architecture approves

**Requirement:** Every regulated root and relationship MUST enforce tenant integrity through tenant IDs, composite constraints, PostgreSQL RLS, trusted transaction context, controlled repositories, and adversarial tests.

**Acceptance evidence:** Cross-tenant ID substitution, relation swapping, bulk operations, background jobs, exports, files, webhooks, and restored-copy tests all deny; static checks prevent unapproved direct sensitive-model access.

**Failure / rollback behavior:** Deny/no rows on missing or mismatched tenant context; stop the affected module and restore the last verified RLS/repository configuration.


#### NFR-002 — Deny by default
**Scope:** ALL

**Decision source:** Q64, Q70, Q174–Q188

**Owner / approving role:** Security/Privacy; Architecture approves

**Requirement:** Unknown actor, role, action, resource, tenant, assignment, authority, MFA assurance, jurisdiction, policy, module, destination, or agreement state MUST deny the dependent operation.

**Acceptance evidence:** A generated negative matrix covers every unknown dimension and records stable non-sensitive reason codes.

**Failure / rollback behavior:** Deny with a stable non-sensitive reason and route unresolved state to review; no permissive fallback.


#### NFR-003 — Clinical record integrity
**Scope:** V1

**Decision source:** Q62, Q147, Q197

**Owner / approving role:** Database + Clinical/Product owner; Security/Privacy approves

**Requirement:** Finalized records, versions, signatures, amendments, provenance, and lifecycle events MUST be tamper-evident and non-destructive.

**Acceptance evidence:** Database permission/constraint tests and application tests reject direct mutation/deletion; concurrency and restore tests preserve lineage.

**Failure / rollback behavior:** Reject mutation/deletion and require amendment/reconciliation; preserve lineage through rollback or restore.


#### NFR-004 — Data minimization
**Scope:** ALL

**Decision source:** Q41, Q51–Q54, Q174–Q188

**Owner / approving role:** Security/Privacy + Backend; Privacy approves

**Requirement:** Stores, queries, UI payloads, exports, integrations, audit, and operations tooling MUST receive only approved fields necessary for the purpose.

**Acceptance evidence:** Server-to-client serialization, SQL projections, provider payloads, exports, logs, and support views pass field-allowlist/canary inspection.

**Failure / rollback behavior:** Reject over-broad fields at the server boundary and disable the affected projection/destination until minimized.

**Blocked dependencies:** Approved field/purpose allowlists for each profile, policy, export, destination, and support view are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### NFR-005 — Encryption and keys
**Scope:** V1, BC

**Decision source:** Q100–Q105, Q174–Q188

**Owner / approving role:** Security/Privacy + Platform/Operations; Architecture approves

**Requirement:** All stores, replicas, backups, and transport MUST use approved encryption; designated high-sensitivity fields/files MUST use managed envelope encryption with versioned key references and rotation/recovery procedures.

**Acceptance evidence:** Provider configuration read-back, TLS checks, raw-store/backup canary inspection, tamper/wrong-tenant/disabled-key tests, rotation, restore, and key-loss exercises pass. No master key exists in source, `.env`, logs, tests, or rows.

**Failure / rollback behavior:** Fail encrypt/decrypt and alert; never store or return plaintext, embedded keys, or cross-plane fallback.

**Blocked dependencies:** Precise production key hierarchy, field/file designation, IAM, rotation, recovery, and covered service configuration are `BLOCKED`.


#### NFR-006 — Regional isolation and residency truthfulness
**Scope:** V1, BC

**Decision source:** Q32, Q98–Q99, Q106–Q114

**Owner / approving role:** Platform/Operations + Security/Privacy; executive risk owner approves

**Requirement:** Pro-US MUST use US primary `us-east4` and DR `us-east1`; Pro-Canada MUST use Canadian primary `northamerica-northeast2` and DR `northamerica-northeast1`, with workload and recovery/archive projects separated.

**Acceptance evidence:** IaC and provider API read-back prove configured resources and flows; cross-region/cross-plane routes deny unless explicitly approved. Public claims accurately describe transfers and do not claim a nonexistent GCP Vancouver/BC-only region.

**Failure / rollback behavior:** Block cross-plane/cross-region movement; use manual same-country recovery only after declared review.

**Blocked dependencies:** Production plane configuration/read-back, identity/control-plane/support transfer review, and exact residency/public-claim wording are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### NFR-007 — Availability, recovery, and commercial claims
**Scope:** V1, BC

**Decision source:** Q98–Q105, Q158, Q194–Q206

**Owner / approving role:** Platform/Operations; Product and executive risk owner approve commercial use

**Requirement:** Internal availability, RTO, and RPO targets MUST be approved, measured, and exercised per profile; they MUST NOT be represented as commercial SLAs until separately approved.

**Acceptance evidence:** Synthetic backup restore and manual whole-region failover exercises meet internal targets with reconciliation. Customer copy contains no unapproved SLA.

**Failure / rollback behavior:** Remain on internal-target status, stop launch/claim advancement after failed exercises, and do not publish an SLA.

**Blocked dependencies:** Internal SLO/RTO/RPO targets and any commercial SLA/credit wording are `OWNER_APPROVAL_REQUIRED`.


#### NFR-008 — Performance and capacity
**Scope:** V1, BC

**Decision source:** Q37, Q40, Q56, Q158, Q194–Q206

**Owner / approving role:** Architecture + QA/Assurance; Product approves profile thresholds

**Requirement:** The release MUST meet approved response-time, concurrency, batch, file, and recovery targets at or above each customer operating envelope without weakening authorization/audit behavior.

**Acceptance evidence:** Synthetic load results include normal, peak, degraded dependency, tenant-noisy-neighbor, batch, export, and restore cases; exact thresholds remain profile-approved inputs.

**Failure / rollback behavior:** Hold activation or envelope expansion at the last evidenced capacity; do not shed authorization, audit, or integrity controls.

**Blocked dependencies:** Exact performance thresholds and customer operating envelopes are `OWNER_APPROVAL_REQUIRED`.


#### NFR-009 — Accessibility
**Scope:** ALL user-visible web

**Decision source:** Q194–Q206

**Owner / approving role:** Frontend/UX + QA/Assurance; Product approves

**Requirement:** Provider, patient, public, and operational web surfaces MUST meet WCAG 2.2 AA for enabled journeys.

**Acceptance evidence:** Automated checks plus keyboard, focus, screen-reader, zoom/reflow, contrast, error, timeout, upload, table, dialog, and 390px/tablet/desktop manual evidence pass with no unresolved critical/serious issue.

**Failure / rollback behavior:** Block release of the affected journey until critical/serious issues are resolved and evidence rerun.


#### NFR-010 — Localization readiness
**Scope:** V1 foundation, later languages profile-gated

**Decision source:** Q75, Q144–Q154, Q194–Q206

**Owner / approving role:** Product/Localization + Legal/Privacy; Product owner approves

**Requirement:** User-visible text, dates, times, numbers, addresses, names, and policy/version content MUST be locale-aware and not embedded in irreversible business logic.

**Acceptance evidence:** Locale fixtures, long-string/reflow tests, timezone boundaries, and versioned legal-content selection pass. Translation does not alter approved legal meaning without review.

**Failure / rollback behavior:** Fall back only to an approved locale/content version; block unreviewed legal-text translation.

**Blocked dependencies:** Enabled languages and approved legal translations are `OWNER_APPROVAL_REQUIRED`/`COUNSEL_REVIEW_REQUIRED`.


#### NFR-011 — Browser and telemetry privacy
**Scope:** ALL

**Decision source:** Q108–Q114, Q194–Q206

**Owner / approving role:** Security/Privacy + Frontend/Backend; QA/Assurance approves

**Requirement:** Classified data MUST NOT leak to URLs, query strings, Referer, browser storage, third-party scripts, analytics, console, caches, screenshots/traces, or downloaded filenames outside an approved path.

**Acceptance evidence:** Playwright canary inspection covers storage, cookies, console, network, responses, redirects, Referer, Cache API, service workers, downloads, screenshots, and traces for every critical journey.

**Failure / rollback behavior:** Block the leaking path, purge only approved ephemeral artifacts, rotate exposed secrets if any, and rerun canary evidence.


#### NFR-012 — File safety
**Scope:** V1

**Decision source:** Q42, Q54, Q102, Q188, Q194–Q206

**Owner / approving role:** Security/Privacy + Backend; QA/Assurance approves

**Requirement:** File ingestion and delivery MUST fail closed around type, size, scan, quarantine, integrity, authorization, cache, and content-disposition failures.

**Acceptance evidence:** EICAR/approved malware fixtures, polyglots, mismatched MIME/header, malformed files, active content, timeout, scanner outage, replay, and download-header tests pass.

**Failure / rollback behavior:** Quarantine or reject; revoke unsafe delivery and keep evidence for review.

**Blocked dependencies:** Production scanner/vendor/configuration and agreements are `BLOCKED`.


#### NFR-013 — Reliability and idempotency
**Scope:** ALL

**Decision source:** Q66–Q67, Q174–Q188, Q194–Q206

**Owner / approving role:** Backend + Database; Architecture approves

**Requirement:** High-risk writes, webhooks, jobs, exports, migrations, releases, and disposition actions MUST use idempotency, concurrency control, durable intent/outcome, bounded retry, and reconciliation.

**Acceptance evidence:** Duplicate, reordered, concurrent, partial-failure, crash/restart, timeout, and provider-retry tests produce one correct terminal state and complete audit evidence.

**Failure / rollback behavior:** Preserve an uncertain/pending state and reconcile before retry; never infer provider success or duplicate effects.


#### NFR-014 — Safe schema and data migration
**Scope:** ALL

**Decision source:** Q68–Q69, Q117–Q121, Q194–Q206

**Owner / approving role:** Database + Backend; QA/Assurance approves

**Requirement:** Database/storage changes MUST be additive and use expand/migrate/contract, synthetic rehearsal, backup, row/hash reconciliation, and rollback/forward-fix plans. Applied migration history MUST NOT be rewritten.

**Acceptance evidence:** Fresh deploy, upgrade deploy, old/new application compatibility where planned, interrupted backfill, rollback/forward fix, and restore tests pass on disposable environments.

**Failure / rollback behavior:** Stop migration/backfill, preserve compatible state, reconcile, and use an approved forward fix or isolated restore.


#### NFR-015 — Supply-chain and deployment integrity
**Scope:** ALL

**Decision source:** Q108–Q114, Q194–Q206

**Owner / approving role:** Platform/Operations + Security/Privacy; Architecture approves

**Requirement:** Builds MUST use reviewed dependencies, locked artifacts, vulnerability/malware scanning, provenance, isolated secrets, least-privilege promotion, and environment-specific configuration.

**Acceptance evidence:** CI produces immutable artifact identity/SBOM/provenance and blocks critical policy violations; deployment read-back matches the approved candidate and no production secret appears in build artifacts/logs.

**Failure / rollback behavior:** Block promotion and retain the last approved artifact/configuration; rotate any exposed secret.

**Blocked dependencies:** Production build/promotion configuration, covered services, and approvals are `BLOCKED`.


#### NFR-016 — Observability without PHI
**Scope:** ALL

**Decision source:** Q108–Q114, Q194–Q206

**Owner / approving role:** Platform/Operations + Security/Privacy; QA/Assurance approves

**Requirement:** Logs, metrics, traces, alerts, and health metadata MUST be structured, allowlisted, regional as approved, and free of PHI/clinical payloads and secrets.

**Acceptance evidence:** Synthetic canaries and raw backend queries find no prohibited values; operational failures remain diagnosable by correlation IDs and stable codes.

**Failure / rollback behavior:** Disable the emitting path or field and keep operations diagnosable through approved codes; never log payload as fallback.

**Blocked dependencies:** Production logging/monitoring destinations, regional configuration, retention, vendor agreements, and evidence access are `BLOCKED`/`COUNSEL_REVIEW_REQUIRED`.


#### NFR-017 — Evidence traceability
**Scope:** ALL

**Decision source:** Q38, Q165–Q166

**Owner / approving role:** QA/Assurance + Security/Privacy; executive risk owner approves status

**Requirement:** Every release control MUST distinguish `SPECIFIED`, `IMPLEMENTED`, `TECHNICALLY_VERIFIED`, `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, `APPROVED_FOR_PROFILE`, `BLOCKED`, and `NOT_APPLICABLE`.

**Acceptance evidence:** The release manifest links requirement, control, test, owner, evidence, configuration, policy, approver, date, expiry/review date, and exact artifact/deployment identity. No status is inferred from another.

**Failure / rollback behavior:** Keep the status at its last evidenced state and block gate advancement when metadata/evidence is missing or stale.

**Blocked dependencies:** Protected evidence system, named reviewers, retention, and approval metadata are `BLOCKED`.


#### NFR-018 — Safe activation and rollback
**Scope:** ALL

**Decision source:** Q38, Q165–Q166, Q189–Q206

**Owner / approving role:** Architecture + Platform/Operations; Product and Security/Privacy approve

**Requirement:** Modules and customer profiles MUST activate through validated, fail-closed configuration with staged rollout and a tested disable/rollback path that preserves records, audit, rights deadlines, holds, and custody.

**Acceptance evidence:** Synthetic enable, partial enable, failed enable, disable, application rollback, configuration rollback, and regional rollback exercises complete without broadening access or losing evidence.

**Failure / rollback behavior:** Disable or roll back the affected module/profile configuration while preserving records, audit, rights, holds, and custody.

**Blocked dependencies:** Exact profile, legal/policy inputs, vendors/agreements, production configuration, operating envelope, evidence package, and named approvers are `BLOCKED` until separately approved.


#### NFR-019 — Human operational readiness
**Scope:** V1, BC

**Decision source:** Q17–Q19, Q34, Q133–Q143

**Owner / approving role:** Operations + Security/Privacy; executive risk owner approves

**Requirement:** Launch MUST have named Security/Privacy lead and Security Official, incident owner, executive risk owner/signatory, independent second approver, qualified jurisdictional counsel, and independent assessor, plus approved policies, screening, training, sanctions, on-call, vendor review, insurance review, and evidence storage.

**Acceptance evidence:** Current role assignments, training/policy acknowledgments, escalation tests, tabletop exercises, vendor reviews, and approval records exist. Missing humans or exercises block activation.

**Failure / rollback behavior:** Keep runtime production/profile activation `REVIEW_BLOCKED` and the applicable release gate `BLOCKED` until named humans, policies, training, exercises, and reviews exist.

**Blocked dependencies:** Named accountable humans, qualified counsel, independent assessor, policies, training, on-call, insurance, and exercises are `BLOCKED`.


#### NFR-020 — No production claims from implementation evidence alone
**Scope:** ALL

**Decision source:** Q17–Q19, Q38, Q75, Q165–Q166

**Owner / approving role:** Product + Legal/Privacy + Security/Privacy; executive risk owner approves

**Requirement:** Product copy, sales material, contracts, status pages, and internal release records MUST distinguish technical capability from legal review, operational evidence, and approved profile claims.

**Acceptance evidence:** Legal, Security/Privacy, executive, and product reviewers approve exact claim wording for the exact configuration; automated content inventory finds no broader unapproved claim.

**Failure / rollback behavior:** Remove or block unapproved wording and revert to the last approved claims set; technical evidence alone cannot advance status.

**Blocked dependencies:** Exact public/contractual claims and commercial wording are `COUNSEL_REVIEW_REQUIRED`/`OWNER_APPROVAL_REQUIRED`.


## 4. Pro-US v1 release acceptance

A Virginia profile may reach `APPROVED_FOR_PROFILE` only when all applicable V1/ALL requirements above are satisfied and the roadmap launch gate confirms:

1. the exact customer/entity classification, specialty/use case, responsibility matrix, and agreements;
2. approved US vendors, regions, destinations, policy catalogs, CIAM, and support model;
3. complete minimum safe journey: activation, identity, patient self-service, scheduling, intake/consent/forms, chart, finalized notes/amendments, controlled files, medication/allergy/history, direct pay, eligibility, portal sharing, rights, retention/holds/offboarding, audit/incidents, and US operations;
4. layered automated, negative tenant/auth, clinical-integrity, migration, load, accessibility, infrastructure read-back, restore/failover, incident, supply-chain, and rollback evidence;
5. no deferred route/job/integration enabled;
6. operating envelope, internal SLO/RTO/RPO, support, on-call, and incident owners exercised;
7. unresolved inputs represented as blockers, not assumptions; and
8. named Product, Engineering, Database, Security/Privacy, Operations, QA, counsel, independent assessor, and executive approval of the exact candidate/profile.

## 5. BC private-clinic release acceptance

BC does not inherit Virginia approval. In addition to applicable ALL/V1 requirements, the BC lane requires:

1. a qualified-counsel-approved BC private-clinic applicability profile and policy catalog;
2. isolated Canadian data, backup, key, log, workload, and recovery/archive configuration;
3. explicit review of identity/control-plane/support and every cross-border transfer;
4. Canadian vendor, agreement, incident, rights, retention, representative-authority, and notice inputs;
5. Canadian restore/failover, access, support, transfer, and offboarding exercises; and
6. negative proof that public bodies, health authorities, E-Health Act participants, insurers, and government contractors remain disabled unless separately approved.

## 6. Deferred requirement entry criteria

A deferred module may enter an active roadmap milestone only when Product names the user journey and profile demand; Legal/Privacy resolves applicability and data authority; Security approves threats and controls; Procurement approves vendor and agreements; Architecture approves the smallest integration boundary; Operations accepts support/incident/recovery duties; QA defines synthetic acceptance and regression; and the owner approves scope and commercial treatment.

## 7. Open owner/expert inputs

The following remain blockers where applicable and MUST NOT be invented:

- first activated Virginia and BC specialty/customer profiles;
- exact entity/customer classifications;
- retention schedules, consent/authorization text, rights deadlines, breach rules, and representative-authority rules;
- patient CIAM provider and identity residency/support commitments;
- production email, eligibility, calendar, clearinghouse, lab, pharmacy, PACS/RIS, telehealth, malware, and later integration vendors;
- executed Google/customer/subprocessor agreements and precise covered configurations;
- BC public-sector and other separately gated requirements;
- pricing, support promises, commercial SLA/credits, and operating-envelope defaults;
- insurance limits/exclusions;
- internal performance/availability/RTO/RPO targets; and
- exact public privacy/security/compliance claim wording.

## 8. Traceability

- Product/market/module scope and exclusions: `product-spec.md`.
- Approved decisions and blockers: `decision-register-and-open-items.md`.
- Release milestones, dependencies, evidence, and rollback: `roadmap.md`.
- Package precedence/status: `README.md`.
- Planned architecture and control detail: `system-design.md`, `security-privacy-architecture.md`, `data-classification-and-flows.md`, and `control-and-evidence-matrix.md`, each governed by its stated status and required reviews.
