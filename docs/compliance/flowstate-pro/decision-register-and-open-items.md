# Flowstate Pro decision register and open items

**Status:** APPROVED PRODUCT/ARCHITECTURE DECISIONS; WP0.3 is complete; WP0.4 implementation is technically verified and awaiting independent reviews and human acceptance; legal, vendor, policy, accountable-human, evidence, and production approvals remain `BLOCKED`; G0 remains `BLOCKED`; WP1.x is unauthorized

**Interview:** Q1–Q206, confirmed 2026-08-24

This register records the resolved design tree. Question ranges are retained so later reviewers can trace why a decision exists. Recommendations accepted without exception are binding planning inputs. Explicit user changes and supersessions are recorded below.

## A. Product identity and separation

| Questions | Decision |
|---|---|
| Q1–Q4 | Standard and Pro are distinct customer applications. Pro is a regulated clinical product; Standard is an MMA/fitness product that contractually and technically prohibits regulated clinical records/PHI. |
| Q5–Q8 | Virginia launches first; BC is a separately gated fast follow. Target a compliant operating state, but legal applicability, human safeguards, evidence, and public claims require named approval. Produce a detailed implementation/control dossier for counsel and assessors. |
| Q9 | Full production separation: deployments, projects, databases, storage, backups, keys, logs, monitoring, secrets, vendors, access groups, credentials, sessions, and CI/CD promotion. |
| Q10–Q11 | One monorepo initially. Share only reviewed data-free primitives and pure utilities. Existing applications are Standard; Pro is new. |
| Q20–Q21 | One legal entity initially, with separate Pro terms, privacy notice, BAA, service description, vendor register, compliance program, and contracting. Pro has distinct origins and browser/session boundaries. Corporate separation is a future counsel decision. |
| Q27, Q50 | SUPERSEDED in part: there is no Standard-to-Pro migration. Any later migration is from external clinical systems through a governed Pro migration service. |

## B. Market, customer profiles, and activation

| Questions | Decision |
|---|---|
| Q12, Q24 | SUPERSEDED by Q41/Q51: Pro’s target scope includes full clinical records, not only administrative intake. Delivery remains phased and modules cannot activate before their controls are complete. |
| Q13–Q15 | No self-service regulated activation. Verify organization, legal status, customer type, use case, jurisdiction, data flow, and contracts. A public landing page collects only minimal business-contact/application data. |
| Q25–Q26 | Classify each customer as Covered Entity, Business Associate, neither, or unresolved, plus Canadian/customer-specific roles. Unresolved tenants cannot activate. Activation is an explicit reviewed sequence. |
| Q30 | Required customer BAAs and downstream BAAs are fail-closed production gates; registry stores metadata/evidence references, not authoritative contracts. |
| Q37, Q40, Q56 | SUPERSEDED fixed universal caps: no hard-coded user/patient limits. Each pilot has a documented operating envelope based on seats, patients, documents, storage, support, and tested capacity. |
| Q39, Q49, Q51–Q58 | Broad white-label target: SLP, physiotherapy, chiropractic, mental health, imaging, life coach, public/private, insurer, and other health-related customers. Use separately approved customer/applicability profiles. Broad roadmap support never means universal activation. |
| Q57 | BC private clinics are the first Canadian activation lane. Public bodies, health authorities, E-Health Act participants, insurers, and government contractors require separate gates. |
| Q157 | Demos/trials use synthetic data. PHI-capable evaluations require full activation gates. |

## C. Product lifecycle and commercial boundaries

| Questions | Decision |
|---|---|
| Q16 | The same email may appear in Standard and Pro only as unrelated identities with separate credentials, MFA, recovery, sessions, and records. |
| Q28, Q131 | Pro cannot downgrade into Standard. Offboarding separates commercial cancellation from record custody, access, retention, export, legal holds, integrations, and destruction. |
| Q31 | Pro has separate Stripe configuration/account boundary, webhook secrets, products/prices, customer objects, access, and reconciliation. |
| Q38, Q165–Q166 | Maintain a versioned control dossier throughout implementation. Distinguish specification, implementation, verification, operating evidence, legal review, profile approval, blockers, and non-applicability. |
| Q155, Q168 | Active workforce identities are seats. Active patient records are a separate volume metric. Guardians/proxies are associated with patients. Suspended/deactivated workforce accounts are not active seats. Optional usage can be separately approved add-ons. |
| Q156 | Nonpayment cannot delete records or block legally/emergency-required access; it enters a controlled suspension/offboarding state. |
| Q158 | Availability/RTO/RPO are internal targets until commercial SLA terms receive executive, legal, operations, and pricing approval. |

## D. Data scope, clinical integrity, and files

| Questions | Decision |
|---|---|
| Q41, Q51–Q54 | Pro may support complete clinical and administrative records. High-risk categories such as SSN/SIN, government IDs, biometrics, genetics, diagnoses, treatments, and unrestricted narratives are disabled by default and enabled only with approved purpose, authority, security, access, and retention. |
| Q42, Q54, Q188 | Clinical files use controlled types, malware scanning, quarantine, classification, provenance, patient/encounter linkage, lifecycle, immutable versions, and append-only amendments. DICOM/PACS is a separately gated integration, not ordinary upload storage. |
| Q62, Q147, Q197 | Draft clinical content may be edited. Finalized records are immutable; changes are linked amendments/late entries with author, time, reason, prior version, signatures, and audit. Patient-reported information remains distinct from clinician-verified information. |
| Q68–Q69 | Regulated aggregate roots carry lifecycle/policy references; central versioned policy, hold, and lifecycle-event registries provide governance. No uncontrolled destructive cascades across regulated roots. |
| Q102, Q188 | Store file bodies in governed Cloud Storage, not PostgreSQL blobs. PostgreSQL stores metadata, hashes, classification, lifecycle, and references. |

