# Flowstate Pro decision register and open items

**Status:** APPROVED PRODUCT/ARCHITECTURE DECISIONS; legal, vendor, policy, and production approvals remain BLOCKED
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

## Next actions

1. Review and approve this package’s DRAFT supporting documents.
2. Obtain counsel determinations and vendor answers; record them as versioned inputs.
3. Execute the detailed plan milestone by milestone in isolated worktrees.
4. Keep production activation disabled until all applicable launch evidence is complete.
5. Reconcile Standard documentation only through separate scoped tasks.
