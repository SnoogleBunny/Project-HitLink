# Flowstate Pro gated roadmap

**Status:** DRAFT — OWNER_APPROVAL_REQUIRED  
**Sequence:** documentation and controls → Virginia synthetic validation → Virginia approved pilot → Virginia profile expansion → BC private clinics → competitor-parity waves  
**Decision baseline:** Q1–Q206, confirmed 2026-08-24  
**Last updated:** 2026-08-26

## 1. Purpose

This roadmap sequences Flowstate Pro from approved planning artifacts to narrowly approved production profiles. It defines milestone scope, entry dependencies, exit gates, required evidence, and rollback/disable expectations. Product identity and module scope live in `product-spec.md`; testable behavior lives in `product-requirements-document.md`.

No target date overrides a gate. Calendar and staffing estimates remain OWNER_APPROVAL_REQUIRED until scope owners, expert dependencies, and capacity are confirmed. No milestone authorizes production deployment by itself.

## 2. Release principles

1. **Virginia first; BC second.** BC repeats profile, legal, vendor, regional, operational, and evidence gates rather than inheriting Virginia approval.
2. **Broad design, narrow activation.** Architecture may support many specialties/customer classes; only named approved profiles activate.
3. **Minimum safe journey first.** Pro-US v1 ships one complete clinical journey before optional parity modules.
4. **Patient self-service is core.** Patient identity, scheduling, intake/forms, released records, payment, security/proxy, and rights workflows are launch scope, not an afterthought.
5. **Separate means separate.** No Standard migration, downgrade, shared identity/session/data/billing, or regulated feature flag inside Standard.
6. **Evidence advances status.** Specification, implementation, technical verification, operational exercise, legal review, and profile approval are distinct.
7. **Unknown fails closed.** Missing legal values, agreements, vendors, policy, identity assurance, region, destination, evidence, owner, or operating envelope blocks dependent activation.
8. **Disabled before incomplete.** Deferred modules have no usable route, job, credential, webhook, or UI until their gate completes.
9. **Rollback preserves duties.** A rollback must not broaden access, mutate finalized history, delete audit, violate holds/retention, lose rights deadlines, or abandon custody.
10. **Synthetic before regulated data.** Development, tests, screenshots, demos, rehearsals, and initial staging use synthetic data.

## 3. Gate and evidence model

### 3.1 Status progression

Each milestone and applicable requirement progresses independently:

`DRAFT` → `SPECIFIED` → `IMPLEMENTED` → `TECHNICALLY_VERIFIED` → `OPERATIONALLY_EXERCISED` → `EVIDENCE_COMPLETE` → `LEGALLY_REVIEWED` → `APPROVED_FOR_PROFILE`

`BLOCKED`, `NOT_APPLICABLE`, and `SUPERSEDED` require reason, owner, date, affected profile, and evidence/decision reference. No status is inferred from another.

### 3.2 Common exit-gate checklist

Every milestone exit requires, as applicable:

- exact source commit/artifact, schema, IaC, configuration, policy, vendor, and profile versions;
- requirement/control/test/owner/evidence traceability;
- focused and full regression output on the exact candidate;
- negative tenant, role, patient, authority, MFA, policy, destination, and module tests;
- migration fresh/upgrade/backfill/reconciliation and rollback/forward-fix evidence;
- desktop, tablet, 390px, keyboard, screen-reader, and WCAG 2.2 AA evidence for changed UI;
- infrastructure/provider read-back rather than intended configuration alone;
- load/capacity evidence against the operating envelope;
- restore, failover, incident, support, and module rollback exercises where affected;
- current blockers and non-applicability decisions;
- named reviewer decisions and approval expiry/review date; and
- precise wording that does not convert technical evidence into a compliance claim.

### 3.3 Minimum approving roles

- Product owner.
- Engineering/architecture owner.
- Database owner.
- Security/Privacy lead and Security Official.
- Operations/incident owner.
- QA owner.
- Qualified Virginia or BC counsel as applicable.
- Independent assessor/reviewer.
- Executive risk owner/signatory.
- Independent second approver for designated high-risk gates.

Named individuals, delegation rules, and segregation of duties are required before the relevant production gate.

### 3.4 Rollback classes