## E. Users, identity, access, and patient self-service

| Questions | Decision |
|---|---|
| Q22, Q60 | Pro roles: ORGANIZATION_ADMIN, PROVIDER, CLINICAL_SUPPORT, ADMINISTRATIVE_STAFF, BILLING_STAFF, PRIVACY_OFFICER, PATIENT, GUARDIAN_OR_PROXY. Standard roles are not reused. |
| Q47 | Organization admins are manually verified; workforce and patient accounts are invitation-controlled. Workforce requires MFA and step-up. |
| Q59, Q127–Q128, Q150 | Support adults, minors, guardians, proxies, substitute decision-makers, and representatives through explicit scoped authority, evidence, dates, expiry/revocation, age-of-majority transition, and audit. |
| Q63 | Tenant-clinician break-glass is narrow, time-limited, MFA-protected, audited, notified, and reviewed. Flowstate staff do not get clinical break-glass. |
| Q89–Q93 | Configurable security-owned session ceilings; initial workforce idle/absolute 15 minutes/12 hours, patient 30 minutes/24 hours, privileged step-up 5 minutes. MFA for workforce and patients. Separate managed Flowstate workforce identity and JIT privileged access. |
| Q144–Q154 | Patients can log in, maintain approved data, schedule, complete intake/consent/forms, view released records, pay, manage security/proxies, and submit rights requests. Clinic-issued invitation remains required. High-risk identity changes require review. |

## F. Consent, rights, retention, disclosure, and legal process

| Questions | Decision |
|---|---|
| Q61 | A tenant-specific responsibility matrix assigns record custody/control, rights decisions, retention, legal holds, and Flowstate service-provider duties. |
| Q64, Q70 | Policy resolution uses verified organization status, customer type, service location, patient residence where relevant, record origin, care relationship, payer/public-body involvement, contract, destination, and approved overrides. Purpose/legal-authority catalogs are counsel/privacy owned. |
| Q115, Q122 | Consent, HIPAA authorization, acknowledgement, contract acceptance, and non-consent legal authority are distinct versioned records. Withdrawal is prospective and does not erase lawful history. |
| Q116, Q123–Q126, Q154 | Pro accepts authenticated rights requests, applies risk-based verification, profile-specific deadlines, customer authority decisions, amendment/appeal workflows, secure fulfilment, and legally scoped disclosure accounting separate from the security audit. |
| Q117–Q118, Q129–Q130 | Retention is profile/record/age/provider/jurisdiction/contract specific and counsel-approved. Unknown policy blocks destruction and triggers review. Legal holds are scoped, independently controlled, and audited. Backups expire/reconcile truthfully rather than promising immediate mutation. |
| Q119–Q120 | Offboarding exports include human-readable and structured formats, manifests, hashes, reconciliation, secure transfer, and staging destruction. Subpoenas/warrants/regulator/law-enforcement demands route through Legal/Privacy. |
| Q121 | Legal-policy configuration is versioned, validated, reviewed, staged, tested, audited, and rollback-aware; tenant admins cannot author legal rules. |

## G. Audit, incidents, operations, and human safeguards

| Questions | Decision |
|---|---|
| Q17–Q19, Q33 | Public HIPAA-compliance language requires completed technical, contractual, legal, operational, assessment, remediation, counsel, Security/Privacy, and executive gates. Final review is pre-production, not a post-launch substitute. |
| Q18, Q34 | Missing human roles, policies, training, incidents, device rules, sanctions, contracts, or risk acceptance are blockers, not assumed complete. |
| Q35, Q63, Q93 | No routine Flowstate access to patient data. Exceptional support access is JIT, scoped, time-limited, MFA/device protected, approved, audited, revoked, and reviewed. |
| Q66–Q67, Q185 | Audit security-significant actions with request/operation correlation and no PHI payload. High-risk operations require durable intent and outcome; audit outage fails closed except approved emergency mode. |
| Q94–Q97, Q132 | Automated signals feed human incident command. Legal/Privacy determines reportability and notification. Preserve separate discovery/containment/notice clocks and minimal chain-of-custody evidence. No informal exceptions. |
| Q133–Q143 | Minimum accountable humans: internal Security/Privacy lead and Security Official, incident owner, executive signatory/risk owner, independent second approver; external Virginia/BC counsel and independent assessor. Policies, screening, annual training, sanctions, on-call escalation, vendor reviews, risk analysis, penetration testing, insurance review, and protected evidence storage are launch requirements. |

## H. Architecture and infrastructure

| Questions | Decision |
|---|---|
| Q32, Q98–Q99 | Separate Pro-US and Pro-Canada data planes. US primary `us-east4`, DR `us-east1`; Canada primary `northamerica-northeast2`, DR `northamerica-northeast1`. Each has workload and recovery/archive projects. No GCP Vancouver region; do not claim BC-only hosting. |
| Q88, Q180 | Default shared regional database with tenant IDs, composite integrity, PostgreSQL RLS, trusted transaction context, tenant repositories, and cross-tenant tests. Dedicated tenant projects/databases are separately priced/approved profiles. |
| Q100–Q105 | Cloud Run modular monolith; regional load balancer/Cloud Armor; Cloud SQL HA/PITR/DR; Cloud Storage; KMS/CMEK; Secret Manager; immutable backup/audit stores after policy approval. Defer GKE/global active-active/HSM unless requirements justify them. |
| Q106–Q107 | Cloud Identity for Flowstate workforce. Patient CIAM remains BLOCKED pending residency, passkey, recovery, support, and BAA answers. Canadian target boundary includes configurable data, backups, keys, and logs; identity/control-plane/support are explicit transfer-review items. |
| Q108–Q114 | PHI-free logs/metrics/metadata; regional logging/WORM export; defer SIEM pending contract; manual whole-region DR activation; synthetic non-production data; Cloud Build/Artifact Registry/Artifact Analysis; fail-closed malware pipeline; calendar sync disabled by default and payload-minimal. |
| Q173–Q177 | Pro provider web, patient web, and dedicated API modular monolith; separate Pro Prisma package/schema; one Pro codebase deployed to isolated regions; validated tenant/white-label configuration registry. |
| Q174–Q188 | Web apps cannot access Prisma/vendor SDKs/policy internals. Central policy and repositories; REST workflow API plus separate standards gateway; idempotency/concurrency; transactional outbox; destination gateway; envelope encryption; controlled file pipeline. |

