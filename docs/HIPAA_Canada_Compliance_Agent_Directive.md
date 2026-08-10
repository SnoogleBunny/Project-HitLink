# Implementation Directive: HIPAA & Canadian Health Privacy Compliance Remediation

**Document type:** Agent-ingestible implementation prompt
**Scope:** Backend services, APIs, databases/data stores, frontend, data retention and lifecycle management
**Jurisdictions:** United States (HIPAA) and Canada (PIPEDA + applicable provincial health privacy statutes)
**Intended consumer:** An AI coding/architecture agent tasked with reviewing the current codebase, producing a remediation plan, and executing a full end-to-end implementation

---

## GOAL

Bring the web application's backend services, API layer, data stores, and frontend into compliance with:

1. **HIPAA** (Privacy Rule, Security Rule, Breach Notification Rule) for all US-based covered-entity customers and their patient data, given this application operates as a **HIPAA Business Associate**.
2. **Canadian federal and provincial health privacy law**, specifically:
   - **PIPEDA** (Personal Information Protection and Electronic Documents Act) — federal baseline for private-sector organizations handling personal information, including health information, in the course of commercial activity.
   - **Provincial "substantially similar" private-sector laws** that displace PIPEDA intra-provincially: Alberta PIPA, British Columbia PIPA, and Quebec's private-sector law (as modernized by **Law 25**).
   - **Provincial health-specific statutes** governing "Health Information Custodians" (HICs) and their service providers: Ontario's **PHIPA**, New Brunswick's **PHIPAA**, Nova Scotia's **PHIA**, and Newfoundland and Labrador's **PHIA**. Other provinces without a dedicated health-privacy statute default to PIPEDA for private-sector health data.

**Important framing for the agent:** Canada has no single nationwide equivalent to HIPAA. Compliance is a layered determination based on (a) which province(s) the app's covered users/custodians operate in, (b) whether data crosses provincial or national borders, and (c) whether the organization is acting as a service provider to a Health Information Custodian (analogous to, but not legally identical to, a HIPAA Business Associate). Where jurisdiction-specific legal interpretation is required and cannot be resolved from code/config alone, the agent must flag it for human legal review rather than assume an answer.

The end state: every process that creates, stores, transmits, or deletes health-related personal data does so through a common, auditable, access-controlled, encrypted pathway, with jurisdiction-appropriate consent, retention, and breach-response mechanisms in place.

---

## CONTEXT

This application is used by healthcare and health-adjacent professionals (e.g., physiotherapists, counselors/therapists, and potentially non-clinical roles such as life coaches) to manage and transmit patient/client data. Prior internal review established:

- The application likely qualifies as a **HIPAA Business Associate** for any US covered-entity customer, carrying direct HIPAA liability independent of the customer (per the HITECH Omnibus Rule).
- In Canada, the application likely qualifies as a **service provider/agent to a Health Information Custodian** for customers who are HICs (physicians, clinics, regulated health professionals), and separately must meet PIPEDA/provincial private-sector obligations for personal information generally.
- Not all customer types are necessarily covered under HIPAA or provincial health-privacy statutes (e.g., non-licensed life coaches) — but may still be subject to PIPEDA (broad definition of "personal information," applies regardless of "health" framing) and, in the US, FTC Health Breach Notification Rule and state consumer health data laws.
- The current architecture has **not yet been audited** for: PHI/personal-information data classification, field-level encryption, audit logging coverage, access control granularity, retention/deletion automation, or cross-border data flow controls.
- The codebase spans backend API services, one or more relational/document data stores, and a frontend client application.

The agent is expected to treat this document as the source of truth for scope and sequencing, but must perform its own codebase discovery — this document does not assume specific file paths, frameworks, or schema names, since those are not yet known to the author of this directive.

---

## INSTRUCTIONS

### Phase 0 — Discovery and Data Classification (must complete before any code changes)

1. Enumerate every data model/table/collection/schema in the codebase.
2. For each field, classify as:
   - **PHI/PI-Health** (identifies a person and relates to health, treatment, or payment — triggers HIPAA if a US covered entity is involved, and triggers provincial health-privacy statutes if a Canadian HIC is involved)
   - **PI-General** (personal information not health-specific — still in scope for PIPEDA/provincial private-sector law, and for HIPAA if it is one of the 18 HIPAA identifiers combined with health context)
   - **Non-personal** (de-identified, aggregate, or genuinely non-identifying)