- **R0 — Document rollback:** supersede/revise planning text; record conflict and approvals.
- **R1 — Feature disable:** fail-closed configuration removes entry points/jobs/credentials while preserving records/audit.
- **R2 — Application rollback:** deploy last approved compatible artifact; preserve newer schema/data and use forward fix where necessary.
- **R3 — Data migration recovery:** expand/migrate/contract compatibility, stop worker, reconcile, forward fix, or restore under an approved runbook; never rewrite applied history.
- **R4 — Tenant/profile suspension:** stop new regulated activity for the named tenant/profile while preserving required clinical continuity, rights, custody, holds, export, and incident obligations.
- **R5 — Regional recovery:** manual whole-region activation from tested backups, keys, configuration, and audit continuity; reconcile before normal operations.

## 4. Milestone overview

| Milestone | Outcome | Production regulated data? | Primary gate |
|---|---|---:|---|
| M0 | Product/control dossier approved for implementation | No | Owner + expert planning approval |
| M1 | Isolated Pro foundation and control plane | No | Architecture/security foundation verified |
| M2 | Minimum clinical and patient journey implemented | No | End-to-end synthetic functional verification |
| M3 | Pro-US operational assurance in synthetic staging | No | Evidence-complete Virginia candidate |
| M4 | First approved Virginia pilot | Yes, narrowly approved | Customer/profile launch approval |
| M5 | Virginia profile expansion and scale | Yes, per profile | Repeatable profile approval |
| M6 | BC private-clinic readiness and pilot | Yes, after separate approval | BC legal/regional/profile approval |
| M7 | Parity Wave 1: clinic operations and communications | Per enabled profile | Journey-specific gate |
| M8 | Parity Wave 2: clinical networks and interoperability | Per enabled profile | Vendor/network/standards gate |
| M9 | Parity Wave 3: payer, specialty, and enterprise depth | Per enabled profile | Commercial/profile-specific gate |

## 5. M0 — Product and control dossier approval

**Target status:** `SPECIFIED`  
**Production posture:** prohibited

### Scope

- Approve `product-spec.md`, PRD, roadmap, decision register, and package precedence.
- Complete system/security architecture, legal applicability, data classification/flows, control/evidence, operations/governance, and dated competitor-parity documents.
- Inventory Standard implementation only to prove separation and identify the small set of reviewed shareable data-free primitives.
- Resolve or explicitly block first-profile legal, vendor, policy, staffing, commercial, and claims inputs.
- Define initial Virginia profile candidates and BC private-clinic candidate lane without activating either.

### Entry dependencies

- Approved Q1–Q206 decision baseline.
- Current Standard code/schema/product inventory available read-only.
- Named Product owner and reviewers for the planning package.

### Exit gate

- The package is internally consistent with the decision register and does not claim current compliance or implementation.
- Product owner approves Virginia-first/BC-second, broad-profile/narrow-activation, patient self-service, v1/deferred scope, commercial boundaries, and staged Jane/Epic parity.
- Architecture confirms full Standard/Pro separation and minimal sharing.
- Counsel/Privacy owns every unresolved legal value; Procurement owns vendor/agreement decisions; Security/Operations owns human and operating controls.
- Every unresolved dependency maps to a blocked requirement/milestone.
- Work packets are bounded, synthetic-data-only, and sequenced behind gates.

### Required evidence

- Reviewed document manifest with owner, reason, source, affected profiles, effective date, superseded text, and approvals.
- Conflict/decision log and blocker register.
- Requirement-to-control-to-milestone traceability.
- Initial data/domain/flow and threat inventories.
- Dated Jane.app/Epic benchmark method and initial journey registry.

### Rollback/stop

Use R0. If documents conflict, stop implementation, mark affected work `BLOCKED`, and resolve through the precedence rules. No implementation assumption may bridge a missing expert determination.

## 6. M1 — Isolated Pro foundation and control plane

**Target status:** `TECHNICALLY_VERIFIED`  
**Production posture:** prohibited; synthetic development/test only

### Scope