## I. Competitor parity and roadmap scope

| Questions | Decision |
|---|---|
| Q71–Q74 | Jane/Epic parity is a versioned roadmap, not one launch gate. Benchmark verified clinic journeys, not Epic’s entire enterprise catalog. Differentiate through privacy controls, portability, standards, workflow quality, multilingual/accessibility, payer automation, and lower implementation burden. |
| Q75 | Market concrete privacy-by-design controls; do not guarantee universal compliance. |
| Q76–Q87 | Later modules: secure messaging, telehealth, medication/e-prescribing, lab/referral, imaging/PACS integration, claims/revenue cycle, standards APIs, external clinical migration, multi-location, native mobile, clinical AI, and specialty profiles. Integrate external networks/systems rather than rebuilding PACS/LIS/pharmacy/payer cores. |
| Q189–Q193 | Pro-US v1 is the minimum safe clinical journey: activation, identities, patient self-service, scheduling, intake/consent/forms, longitudinal chart, notes/amendments, controlled files, medication/allergy/history, direct pay, eligibility, portal sharing, rights, retention/holds/offboarding, audit/incidents, and US GCP operations. Deferred modules remain disabled. Expansion requires evidence review and approval. |

## J. Documentation, implementation authority, and verification

| Questions | Decision |
|---|---|
| Q159–Q172 | Directive is the concise mandate; detailed plan is the implementation authority; this package contains living product/PRD/roadmap/design/legal/data/control/operations/competitor/decision documents. Standard docs stay unchanged except listed future sync tasks. |
| Q162–Q164 | Phase 0 permits discovery/docs/read-only verification tooling in isolated worktrees. The AI cannot choose vendors, legal values, agreements, claims, production credentials, deployments, or human approvals. |
| Q194–Q206 | Require layered automated tests, negative tenant/auth tests, profile tests, clinical integrity, migration safety, synthetic load, UI screenshots, WCAG 2.2 AA, IaC read-back, restore/failover/incident exercises, supply-chain gates, safe feature activation/rollback, and precise non-compliance wording. |

## Explicitly superseded statements

1. Pro is only an administrative practice-management product — superseded by the full clinical-record target.
2. Virginia pilot must use one provider category — superseded by broad target profiles with individually gated activation.
3. Pilot has universal hard organization/user/patient caps — superseded by per-customer operating envelopes.
4. Standard may upgrade/migrate into Pro — superseded; no Standard-to-Pro migration.
5. BC first cohort automatically includes every public/private class — superseded by broad architecture plus separate activation lanes.
6. All Pro clinical data/document types are prohibited — superseded by controlled, purpose-gated clinical data and file workflows.
7. Phase 0 is documentation-only — superseded by discovery, documentation, and non-production verification tooling.

## BLOCKED expert, procurement, and owner inputs

- Exact customer/entity classification per Virginia and BC applicant.
- Approved retention schedules, consent/authorization text, rights deadlines, breach rules, and representative-authority rules.
- Patient CIAM provider and identity residency/support commitments.
- Email, calendar, clearinghouse, lab, pharmacy, PACS/RIS, telehealth, malware, and future integration vendors.
- Executed Google/customer/subprocessor agreements and precise covered configurations.
- BC public-sector, health-authority, E-Health Act, insurer, and government-contracting requirements.
- Cyber/E&O insurance limits and exclusions.
- Pricing, contractual SLAs, support promises, and commercial credits.
- First activated specialty/customer profiles.
- Exact public privacy/HIPAA/PIPEDA claim wording.

## WP0.1 evidence snapshot — 2026-09-22

This is a repository-evidence record, not a new product decision or Gate G0 approval.

- Exact Standard candidate: `d4f2098b4940cae61b9f36345cb480bda33d990d` on `hermes/pro-wp0-1-baseline` in `/Users/alvinlo/Desktop/Project-HitLink-wp0-1`.
- Regenerated facts: 65 Prisma models, 48 enums, 16 committed migration SQL files, 363 production delegate-call expressions across 39 files, and 299 calls across 36 production files outside `packages/db`; no application raw-SQL call site was found under the documented static rules.
- Evidence: `current-standard-baseline.md` and `evidence/wp0.1-standard-baseline/`.
- Required root commands were run exactly but are `BLOCKED`: `pnpm` was not available on `PATH` and `node_modules` was absent. No command was converted to a pass.
- No Pro model/control is recorded as implemented. Standard sensitive-store and direct-access patterns remain separation evidence only.
- Required Database, Backend, Security/Privacy, QA/Assurance, and CEO/Product owner reviews remain open. Gate G0 remains `BLOCKED`; the implementer did not approve it.

## WP0.2 specification reconciliation — 2026-09-22

This is a documentation specification record, not G0 approval, legal review, implementation evidence, or production/profile authorization.