3. Produce a **data inventory document** (data map) listing: field name, classification, storage location, encryption status, who/what can access it, retention period, and every downstream system it flows to (third-party APIs, logging, analytics, backups).
4. Identify every outbound data flow: third-party services, subprocessors, cross-border transfers (explicitly flag any data that crosses the Canada–US border, or leaves Quebec, since Quebec's Law 25 requires a privacy impact assessment before personal information is sent outside Quebec).
5. Identify the jurisdiction(s) of the application's actual and prospective customers (US states, Canadian provinces) — this determines which statutory regime(s) apply per customer/tenant.
6. Output: a written data classification report and outbound-flow diagram, reviewed against this directive before Phase 1 begins.

### Phase 1 — Backend Services and API Layer

1. **Establish a single data-access layer (repository pattern)** through which all PHI/PI-Health reads, writes, and deletes must pass. No route handler, controller, or service should query the PHI-containing data store directly.
2. **Implement audit logging middleware** that automatically fires on every request passing through the PHI data-access layer, capturing: actor identity, action, resource type/ID, timestamp, outcome (success/denied/failure), source IP, and (where feasible) the legal basis/purpose of access. Logs must be append-only/immutable and stored separately from mutable application data.
3. **Implement deny-by-default authorization** (RBAC or ABAC) at the API layer, enforced before any handler executes business logic. Every permission grant should be explicit; nothing should be implicitly readable.
4. **Enforce authentication requirements**: unique credentials per user (no shared/service accounts for human users), session timeout on inactivity, and multi-factor authentication for any account with access to PHI/PI-Health.
5. **Sanitize all logging, error-tracking, and monitoring pipelines** to strip PHI/PI-Health fields before they reach third-party tools (error trackers, APM, analytics). Build this as a shared utility applied at the log-emission boundary, not per call site.
6. **Eliminate PHI/PI-Health from URLs and query strings** in all API routes; move identifiers currently in GET query parameters to path parameters or POST bodies where the sensitivity warrants it, and confirm these are excluded from access/proxy logs.
7. **Implement field-level encryption** for the highest-sensitivity fields identified in Phase 0 (e.g., clinical/psychotherapy notes, government ID numbers), using a managed key service (not application-embedded keys). Confirm transport-layer encryption (TLS 1.2+) is enforced on all internal and external API traffic, with no fallback to unencrypted transport.
8. **Build jurisdiction-aware consent and disclosure handling**: PIPEDA and provincial private-sector laws center on the concept of **meaningful, informed consent** as a foundational principle, distinct from HIPAA's treatment/payment/operations framework. The backend must be able to represent, per customer/tenant, which consent model applies and enforce corresponding disclosure/use restrictions.
9. **Build breach-detection hooks**: anomalous access pattern detection (e.g., bulk export, access outside normal hours/geography) that feeds into an incident-response trigger, satisfying both HIPAA's Breach Notification Rule (60-day individual notification, HHS notification thresholds) and PIPEDA's requirement to report breaches posing a **real risk of significant harm** to the Office of the Privacy Commissioner of Canada and affected individuals, plus any applicable provincial equivalent (e.g., Ontario PHIPA's own notification obligations to the Information and Privacy Commissioner of Ontario).
10. **Implement patient/client rights endpoints**: access requests, amendment requests, and accounting-of-disclosures (HIPAA), plus the Canadian equivalent — an individual's right to access and request correction of their personal information under PIPEDA/provincial law. These should be built as defined, auditable API flows, not manual/support-ticket processes.
11. **Cross-border data flow controls**: implement an explicit allowlist of destinations personal/health data is permitted to flow to, keyed by the data's jurisdiction of origin. Any flow that would move Quebec-originated personal information outside Quebec must trigger a documented privacy-impact-assessment requirement before being enabled, per Quebec Law 25. Flag (do not silently permit) any Canada-to-US or US-to-Canada data transfer path for legal review.

### Phase 2 — Database and Data Store Changes

1. Apply encryption at rest across all data stores (managed encryption at minimum; field-level encryption per Phase 1 §7 for highest-sensitivity fields).
2. Restructure schemas so PHI/PI-Health fields are clearly segregated (e.g., separate tables/collections or clearly namespaced fields) to make classification enforceable in code review and automatable in access-control policy.
3. Add **retention metadata** to every PHI/PI-Health-bearing record (creation date, applicable retention period, scheduled review/deletion date) — retention periods must be configurable per jurisdiction, since US state medical-record retention law and Canadian provincial requirements differ and neither is uniform.
4. Implement automated retention-enforcement jobs (archival or deletion per policy) rather than relying on manual cleanup.
5. Ensure backups are encrypted, access-restricted, and included in the same classification/retention framework as primary data (a common gap: primary data is protected but backups are not).
6. Ensure any data replication, caching layer, or search index that contains PHI/PI-Health inherits the same encryption, access control, and audit logging as the primary store — these are common places PHI leaks into unprotected paths.

### Phase 3 — Frontend Changes

1. Ensure the frontend never logs PHI/PI-Health to browser console, client-side error trackers (e.g., Sentry browser SDK), or client-side analytics — apply the same field-level redaction principle as the backend logging sanitizer.
2. Enforce session timeout and re-authentication in the client to match backend session policy; do not allow indefinite client-side session persistence for PHI-accessing sessions.
3. Ensure PHI/PI-Health is never persisted in browser local storage, session storage, or unencrypted client-side caches beyond the active session's needs.
4. Implement UI-level least-privilege rendering: the frontend should only request/display fields the authenticated user's role is permitted to see, mirroring backend authorization — this reduces accidental over-fetching and display of PHI.
5. Build (or surface) UI flows for the patient/client rights endpoints from Phase 1 §10, and for jurisdiction-appropriate consent capture at account/record creation (informed consent language should differ appropriately for HIPAA-context vs. PIPEDA/PHIPA-context users if the application serves both).
6. Ensure any client-side analytics or third-party embedded scripts (chat widgets, support tools) are configured to never receive PHI/PI-Health fields, and confirm this technically (not just by configuration intent) via code review or automated testing.

### Phase 4 — Retention, Deletion, and Data Management Structures

1. Document, per jurisdiction and data type, the retention period and legal basis (e.g., HIPAA documentation retention vs. US state medical-record law vs. Canadian provincial health-record retention requirements) — this cannot be a single global constant.
2. Note explicitly that under both HIPAA and most Canadian health-privacy statutes, patients/clients generally **cannot demand deletion of their full clinical record** on request the way some general consumer-privacy laws allow — deletion mechanisms must respect statutory retention minimums, not just user preference.
3. Build a deletion/archival workflow that checks applicable retention rules before executing any delete, and logs the outcome (deleted, archived, or retention-blocked) to the audit trail.
4. Build a documented process for handling account/tenant offboarding (a customer organization leaving the platform) that ensures their data is retained, exported, or deleted per the applicable jurisdiction's rules, not simply deleted on account closure.

### Phase 5 — Cross-Jurisdiction Tenant Configuration

1. Implement a per-tenant (per customer organization) jurisdiction flag/config that determines: applicable statutory regime(s), consent model, retention defaults, and permitted data-flow destinations.
2. Ensure the application can support a tenant that is simultaneously subject to multiple regimes (e.g., a Canadian clinic with US patients, or a platform-level company subject to PIPEDA for cross-border transfers even where a province's "substantially similar" law otherwise applies intra-provincially).
3. Where the agent cannot determine, from code or configuration alone, which regime applies to a given tenant or record, this must be surfaced as an open question for human/legal resolution — do not default silently to the least restrictive regime.

### Phase 6 — Monitoring, Recurring Processes, and Documentation

1. Stand up a recurring (at minimum annual) automated reminder/process for re-running the Security Risk Analysis (HIPAA) and reviewing the data inventory/classification (Phase 0) for drift as the schema evolves.
2. Ensure every subprocessor/third-party integration identified in Phase 0 has a corresponding signed Business Associate Agreement (US) or equivalent data-processing agreement (Canada) tracked in a config/inventory the agent can validate against at build or deploy time (e.g., failing a build if a new integration touches PHI without a corresponding entry in the BAA/DPA registry).
3. Produce written, versioned documentation of every safeguard implemented in Phases 1–5, suitable for presentation in a compliance audit or OCR/regulator inquiry.

---

## ACCEPTANCE CRITERIA

- [ ] A complete, reviewed data classification inventory exists covering every field in every data store, with PHI/PI-Health/PI-General/Non-personal tags.
- [ ] No PHI/PI-Health-bearing database query occurs outside the designated data-access/repository layer (verifiable by static analysis or code search).
- [ ] Every request touching PHI/PI-Health generates an immutable audit log entry containing actor, action, resource, timestamp, and outcome.
- [ ] Authorization is deny-by-default; no endpoint returns PHI/PI-Health without an explicit, testable permission check.
- [ ] MFA and session timeout are enforced for all accounts with PHI/PI-Health access.
- [ ] No PHI/PI-Health field appears unredacted in any log, error-tracking payload, analytics event, or URL/query string, verified by automated scanning of logs and outbound telemetry.
- [ ] Encryption at rest (managed, minimum) and field-level encryption (for the highest-sensitivity fields identified in Phase 0) are implemented and verifiable.
- [ ] Retention metadata exists on all applicable records, and automated jobs enforce retention/deletion per jurisdiction-specific policy without manual intervention.
- [ ] Patient/client rights endpoints (access, amendment, accounting-of-disclosures/equivalent) exist, are authenticated, and are logged.
- [ ] A tenant-level jurisdiction configuration exists and demonstrably changes consent, retention, and data-flow behavior for at least one US-context tenant and one Canada-context tenant.
- [ ] Cross-border and cross-provincial data flows are enumerated, allowlisted, and any Quebec-origin outbound flow is gated behind a documented privacy-impact-assessment flag.
- [ ] A subprocessor/BAA-DPA registry exists and blocks (or flags) any integration touching PHI/PI-Health that lacks a corresponding signed agreement record.
- [ ] All frontend telemetry, storage, and third-party embeds are confirmed (via test, not just configuration) to exclude PHI/PI-Health.
- [ ] Written documentation of all implemented safeguards is produced and versioned alongside the code.
- [ ] Every point where jurisdiction-specific legal interpretation was required and could not be resolved from code/config has been explicitly logged as an open item for human legal review, not silently resolved.

---

## CONSTRAINTS

- Do not delete, restructure, or migrate production data containing PHI/PI-Health without a tested backup and rollback plan.
- Do not use real production PHI/PI-Health in development, staging, or test environments under any circumstances; use synthetic data generation for all non-production testing of these flows.
- Do not silently choose a legal interpretation where ambiguity exists (e.g., which province's law governs a given tenant, whether a customer is a covered entity/HIC) — surface it for human decision.
- Do not treat "HIPAA compliant hosting" or any vendor's compliance marketing claim as sufficient on its own; verify actual configuration and confirm a signed BAA/DPA exists.
- Do not implement a single global retention/deletion policy; retention must be configurable per jurisdiction and data type.
- Do not assume Canada has a single unified law equivalent to HIPAA; treat Canadian compliance as a layered, tenant-jurisdiction-dependent determination (PIPEDA + applicable provincial private-sector law + applicable provincial health-privacy statute).
- Do not remove or weaken any existing safeguard as a side effect of refactoring; each phase's changes must be independently reviewable and revertible.
- Do not proceed to Phase 2+ implementation until the Phase 0 data classification report has been produced and is available for reference throughout subsequent phases.
- This directive does not constitute legal advice or a substitute for review by a healthcare/privacy compliance attorney qualified in both the applicable US state(s) and Canadian province(s); flagged legal-interpretation items must be routed to such review before production deployment of the affected feature.

---

## TESTING

1. **Static analysis**: automated scan confirming no direct database access to PHI/PI-Health tables/collections outside the designated repository layer.
2. **Log redaction tests**: automated tests that submit requests containing known PHI/PI-Health values and assert those values never appear unredacted in application logs, error-tracker payloads, or analytics events.
3. **Authorization tests**: for every role defined in the system, automated tests asserting which PHI/PI-Health fields/endpoints are accessible and which are correctly denied (positive and negative cases for each role).
4. **Audit log completeness tests**: for every PHI/PI-Health-touching endpoint, an automated test confirming a corresponding audit log entry is created with the required fields populated.
5. **Encryption verification**: automated or manual verification that data at rest is encrypted (e.g., inspecting raw storage) and that field-level encrypted values are not stored in plaintext anywhere (including backups and logs).
6. **Session/MFA enforcement tests**: automated tests confirming session expiry after the configured timeout and confirming MFA is required before PHI/PI-Health access is granted.
7. **Retention/deletion job tests**: automated tests simulating records at various ages relative to jurisdiction-specific retention periods, confirming correct archival/deletion/retention-hold behavior.
8. **Cross-border flow tests**: automated tests asserting that data tagged with a Quebec or otherwise restricted origin cannot be transmitted to a disallowed destination without the required flag/approval being set, and that any Canada–US or interprovincial flow triggers the expected logging/flagging.
9. **Patient/client rights endpoint tests**: end-to-end tests exercising access, amendment, and accounting-of-disclosures (or Canadian equivalent) requests, confirming correct data returned, correct audit logging, and correct authentication requirements.
10. **Subprocessor registry enforcement test**: a build-time or CI test confirming that any new outbound integration touching PHI/PI-Health fails the build unless a corresponding BAA/DPA registry entry exists.
11. **Frontend storage/telemetry audit**: automated or manual inspection of browser storage, network requests, and third-party script payloads during a representative user session, confirming no PHI/PI-Health is present outside the intended authenticated API calls.
12. **Regression pass**: full existing test suite re-run after each phase to confirm no functional regression was introduced by the compliance refactor, with particular attention to any behavior change in data visibility caused by new authorization rules.
13. **Manual review checkpoint**: before production deployment, a human review of the Phase 0 data classification report, the list of flagged legal-interpretation open items, and the subprocessor/BAA-DPA registry, since these three artifacts cannot be fully validated by automated testing alone.

---

*This directive is derived from a prior compliance overview and backend architecture guide covering HIPAA (US) requirements, supplemented with current research on the Canadian health-privacy framework (PIPEDA, provincial "substantially similar" laws including Quebec's Law 25, and provincial health-specific statutes such as Ontario's PHIPA). It is written for consumption by an implementation agent and does not replace review by qualified legal counsel in each relevant jurisdiction before production release.*