- Separate provider web, patient web, dedicated API/standards gateway, Pro schema/package, identity/session boundary, and US/Canada deployment definitions.
- Tenant integrity, RLS, trusted transaction context, controlled repositories, central authorization/policy, append-only audit, safe logging, correlation, and durable operation intent/outcome.
- Versioned organization/applicability profiles, destination/agreement registry, legal-policy references, activation state machine, feature gates, and evidence registry.
- Approved CIAM integration foundation, MFA/session/recovery controls, Flowstate managed workforce identity, JIT support control, and no standing clinical access.
- Governed file metadata/object storage/quarantine pipeline; encryption/KMS; secret management; PHI-free observability.
- Separate Pro Stripe configuration boundary without enabling patient payment until M2.
- IaC for US primary/DR and Canada primary/DR, but only approved non-production environments are created.

### Entry dependencies

- M0 exit approved.
- Architecture, threat model, data classes, region design, and control matrix specified.
- Patient CIAM, malware/file, cloud, audit, monitoring/logging, and key-management vendor/configuration decisions approved for non-production use.
- Named engineering, database, security, operations, and QA owners.

### Exit gate

- FR-001–FR-014 foundation behavior and NFR-001–NFR-006, NFR-011–NFR-018 pass where applicable.
- Standard credentials/sessions/data/billing cannot resolve in Pro; Pro cannot import Standard domain runtime code.
- Unknown tenant/role/policy/profile/destination/module states deny.
- Cross-tenant relational, job, file, webhook, and restored-copy tests pass.
- Audit is append-only and PHI-free; audit outages follow the approved fail-closed matrix.
- IaC/API read-back proves environment/region/project/key/store separation.
- All incomplete business modules remain disabled.

### Required evidence

- Source/dependency boundary report and negative separation tests.
- Fresh/upgrade migration logs and RLS/tenant adversarial suite.
- Identity/MFA/session/recovery and JIT support test results.
- Audit permission/completeness/outage and safe-log canary results.
- Encryption, TLS, KMS, storage, backup, and secret configuration read-back.
- CI artifact provenance/SBOM/scanning output.
- Feature-gate read-back showing every M2+ module disabled.

### Rollback/stop

Use R1–R3. Disable affected foundation capability and stop dependent work. Database changes remain additive; use compatible application rollback or forward fix. Never roll back by restoring shared Standard components, bypassing RLS/policy/audit, or deleting audit history.

## 7. M2 — Minimum clinical and patient journey

**Target status:** `TECHNICALLY_VERIFIED`  
**Production posture:** prohibited; synthetic data only

### Scope

Build the complete Pro-US v1 functional journey:

1. reviewed organization/admin activation and white-label setup;
2. workforce, patient, guardian/proxy invitation, MFA, recovery, sessions, and authority;
3. patient profile, security/proxy management, scheduling, intake/consent/forms;
4. provider scheduling, patient administration, encounters, longitudinal chart;
5. medications, allergies, history, draft/final note, amendment/late entry;
6. controlled clinical file upload, scan, quarantine, version, release, and download;
7. provider-controlled portal release and patient released-record access;
8. separate Pro direct-pay and approved eligibility workflow;
9. rights center and privacy processing queues;
10. policy-driven retention, holds, report-only disposition, offboarding/export;
11. approved initial external clinical migration connector, if required by the first profile; and
12. incident workflow, signals, and support operations.

### Entry dependencies

- M1 exit approved.
- Counsel-approved test versions of consent/authorization, representative authority, rights, retention, disclosure, and incident policy inputs.
- Approved payment, eligibility, email, and file vendors/configurations for synthetic sandbox use.
- First Virginia profile hypothesis names required data classes and modules.

### Exit gate

- Applicable FR-015–FR-043 and NFR requirements pass end to end with synthetic users and tenants.
- Patient self-service succeeds for adult, minor/guardian, proxy, expiry/revocation, and age-of-majority cases.
- Finalized clinical records cannot be mutated; complete amendment lineage survives concurrency and restore tests.
- Unscanned/malicious/unapproved files fail closed; DICOM remains disabled.
- Payment/eligibility, export, migration, webhooks, workers, and record release are idempotent and reconciled.
- Commercial suspension preserves required access/custody and triggers no destructive cascade.
- Deferred modules have no usable route/job/webhook/credential/UI.
- Full critical journey meets WCAG 2.2 AA and browser/telemetry canary requirements.

### Required evidence