- Product claims in `product-spec.md` map by section to approved Q1–Q206 decision ranges; unresolved product inputs remain explicit blockers.
- `product-requirements-document.md` remains the authoritative registry with **44 FR** and **20 NFR** identifiers. No requirement ID was renumbered, merged, or superseded. Every entry records scope, decision source, owner/approving role, requirement, concrete acceptance evidence, failure/rollback behavior, and blocked dependencies where applicable.
- The completed semantic blocker audit identifies **50 of 64** requirements with direct unresolved legal, vendor, policy, commercial, production, profile, evidence-system, or accountable-human inputs: FR-003–005, FR-007, FR-009–010, FR-012–022, FR-024–042, FR-044, NFR-004–008, NFR-010, NFR-012, and NFR-015–020. The validator encodes the exact individual-ID set and requires non-empty blocker text; exact-set equality detects drift but is not proof that the semantic audit is correct.
- `system-design.md` now permits `LEASED` → `BLOCKED` when execution-time reauthorization or policy/destination resolution denies or is unresolved. Provider submission requires an unexpired owner/version CAS. Lease expiry is persisted by a recovery-worker CAS to `UNCERTAIN`, or to `FAILED_RETRYABLE` only when durable evidence proves no submission/effect was possible; stale owners cannot submit and reclaim occurs only after persisted expiry plus required reconciliation.
- `security-privacy-architecture.md` now identifies customer, patient, representative, Flowstate workforce/support, vendor, CI/CD, and recovery identities and the data-bearing crossings between trust boundaries. Its threat/fail-closed model remains aligned with system design.
- `roadmap.md` now maps M0–M9 to implementation-plan packets and G0–G4 without changing packet order: G0 before M1; foundation/G1 and control plane/G2 before the complete clinical journey/G3; US assurance before a Virginia pilot; separate Canada/G4 evidence before BC; parity later.
- Reconciled wording: the implementation plan's WP0.2 paths were labelled `PROPOSED — FUTURE` although the five documents already existed, while roadmap/review text still referred to `DRAFT`. WP0.2 records the documents as existing `SPECIFIED` planning contracts; the required human reviews were accepted on 2026-09-22, while G0 remains `BLOCKED`. These were editorial/current-state contradictions, not product-decision changes.
- Unresolved blockers are unchanged: exact first profiles/classifications; legal-policy values; CIAM and production vendors/configurations; agreements; BC excluded lanes; pricing/packaging/envelopes/support/SLA/claims/insurance; and named humans/counsel/assessor/executive approvals.
- On 2026-09-22, the project owner explicitly accepted WP0.2 for the Product/CEO, Architecture/Backend, Database, Security/Privacy, and Operations/QA-Assurance review roles and authorized WP0.3. Counsel-owned values move to WP0.3 and remain `COUNSEL_REVIEW_REQUIRED`. Gate G0 remains `BLOCKED`.

## WP0.3 reconciliation register — 2026-09-23

**State:** `COMPLETED` on 2026-09-23 — independent specification review is `PASS`; independent technical quality/security/evidence review is `APPROVED`; project-owner acceptance is recorded for all six required WP0.3 review functions; WP0.4 is authorized but not started.

**Release boundary:** G0 remains `BLOCKED`; WP1.x is unauthorized.

**Independent specification review outcome:** `PASS`

**Independent specification review date:** `2026-09-23`

**Independent specification review candidate:** `WP0.3-MUTABLE-MANIFEST-V1` — base commit `d4f2098b4940cae61b9f36345cb480bda33d990d` plus the exact eight-path SHA-256 manifest in `work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md`

**Independent quality review outcome:** `APPROVED`

**Independent quality review date:** `2026-09-23`

**Independent quality review candidate:** `WP0.3-MUTABLE-MANIFEST-V1`

### Document roles and stable identifier treatment

| Document | WP0.3 role | Current reconciliation state |
|---|---|---|
| `legal-applicability-matrix.md` | Owns verified factual legal branches, customer/profile facts required for decisions, and counsel-owned `LEG-01` through `LEG-11` inputs. | Reconciled candidate contains all 11 decisions; every `LEG-*` value remains `COUNSEL_REVIEW_REQUIRED`; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded without accepting a legal value. |
| `data-classification-and-flows.md` | Owns `D0`–`D9`/`DX`, field/store/flow inventory requirements, destination metadata, and fail-closed data movement. | Reconciled candidate passes its document contracts and whitespace checks; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded. |
| `control-and-evidence-matrix.md` | Owns canonical requirement/control/test/exercise/evidence/gate traceability and the `MAP-*` registry. | Reconciled candidate contains the exact 11-column table, all 35 stable controls, and all 11 canonical `MAP-*` rows; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded. |
| `operations-and-governance.md` | Owns accountable functions, procedures, review cadence, exercises, continuity, and protected-evidence handling. | Reconciled candidate passes its document contracts; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded without claiming staffing or exercise completion. |
| `competitor-parity-matrix.md` | Owns dated benchmark evidence only and cannot approve a vendor, legal value, control, profile, claim, procurement choice, or release gate. | Reconciled candidate passes its document contracts without refreshing sources; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded without creating procurement or release authority. |
| This register | Owns decision, contradiction, blocker, owner, dependency, review, and authorization state. | Updated for the accepted candidate with specification `PASS`, technical quality `APPROVED`, WP0.3 `COMPLETED`, and WP0.4 authorized but not started; no G0, WP1.x, profile, legal-value, vendor, production, or compliance approval is claimed. |

The canonical mapping IDs remain exactly `MAP-PURPOSE-AUTHORITY`, `MAP-CUSTOMER-PROFILE`, `MAP-RECORD-ORIGIN`, `MAP-RIGHTS`, `MAP-RETENTION`, `MAP-LEGAL-HOLD`, `MAP-DISCLOSURE`, `MAP-TRANSFER`, `MAP-INCIDENT`, `MAP-VENDOR`, and `MAP-RESPONSIBILITY`. All 11 rows now render the required legal, control, requirement, fail-closed, owner/dependency, and release-gate references in `control-and-evidence-matrix.md`.

The stable control set remains `GOV-01`, `GOV-02`, `GOV-03`, `GOV-04`, `LEG-01`, `DAT-01`, `DAT-02`, `ARC-01`, `TEN-01`, `IAM-01`, `IAM-02`, `IAM-03`, `AUD-01`, `AUD-02`, `LOG-01`, `ENC-01`, `FIL-01`, `CLN-01`, `CON-01`, `RGT-01`, `RET-01`, `OFF-01`, `OUT-01`, `VEN-01`, `BCP-01`, `INC-01`, `INC-02`, `HR-01`, `DEV-01`, `DEV-02`, `QUA-01`, `ASS-01`, `CLM-01`, `EVD-01`, and `REV-01`. WP0.3 may enrich their fields but must not renumber, delete, duplicate, or self-promote them beyond supported status evidence.

### Contradictions and current resolution state

| Contradiction | Owner | Status / required resolution |
|---|---|---|
| The prior control matrix shape lacked the required applicability/profile, implementation-target, exercise, cadence/trigger, and release-gate columns. | Security/Privacy + QA/Assurance + control owners | Reconciled in the accepted candidate across all 35 stable rows; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded. |
| Operations and competitor specifications were previously unreconciled draft inputs. | Operations + Security/Privacy; Product owner for parity | Reconciled candidates satisfy their document-specific automated contracts; specification review is `PASS`, technical quality is `APPROVED`, and required WP0.3 human acceptance is recorded. |
| Existing prose can describe missing values as future work without the exact accountable owner, dependency/evidence, affected scope, next review, and fail-closed effect. | Product owner + Privacy lead + QA/Assurance | Reconciled here through `WP03-B01`–`WP03-B05`; the five specifications must use the same ownership and fail-closed boundaries. |
| Broad line/clause negation suppression could hide a later positive claim, while direct G0/WP1 authorization forms were not all detected. | QA/Assurance | Reconciled in the packet validator by limiting suppression to the matched claim's immediate negative grammar and adding deterministic mixed/colon/G0/WP1 mutations. |

### Mandatory blockers

| Blocker ID | Category | Status | Owner | Dependency / evidence needed | Affected profiles / controls | Next review |
|---|---|---|---|---|---|---|
| WP03-B01 | First customer/profile and customer/entity facts | `BLOCKED` | Product owner + Privacy lead + qualified counsel | Verified applicant entity, service, specialty, jurisdiction, payer/public-body, record-origin, and Flowstate-role facts plus versioned `LEG-01`–`LEG-03` determinations. | Virginia and BC activation; `GOV-01`, `DAT-01`, `LEG-01`; `MAP-CUSTOMER-PROFILE`. | Before independent specification review if candidate facts exist; otherwise at first named-customer/profile intake and before G0/P1. |
| WP03-B02 | Counsel-owned legal/policy values | `BLOCKED` | Qualified Virginia/BC counsel + Privacy lead + customer record authority as applicable | Versioned applicability, purpose/authority, consent/authorization, rights, retention/hold, disclosure/release, incident/notice, custody/offboarding, transfer, responsibility, and claims decisions with protected-source references. | All Virginia/BC profiles; `LEG-01`, `CON-01`, `RGT-01`, `RET-01`, `OFF-01`, `OUT-01`, `INC-01`, `INC-02`, `CLM-01`; all affected `MAP-*` rows. | At counsel review of each exact profile/policy version and before any dependent profile, module, destination, G0, or P1–P7 advancement. |
| WP03-B03 | Vendors, exact configurations, agreements, regions, support paths, and transfers | `BLOCKED` | Vendor owner/Procurement + Privacy/Security | Due diligence, exact service/configuration and region, support/subprocessor path, agreement/expiry, retention/deletion, transfer/PIA, owner, and protected evidence references. | CIAM, hosting and every outbound destination; `IAM-01`, `FIL-01`, `OUT-01`, `VEN-01`, `INC-02`; `MAP-TRANSFER`, `MAP-VENDOR`. | At each vendor/configuration/agreement change and before destination enablement, transfer, G0/P1, or dependent module review. |
| WP03-B04 | Commercial, claims, insurance, operating-envelope, and production inputs | `BLOCKED` | Executive risk owner + Product/Commercial + Legal/Security/Operations as applicable | Approved pricing/packaging, support/SLA/credits, customer operating envelope, insurance decision, exact claim text/substantiation, production candidate/configuration, and authorization evidence. | All customer profiles and production/claim surfaces; `GOV-03`, `BCP-01`, `ASS-01`, `CLM-01`, `REV-01`; `MAP-RESPONSIBILITY`. | At commercial or production-candidate review and before G0, P6, P7, any public/contractual claim, or production authorization. |
| WP03-B05 | Named accountable humans, protected evidence system, exercises, assessor, and operating coverage | `BLOCKED` | Executive risk owner + Security/Privacy + Operations + QA/Assurance | Named appointments, delegates and coverage; protected evidence catalog/location/access/integrity; required training/reviews/exercises; qualified independent assessor and current assessment/retest evidence. | All profiles and human/assurance controls, especially `GOV-02`, `GOV-03`, `GOV-04`, `IAM-02`, `HR-01`, `BCP-01`, `INC-01`, `ASS-01`, `EVD-01`, `REV-01`; `MAP-RESPONSIBILITY`. | Before independent quality review where evidence affects reviewability, then at each staffing/evidence/exercise/assessment change and before G0/P4–P7. |

### Review and authorization state