- Requirement-level unit, integration, PostgreSQL, route/action, and Playwright reports.
- UI captures/checklists for provider, patient, proxy, privacy, activation, and support roles at desktop/tablet/390px.
- Clinical-integrity, cross-tenant, cross-patient, proxy-authority, and release negative matrices.
- File malware/quarantine and safe download evidence.
- Stripe/eligibility destination minimization, webhook, and reconciliation evidence.
- Rights/export/offboarding manifests and lifecycle/hold report-only evidence.
- Synthetic migration preview/cutover/reconciliation if in scope.
- Deferred-module disablement report.

### Rollback/stop

Use R1–R3. Disable a failed module and its routes/jobs/credentials without exposing partial records. Preserve clinical/audit history. Stop disposition at report-only. Payment rollback must reconcile provider truth. Failed migration returns to the reviewed pre-cutover state or uses a forward fix; never conceal partial imports.

## 8. M3 — Pro-US synthetic staging and operational assurance

**Target status:** `EVIDENCE_COMPLETE` for a named Virginia candidate profile  
**Production posture:** no regulated production data

### Scope

- Deploy the exact candidate to isolated US synthetic staging.
- Validate activation/configuration, complete clinical journey, capacity, backup/restore, manual region failover, incident/tabletop, JIT support, offboarding, key/audit outages, and deployment rollback.
- Complete vendor configuration/agreement evidence, policies, workforce training, screening/sanctions, on-call, insurance review, risk analysis, penetration testing, and independent assessment.
- Approve exact public/customer claim wording but do not publish or sell beyond the authorized state.

### Entry dependencies

- M2 exit approved.
- Named Virginia customer/specialty candidate, operating envelope, support model, and responsibility matrix.
- Production-intended vendors/configurations selected; agreements and legal review available.
- Named accountable humans and independent assessor.

### Exit gate

- Exact Virginia profile has resolved entity/customer classification, legal/policy inputs, agreements, vendors, destinations, and data classes.
- Full verification passes on the exact artifact/configuration.
- Load test meets the operating envelope without bypassing controls.
- US restore/failover meets approved internal RTO/RPO with audit, key, file, database, and configuration reconciliation.
- Incident, breach-assessment, audit outage, key compromise, lost export, vendor incident, and support-access exercises complete.
- Penetration/independent findings are remediated or formally risk-accepted by authorized humans.
- Claims, support promises, and commercial terms are approved for the exact profile.

### Required evidence

- Immutable release manifest and all common gate evidence.
- Provider/IaC API read-back for US workload and recovery/archive projects, regions, database, storage, keys, logs, backups, WAF, secrets, and access groups.
- Restore/failover timings and reconciliation.
- Capacity/load and degradation results.
- Incident/tabletop, support/JIT, training, on-call, and offboarding exercise records.
- Vendor/agreement metadata and counsel approvals; contracts remain outside the repo.
- Independent assessment and remediation/risk acceptance references.
- Exact approved claim/commercial copy and review chain.

### Rollback/stop

Use R1–R5. Any failed control returns the candidate to `BLOCKED` or the prior status. Synthetic staging can be reset after evidence retention. No production activation occurs to “learn” around a failed exercise.

## 9. M4 — First approved Virginia pilot

**Target status:** `APPROVED_FOR_PROFILE` for one named customer/profile/configuration  
**Production posture:** narrowly approved regulated data

### Scope

- Activate one specifically approved Virginia customer/profile within its operating envelope.
- Enable only the Pro-US v1 modules evidenced in M3.
- Execute controlled onboarding, patient invitations, initial clinical migration if approved, support, monitoring, reconciliation, and early-life review.
- Hold deferred modules disabled.

### Entry dependencies

- M3 `EVIDENCE_COMPLETE` for the exact candidate.
- Executed customer/downstream agreements and organization/applicability classification.
- Production access, on-call, incident, custody, support, privacy, and executive approvals.
- Customer admin and workforce verification/training complete.
- Approved migration/cutover plan or explicit no-migration decision.

### Exit gate

The pilot may leave heightened monitoring only after:

- activation evidence matches deployed configuration and profile;
- initial patient/clinical journeys complete safely;
- migration, if any, reconciles and is accepted without unresolved critical discrepancy;
- audit completeness, destination reconciliation, backup, rights, and support queues remain healthy;
- operating envelope remains valid;
- all incidents/control deviations are closed or accepted by named owners; and
- owner, Security/Privacy, Operations, counsel, QA, and executive approve continuation.