- Independent specification review outcome is `PASS` on 2026-09-23 for the exact manifested candidate recorded above.
- Independent technical quality/security/evidence review outcome is `APPROVED` on 2026-09-23 for that exact candidate, with no critical, important, or minor issues. Evidence: embedded validator exit 0; 11 legal decisions, 35 controls, 11 mappings, and five blockers; exact recorded transcripts; 12/12 perfect-tense open variants rejected; declared regressions 148/148 rejected, 48/48 allowed, and independent matrix 34/34; perfect-tense matrix 72 rejected with zero bypasses and 72 allowed with zero false positives; bounded present/past/perfect/optional-now matrix 144 rejected with zero bypasses and 192 allowed with zero false positives; stale identity failed as expected, exact bytes were restored, and the post-restore validator passed; mutable hashes 8/8, inherited hashes 13/13, exact 21-path scope including untracked files, and `git diff --check` exit 0. The packet canonical self-hash before recording this approval was `99e9b81acfd376dcf1857d31b78450a79a19010029b4eab3e7bea3dd45c3f2a6`; the mutable manifest is regenerated after this record.
- On 2026-09-23, the project owner explicitly accepted the exact pre-recording candidate identified by `WP0.3-MUTABLE-MANIFEST-V1` and packet canonical self-hash `9bf74694d580ff123fca2033ecaa0bf1d25fa26c0839a7399766c61178c6d04a` for all six required WP0.3 review functions: Product; Architecture; Database; Security/Privacy; Operations/QA; and legal/counsel. The legal/counsel acceptance covers the specification's fact framing, question structure, ownership, and fail-closed treatment only; every counsel-owned applicability or policy value remains `COUNSEL_REVIEW_REQUIRED`.
- The same project-owner authorization marks WP0.3 `COMPLETED` and explicitly authorizes WP0.4 as the next packet. WP0.4 was not started, drafted, injected, or executed by this record.
- Vendor/Procurement, executive-risk, named-human staffing, protected-evidence, exercise, assessor, customer/profile, vendor/agreement, commercial, policy, legal-value, compliance, and production decisions remain unresolved blockers; acceptance of the WP0.3 specification does not satisfy them.
- No human review is inferred from WP0.2 acceptance. No legal value, vendor, exercise, protected evidence body, profile, production state, public claim, or compliance status is approved by this register.
- G0 remains `BLOCKED`; WP1.x is unauthorized. WP0.4 authorization is not G0 or WP1.x authorization.

## WP0.4 review disposition — 2026-11-19

Independent specification review returned `FAIL` for the original recovered candidate (`5b1b84b`, WP0.4 bundle `6271d7e4956e0a42177aef1d46d709e4cf1a7646a4ce3b8b7e9640bf65220676`). The independent review and September original bytes are retained separately. Malformed input handling, mandatory dossier inventory, role-only names, and the stale packet heading and branch check were addressed on the new candidate; fresh acceptance is required.

- **Project-owner direction, November 19, 2026:** require named metadata for every `APPROVED_FOR_PROFILE` record; retain the legal-value condition for `APPROVED` and `LEGALLY_REVIEWED`.
- **Project-owner direction, November 19, 2026:** represent `BLOCKED`, `NOT_APPLICABLE`, and `SUPERSEDED` as new, non-activating records. The packet's implementation rule limits predecessor states to canonical non-disposition states, requires predecessor evidence, and permits no outgoing edge. A disposition cannot substantiate a positive manifest status.

The independent specification re-review also returned `FAIL` for the prior ten-path bundle `7d06ae1b473f803b2ba73e5c6c665340993d80c9b23e876fcc75189c80fee940`. Remediation adds regression coverage for role-only counsel titles, disposition references in profile prerequisites, strict string IDs, and additional root schema keywords. Name validation is a bounded metadata check, not identity or authority verification.

The independent re-review of bundle `9cadb711cb713e8779823090cfe77bf8bd53a2baced607786ed62cf87b24cf2d` also returned `FAIL`. The next candidate rejects additional role-title forms and checks all progression and approval evidence fields for direct references to terminal dispositions. WP0.4 remains open. Independent specification and quality/security/evidence reviews and named human acceptance are required before WP0.5. No profile, legal value, or next milestone is approved here.

The re-review of bundle `0ffd9ccfdff66a111e7f19037c5ff57148f43e107052fc4dc5e0573a9b47a1ca` returned `FAIL` on role-only approver names; disposition evidence checks passed. Project-owner direction: use a bounded title grammar for machine validation and require an accountable human reviewer to confirm the named person, scope, and authority against protected approval evidence. This direction is not WP0.4 acceptance or Gate G0 approval.

The independent re-review of bundle `107507bef3a7ba25c204c47f3f146674dc2e214f46d6e81bdd16cbe5ca3cfccd` returned `FAIL` on schema/CLI approver-name parity. The revised candidate uses the same ASCII case-insensitive exclusions in both and rejects surrounding whitespace without trimming. Human identity, scope, and authority verification remains unchanged; independent specification and quality reviews and named human acceptance remain pending.

Bundle `ea06f11096187b14f6294fef5453a3ee3e7866c62be02391d02297adebfa4672` received independent specification `PASS` and quality/security/evidence `REQUEST_CHANGES`. The revised candidate requires complete credential redaction for the scanner exemption and uses one Markdown-path predicate for manifest validation and read eligibility. Both regressions failed before the repair and passed after it. Fresh reviews and named human acceptance are pending; G0 remains blocked.