### Required evidence

- Activation manifest and deployed read-back.
- Customer verification/training/responsibility references.
- Initial journey/audit/reconciliation metrics without PHI in the dossier.
- Migration manifest/hashes/reconciliation and staging destruction if applicable.
- Support/JIT records, incidents/deviations, capacity, backup, and vendor health.
- 7/30/60-day review checkpoints, or owner-approved evidence-based alternatives; dates are operational reviews, not automatic gates.

### Rollback/stop

Use R1, R2, R4, or R5 based on impact. A control failure triggers immediate module disable or tenant/profile suspension while preserving legally/emergency-required access, records, rights deadlines, holds, custody, incident response, and export capability. Do not move the customer to Standard.

## 10. M5 — Virginia profile expansion and scale

**Target status:** `APPROVED_FOR_PROFILE` per added profile/customer  
**Production posture:** approved Virginia profiles only

### Scope

- Convert pilot operations into a repeatable profile-approval package.
- Add Virginia specialties/customer classes one at a time.
- Increase per-customer operating envelopes only from measured capacity/support evidence.
- Improve core v1 workflow quality, accessibility, portability, and implementation burden before adding major modules.
- Establish periodic evidence renewal and control-drift monitoring.

### Entry dependencies

- M4 pilot continuation approved with no unresolved blocker that generalizes.
- At least one complete operating evidence period chosen by Security/Privacy and Product.
- Profile delta analysis template and owner capacity plan.

### Exit gate for each profile

- Delta analysis covers legal applicability, data classes, workflows, specialty needs, representative authority, vendors/destinations, retention, rights, incident, migration, support, and commercial terms.
- Existing controls are revalidated; profile-specific gaps are implemented and exercised.
- Capacity/support envelope and claims are approved.
- Approval is attached only to the exact profile/configuration and review period.

### Required evidence

- Pilot lessons and remediation closure.
- Per-profile delta/control/evidence package.
- Trend data for journey completion, audit health, support burden, incidents, rights, backups, and capacity.
- Recurring access, vendor, risk, policy, training, restore, incident, and evidence reviews.

### Rollback/stop

Use R1/R4 per profile. A failed new profile does not automatically suspend unaffected approved profiles, but shared-control impact must be assessed immediately. Roll back envelope increases to the last evidenced level.

## 11. M6 — British Columbia private-clinic readiness and pilot

**Target status:** `APPROVED_FOR_PROFILE` for one named BC private-clinic profile  
**Production posture:** Canadian regulated data only after separate approval

### Scope

- Complete BC private-clinic legal/applicability and customer responsibility profiles.
- Deploy/read back isolated Canada workload and recovery/archive projects in `northamerica-northeast2` primary and `northamerica-northeast1` DR.
- Approve Canadian vendors, agreements, identity/control-plane/support transfers, policies, claims, incident, rights, retention, representative authority, and offboarding.
- Re-run the full v1 journey, patient self-service, accessibility, capacity, restore/failover, support, and incident evidence in Canada.
- Activate one named BC private clinic only after the complete gate.

### Entry dependencies

- M4 completed; M5 may proceed in parallel only where it does not consume required owners/capacity.
- Qualified BC counsel, Canadian Security/Privacy/Operations review, independent assessment, and approved private-clinic candidate.
- Canadian CIAM/support/residency and vendor answers resolved.

### Exit gate

- FR-044 and all applicable PRD requirements pass for the exact BC profile.
- Canadian data, backups, keys, and logs are located/configured as approved; every identity/control-plane/support/cross-border transfer is explicitly recorded and approved.
- Public bodies, health authorities, E-Health Act participants, insurers, and government contractors remain blocked.
- No BC-only/Vancouver-region hosting claim is made.
- Canadian restore/failover, incident, rights, offboarding, support, and profile suspension exercises complete.

### Required evidence

- BC counsel-approved applicability/policy/responsibility package.
- Canada IaC/provider read-back and cross-border flow/transfer assessment.
- Canadian vendor/agreement and support-access metadata.
- Complete synthetic evidence plus pilot activation evidence equivalent to M3/M4.
- Negative activation tests for excluded BC lanes.

### Rollback/stop