Bundle `4b6d48e5de2bd7d81df3d5dc61988ddf3b0bc4c31c7cbd62f7338642f8f37d8b` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES`. The revised validator checks matching delimiters for quoted credentials and rejects duplicate JSON members before using parsed values. Both new regressions failed before remediation and passed after it. Independent reviews and named human acceptance are pending; G0 remains blocked.

Bundle `997012b0761822cdce5f6769424780a6a1c8690d98b7a6274ddee7309c56c333` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES` because serialized JSON escaping can hide credential patterns. The revised candidate applies the same content scanner to decoded string values in governed JSON, with sanitized field diagnostics. The production CLI regression failed before the repair and passed after it. Fresh independent reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `b485c59cbc03be411a9f55f903f48d26c262ea2cf216b9e32b89c29ae7e727d4` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES` on diagnostic redaction. The revised validator shares the payment-card matcher between content scanning and diagnostic sanitization. Validation and tooling diagnostics have a production CLI regression for nondisclosure. Fresh independent reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `2e421bdb41db12a21999b581b4b00a966bc448b64db60a93ddf1acaef5185986` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES`. The revised shared matcher checks bounded windows of complete digit groups, so nearby numbers cannot suppress detection. The CLI regression covers nondisclosure on both validation and tooling exits. Fresh independent reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `7b46ab555c8398a9d47ddd4b7665958861b78ace46716e747ab59e8097827269` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES` on manifest profile-approval binding. The revised candidate requires the latest registered change to have the same approval status and cover the document and its profile tokens. Fresh independent reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `134042dfce7f709abff4e1a0dd69399fd546c61f9a7dfbc63380b52fd7482232` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES` for quoted credential keys and incomplete input pins. The revised scanner accepts matched key delimiters when identifying assignments, and verification captures hashes for all governed dossier inputs before and after execution, separately from the ten mutable paths. Fresh reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `c8d14b730d86c5cb47ebed23427f321718be4ced1d7bc8da343343d14c1d75eb` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES` because JSON payload keys were not checked in Markdown. The revised candidate uses the same payload-member rule for Markdown JSON string pairs and governed JSON objects. The CLI regression covers rejection without disclosure and acceptance of the redacted control. Independent reviews and named human acceptance remain pending; G0 remains blocked.

Bundle `1d8669e19ae8a28cf233aa87fdbaf3bdebb19dc1f17bb38d05bcaf51fef527b2` received specification `FAIL`: the payload rule covered strings only. The revised rule rejects non-empty arrays and objects, numbers, and booleans in governed JSON and Markdown JSON members. It still exempts null, empty collections, blank strings, and complete redaction placeholders. The CLI regression checks both input paths without printing values. No technical gate or named human acceptance is inferred from the fix.

Bundle `9be88f16668cbead33bd61b5632a4f1a31db69dd8f51c375d04e10b5b01946e0` received specification `FAIL`: earlier Markdown prose quotes could hide a JSON member. The revised scanner checks candidate key starts independently. A CLI regression exercises an escaped JSON key next to an unmatched prose quote, with a redacted pass control. Independent reviews and human acceptance remain open.

Bundle `0b1260a6ecbb91c6e9c27f8f92539460ea4ef931c78bafb60ae1b4c85cc98446` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES`. The revised validator scans decoded JSON string values in Markdown with the governed JSON content scanner and reads the checked, resolved path for both input formats. Validation requires a stable checkout: path resolution and opening are not atomic against concurrent filesystem changes. Independent reviews and named human acceptance remain open.

Bundle `d3b16967065d47f5988779dab6cd1d0d88114482f7f926fab1f353618766453c` received specification `FAIL`: the schema did not restrict prerequisite status keys, and the active handoff pointed to the September candidate. The schema now references the canonical status vocabulary, matching the CLI. The current handoff is below.

Bundle `cb5bdcb4a4ecb830494b6dc98cf10ed2c554cd3edf72fbc8de056b643d5cfaaf` received specification `PASS` and quality/security/evidence `REQUEST_CHANGES`. The revised validator scans standalone serialized JSON strings in Markdown and refuses non-regular governed inputs before reading. Both changes have production CLI regressions. The stable-checkout requirement and pending review gates still apply.

## WP0.4 historical implementation record — 2026-09-24

**State:** `IMPLEMENTED — TWENTIETH EXACT-CANDIDATE SPECIFICATION RE-REVIEW FAIL REMEDIATED; TWENTY-FIRST SPECIFICATION RE-REVIEW AND HUMAN ACCEPTANCE PENDING`.

**Candidate identity:** base commit `d4f2098b4940cae61b9f36345cb480bda33d990d`; branch `hermes/pro-wp0-3-controls`; worktree `/Users/alvinlo/Desktop/Project-HitLink-wp0-3`; exact ten allowed WP0.4 paths and SHA-256 values are recorded in the external implementation handoff after final packet bytes are fixed. No self-referential packet hash is embedded.

**Implemented boundary:** two JSON contracts, the 18-document dossier manifest, the initial `WP0.4-CC-001` register record, one Node standard-library validator, one focused `node:test` file, and the two exact root package scripts. Validator exits are `0` for pass, `1` for sanitized dossier/schema/content findings, and `2` for usage, repository, read, UTF-8, or unexpected tooling failure.

**Security and correctness boundary:** validation rejects incomplete/unknown metadata, duplicates and ordering drift, invalid profile/status/date/timestamp values, fabricated-person owners or review functions, non-accountable approval roles, empty superseded text, missing or escaped repository-path references, path traversal and symlinks in any reference-path component, complete schema/validator contract drift, unlisted or incomplete profile-approval transitions, approved legal values without named approval metadata, explicit credential shapes, Luhn-valid payment-card values, explicit contract-body markers, and prohibited non-redacted JSON payload keys. Declared-status parsing scans the complete non-fenced Markdown document, compares all 15 canonical values byte-exactly without case conversion or Unicode/ASCII trimming, reconciles every recognized declaration, permits only consistent duplicates, rejects conflicts and malformed declaration-like lines, and maps only the complete current governed prose declarations through exact bounded strings. Fences accept zero to three leading spaces, retain backtick/tilde delimiter type and opening length, and close only on the same delimiter at least as long with trailing spaces/tabs only. ATX candidates accept zero to three leading spaces at levels 1–6. Heading and emphasis boundaries are parsed structurally before detection-only normalization case-folds, explicitly removes format characters, and reduces the isolated label token to ASCII letters only. Asterisk, underscore, mixed, escaped, matching, and mismatched marker runs are recognized as declaration attempts when paired with an inline/next-line value shape; declaration values remain byte-exact. Ordinary `Status quo`, `Status indicators`, `Status page`, `Status history`, headings with additional semantic words, inline prose, blockquotes, lists, HTML comments, inline examples, valid fenced examples, and an H1 title that merely contains status remain non-declarations. Historical packet subsections in the implementation plan use `Packet status` so they remain semantic metadata rather than conflicting document declarations. A registered document with no top-level declaration may rely on its already schema-valid manifest status, as required for the inherited evidence README; absence does not bypass manifest status validation. Invalid or secret-shaped IDs use a stable redacted locator so diagnostics never disclose the supplied ID, matched value, or payload body. Natural-language contract classification, legal authority, and broader secret entropy detection remain outside this deliberately bounded scanner.

**Verification:** final direct and package-script focused tests pass 51/51; the counted production-path harness passes all 51 tests with 1,697 validator executions. The independent 250-case status corpus and 261-case extension remain green. H1 verification passes the prior 15, 13, 19, 27, 11, 20, 24, 41, 8, 109, 15, and 115-case matrices plus the fresh destination-character corpus 38/38 after reproducing exactly eight pre-fix failures. One shared bounded recognizer rejects ASCII whitespace, C0 controls, DEL, and unmatched/nested angle syntax inside angle destinations; bare destinations require balanced parentheses, bounded nesting, and no dangling final escape before any reference-destination continuation state is entered. Malformed destinations terminate reference parsing so following real Setext headings remain visible; valid percent-encoded, escaped-punctuation/backslash, Unicode non-control, query/fragment, balanced-parenthesis, complete-angle, same-line, next-line, zero-to-three-space, LF, CRLF, and mixed-ending definitions retain prior suppression behavior. The transition matrix passes 225/225; diagnostic/trust/error/nondisclosure tests pass; reference-path controls pass 6/6; complete schema-leaf mutation coverage, including `$schema`/`$id`, remains green. Separate angle-character and dangling-escape mutations fail in exactly six and two cases, then restore validator bytes identically at SHA-256 `a6ae890e267b4216498194df90456c1e49febe6b83c9cb248614ddfdd5be1b2a`; counted-harness instrumentation restores the test file identically at SHA-256 `7653ab2082f465f5129cd97e6f09f5fd204a7a7133e0e49794aab2a9199fbedb`. Direct and package-script validator runs report `VALIDATION_PASSED documents=18 records=1 files=22`; JSON and Node syntax pass. No dependency, lockfile, application, Prisma, migration, database, infrastructure, vendor, profile, production, WP0.5, or WP1.x path changed.

**Review state:** independent specification review returned `FAIL` on 2026-09-23 with eight findings; the first through ninth exact-candidate re-reviews returned `FAIL` on the previously recorded gaps; the tenth exact-candidate re-review returned `FAIL` with four Important gaps and one Minor gap; and the eleventh through nineteenth exact-candidate re-reviews returned `FAIL` on 2026-09-24 with the recorded H1, reference-destination, and record-state gaps. The nineteenth review reported one Important finding: angle destinations accepted ASCII whitespace, C0 controls, and DEL, while bare destinations accepted a dangling final escape; malformed definitions could therefore enter continuation/title state and suppress a real following Setext H1. The bounded shared-destination remediation is implemented in the current candidate. The twentieth exact-candidate specification re-review returned `FAIL` on 2026-09-24 solely because the implementation-plan packet-status headline still reported the eighteenth failure remediated and nineteenth review pending. That governed-record inconsistency is remediated across the implementation plan, this decision register, and the WP0.4 work packet; the twenty-first exact-candidate specification re-review remains `PENDING`. No `PASS` or approval is claimed. Independent quality/security/evidence review and all required human acceptance remain pending.

**Unresolved blockers:** `WP03-B01` through `WP03-B05` remain `BLOCKED`; all counsel-owned values remain `COUNSEL_REVIEW_REQUIRED`; no vendor, profile, legal value, protected evidence body, production state, public claim, compliance status, or Gate G0 is approved. G0 remains `BLOCKED`; WP1.x is unauthorized.

**November 20 scope review:** Independent specification review failed on the prior candidate because manifest registration could include unrelated repository Markdown. The schema and CLI now limit registrations to the Pro dossier subtree and the existing implementation plan. The CLI checks resolved paths before reading dossier Markdown, while reference-only paths retain their existing contract. The new synthetic registration test failed before the repair and passed after it. Current-dossier validation also passed. A fresh exact-candidate specification review, subsequent quality/security/evidence review, and named human acceptance are pending. G0 remains blocked.

## WP0.4 active handoff — 2026-11-19

1. Submit the current candidate on `feat/flowstate-pro-implementation`, base `5b1b84b103a0cea9a521d5857c0b49fdeb710473`, for independent specification review. The external handoff pins all ten scope paths and the full verification-input inventory after the final files are frozen; the September identity above is historical.
2. Run independent quality/security/evidence review only after specification `PASS`, against the same candidate.
3. Obtain explicit candidate-bound human acceptance for all required functions; do not infer it.
4. Preserve all existing blockers, G0 `BLOCKED`, and WP1.x unauthorized.
5. Stop before WP0.5 until explicit project-owner review authorizes the next separate packet.