Use R1–R5 in the Canadian plane. Suspend the BC tenant/profile without shifting data or service to US infrastructure unless a separately approved emergency/legal plan permits it. Preserve custody, rights, holds, incident, audit, and export obligations.

## 12. M7 — Competitor parity Wave 1: clinic operations and communications

**Target status:** `APPROVED_FOR_PROFILE` per journey/module  
**Production posture:** optional, separately enabled

### Candidate journeys

- Secure messaging.
- Telehealth integration.
- Enhanced scheduling, waitlist/recall, forms, reminders, and workflow automation.
- Multilingual patient communication and accessibility depth.
- Improved direct-pay and patient estimate experience.
- Specialty templates that do not require external clinical networks.

### Entry dependencies

- Stable core operating evidence from M4; Product may require M5 scale evidence for broad rollout.
- Dated Jane.app/Epic journey benchmark and verified customer demand.
- Approved message/telehealth/email vendors, agreements, data flows, retention, recording policy, support, and incident controls.

### Exit gate

- Each journey has a bounded profile, PRD addendum, threat/data-flow review, control mapping, acceptance metrics, and disable path.
- Messaging/telehealth content is classified, encrypted, minimized, audited, retained, and accessible as approved.
- The module improves the benchmarked journey without weakening core controls or creating hidden clinical records.

### Evidence and rollback

Retain journey benchmark, usability/accessibility results, provider configuration, negative tests, incident/support exercises, and performance evidence. Use R1 to disable the module per profile; preserve message/visit records and lifecycle duties.

## 13. M8 — Competitor parity Wave 2: clinical networks and interoperability

**Target status:** `APPROVED_FOR_PROFILE` per integration  
**Production posture:** optional, separately enabled

### Candidate journeys

- Expanded standards gateway and approved FHIR-oriented exchange.
- Lab ordering/results and referrals.
- Medication/e-prescribing network integration.
- Imaging/PACS/RIS integration and DICOM workflow.
- Broader governed external clinical migration connectors.
- Approved health-information exchange connections.

### Entry dependencies

- M7 not universally required, but M4 core and sufficient M5 operational maturity are required.
- Named network/vendor, conformance scope, contracts, credentialing, data authority, destination, residency/transfer, reconciliation, downtime, and support decisions.
- Specialty/profile demand that justifies each connection.

### Exit gate

- Integration is a gateway to an external core, not a reimplementation of PACS/LIS/pharmacy/exchange infrastructure.
- Resource/operation scope, patient matching, consent/authority, idempotency, provenance, reconciliation, correction, downtime, and revocation are tested.
- DICOM remains outside ordinary upload storage.
- One integration cannot authorize another; each is separately enabled and approved.

### Evidence and rollback

Retain conformance suites, sandbox/production certification references, patient-match tests, destination/audit reconciliation, downtime exercises, and data-flow read-back. Use R1 to disable outbound/inbound credentials and queues; reconcile in-flight work and preserve received clinical provenance/history.

## 14. M9 — Competitor parity Wave 3: payer, specialty, and enterprise depth

**Target status:** `APPROVED_FOR_PROFILE` per product lane  
**Production posture:** optional; highest commercial and operational gate

### Candidate journeys

- Claims, remittance, denial, and revenue-cycle workflows.
- Insurer-connected and separately approved payer automation.
- Multi-location organizations.
- Public-sector, health-authority, E-Health Act, government-contracting, and other separately governed profiles.
- Dedicated tenant projects/databases as a separately priced profile.
- Native mobile applications.
- Advanced specialty packs.
- Clinical AI only under a separate safety, evidence, human-oversight, regulatory, and claims program.

### Entry dependencies

- Proven M5/M6 operating maturity and sufficient support/security capacity.
- Executive business case, pricing, SLA, liability/insurance, procurement, legal, security, architecture, and operations approval.
- Dated parity gap showing the journey is material to the named market.

### Exit gate

- Each lane has a separate product/PRD/architecture/control addendum and does not inherit approval from lower waves.
- Financial, clinical-safety, availability, interoperability, and human-review risks are addressed with profile-specific evidence.
- Multi-location does not weaken tenant/location/policy integrity.
- Clinical AI cannot autonomously finalize records, make undisclosed decisions, or bypass provider review; exact scope requires separate approval.

### Evidence and rollback

Retain full financial/clinical reconciliation, profile-specific independent assessment, disaster recovery, support/on-call, claims, and contractual evidence. Use R1/R4/R5; financial rollback reconciles external payer/provider truth, and clinical AI disablement preserves provenance and human workflow continuity.

## 15. Cross-milestone competitor parity management

Parity is a maintained evidence process, not a one-time feature checklist.

For each Jane.app or Epic benchmark journey, the parity registry must record:

- source URL/artifact, observation date, product/tier/context, and confidence;
- target role, specialty, jurisdiction, and end-to-end user outcome;
- Flowstate current state and verified gap;
- `v1`, Wave 1, Wave 2, Wave 3, deferred, rejected, or not-applicable decision;
- reason, customer evidence, risk/control dependencies, owner, and next review date;
- testable acceptance measure and release evidence; and
- differentiation opportunity in privacy controls, portability, standards, workflow quality, accessibility/localization, payer automation, or implementation burden.

Benchmark evidence expires on a review cadence approved by Product. Epic’s full enterprise catalog and every Jane.app feature are explicitly outside any single launch gate.

## 16. Dependencies and critical path

### 16.1 Blocking expert/procurement inputs

- Exact Virginia and BC applicant classifications and first specialty profiles.
- Counsel-approved consent/authorization, rights, retention, breach, disclosure, and representative-authority inputs.
- Patient CIAM and identity residency/passkey/recovery/support commitments.
- Cloud, email, malware, eligibility, payment, and future integration vendor configurations and agreements.
- BC private/public-sector, health-authority, E-Health Act, insurer, and government-contracting determinations.
- Cyber/E&O insurance limits and exclusions.
- Pricing, operating envelopes, internal SLO/RTO/RPO, commercial SLA/credits, support promises, and claims wording.
- Named accountable humans and independent assessor capacity.

### 16.2 Technical critical path

`M0 decisions` → `M1 separation/tenant-policy-audit-identity-storage foundation` → `M2 complete clinical/patient journey` → `M3 US operational evidence` → `M4 Virginia pilot`.

BC requires M1/M2 reusable code plus its own legal/vendor/regional M3-equivalent evidence before M6 activation. Parity waves depend on stable M4 core evidence; integrations and enterprise lanes require greater M5/M6 operational maturity.

### 16.3 Work that may proceed in parallel

After M0 approval, bounded teams may work in isolated worktrees on independent M1 foundations, documentation, synthetic fixtures, and read-only verification tooling. Work may not merge across a dependency gate until the upstream contract and evidence are approved. Legal/vendor investigation can proceed throughout but cannot be replaced by code.

## 17. Evidence retention and roadmap reporting

For every milestone, the release dossier records:

- scope/profile/configuration and explicit exclusions;
- requirement/control status counts generated from the registry, not hand-calculated;
- exact artifact/deployment/policy/vendor versions;
- tests/exercises performed, environment, time, owner, output, and exceptions;
- open blockers, risk acceptances, expiry/review dates, and rollback readiness;
- customer operating envelope and measured capacity where applicable; and
- approved claims and forbidden broader interpretations.

Roadmap reporting must never describe `IMPLEMENTED` as `EVIDENCE_COMPLETE`, or one approved customer/profile as universal production readiness.

## 18. Owner approvals requested

Before this roadmap advances from `DRAFT`, the product owner must approve:

1. no-date, gate-first sequencing;
2. M0–M4 as the Virginia critical path;
3. M6 as a separately approved BC private-clinic lane;
4. patient self-service and complete minimum safe journey before parity expansion;
5. M7–M9 competitor parity waves and the explicit rejection of full-catalog launch parity;
6. per-profile operating envelopes instead of universal customer caps;
7. commercial suspension/offboarding rollback boundaries; and
8. the rule that no gate or claim is satisfied by code/tests alone.

## 19. Source alignment

- Approved product decisions and blockers: `decision-register-and-open-items.md`.
- Product identity, target market, modules, exclusions, and commercial boundaries: `product-spec.md`.
- Numbered functional/non-functional requirements and acceptance: `product-requirements-document.md`.
- Package precedence/status vocabulary: `README.md`.
- Detailed work-packet precedent: `../../plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`, subject to the newer decision register where they conflict.
