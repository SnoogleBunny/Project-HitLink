# Flowstate Pro product specification

**Status:** DRAFT — OWNER_APPROVAL_REQUIRED  
**Product:** Flowstate Pro  
**Initial launch lane:** Virginia, United States  
**Canadian fast-follow lane:** British Columbia private clinics  
**Decision baseline:** Q1–Q206, confirmed 2026-08-24  
**Last updated:** 2026-08-26

## 1. Document purpose

This document defines what Flowstate Pro is, who it serves, its product modules, market position, commercial boundaries, v1 scope, and explicit exclusions. Testable behavior belongs in `product-requirements-document.md`; release sequencing, gates, evidence, and rollback belong in `roadmap.md`.

This is a planning specification, not legal advice, a compliance certification, an executed agreement, or proof of a production-ready service.

## 2. Product identity

Flowstate Pro is a separate, white-label clinical-record and practice-operations product for approved healthcare and health-related organizations. It combines a minimum safe longitudinal clinical journey with patient self-service, administrative operations, direct-pay billing, privacy operations, and controlled data portability.

Flowstate Pro is not an edition, upgrade, feature flag, or data mode of Flowstate Standard.

### 2.1 Standard boundary

Flowstate Standard remains the existing one-location MMA/fitness application for scheduling, attendance, gym billing, forms, and member self-service. Standard contractually and technically prohibits regulated clinical records and PHI.

Pro has separate customer applications, data models, identities, credentials, MFA, recovery, sessions, deployments, databases, storage, backups, keys, logs, monitoring, vendors, access groups, CI/CD promotion, Stripe configuration, and production access. The same email may exist in both products only as unrelated identities. There is no Standard-to-Pro migration or downgrade path.

The monorepo may share only reviewed data-free UI/configuration primitives and pure utilities. Standard schemas, roles, sessions, customer records, billing resources, and operational services are not Pro foundations.

## 3. Product thesis and value

Healthcare organizations need usable clinical and administrative workflows without accepting weak tenant boundaries, opaque data custody, difficult exports, or a large enterprise implementation burden. Flowstate Pro will offer a calmer white-label experience while making privacy controls, record integrity, patient participation, and portability visible operational features.

### 3.1 Intended differentiation

- Privacy-by-design controls that can be demonstrated for an approved profile and configuration.
- Clear record custody, consent, disclosure, retention, rights, and offboarding workflows.
- Portable human-readable and structured exports with manifests and reconciliation.
- Strong patient self-service rather than a staff-only record system.
- Lower implementation burden and better workflow quality than enterprise-first products.
- Standards and external-network integration instead of rebuilding payer, pharmacy, lab, imaging, or exchange cores.
- Accessible, multilingual-ready, white-label web experiences.

Flowstate may market concrete controls and verified outcomes. It must not guarantee universal HIPAA, PIPEDA, provincial, specialty, payer, or public-sector compliance.

## 4. Target market

### 4.1 Broad target profiles

The product architecture and roadmap target separately approved profiles including:

- speech-language pathology;
- physiotherapy and physical therapy;
- chiropractic care;
- mental and behavioral health;
- imaging practices;
- life coaching and health-adjacent services;
- private and public providers;
- insurers and insurer-connected workflows; and
- other approved health-related organizations.

This breadth is a roadmap target, not permission for universal activation. Each organization and profile requires classification, legal applicability, use-case, data-flow, vendor, contract, and operating-envelope review.

### 4.2 Launch lanes

1. **Virginia first.** Pro-US v1 targets individually approved Virginia customer/specialty profiles using the isolated US data plane.
2. **British Columbia second.** The first Canadian cohort is limited to approved BC private clinics using the isolated Canadian data plane.
3. **Separately gated BC profiles.** Public bodies, health authorities, E-Health Act participants, insurers, and government contractors are not included in the private-clinic lane.
4. **Later jurisdictions and profiles.** No additional jurisdiction or customer type inherits approval from Virginia or BC.

### 4.3 Customer activation model

There is no self-service regulated activation. A public landing page may collect only minimal business-contact and application data. Demos and ordinary trials use synthetic data.

PHI-capable evaluation or production access requires a reviewed activation sequence covering:

- organization and organization-admin verification;
- legal status, customer type, service location, patient population, use case, and data flow;
- Covered Entity/Business Associate/neither/unresolved and applicable Canadian role classifications;
- required customer and downstream agreements;
- approved vendors, destinations, region, and transfer conditions;
- specialty/customer applicability profile and enabled data classes;
- responsibility matrix for custody, rights, retention, holds, and service-provider duties;
- human security, privacy, incident, executive, and independent-review roles;
- per-customer operating envelope and support readiness; and
- named approval for the exact profile and configuration.

Unresolved classifications or missing required agreements fail closed.

## 5. Users and product surfaces

### 5.1 User roles

- **ORGANIZATION_ADMIN:** verified organization configuration and workforce administration.
- **PROVIDER:** care delivery, clinical documentation, review, and release workflows within assigned scope.
- **CLINICAL_SUPPORT:** approved clinical assistance under least privilege.
- **ADMINISTRATIVE_STAFF:** scheduling, intake, demographics, and non-clinical operations.
- **BILLING_STAFF:** billing, eligibility, payment, and approved financial workflows.
- **PRIVACY_OFFICER:** rights, disclosure, retention, hold, privacy review, and incident duties within assigned authority.
- **PATIENT:** own approved profile, appointments, forms, records, payments, security, proxies, and rights requests.
- **GUARDIAN_OR_PROXY:** only the patient records and actions authorized by explicit, current representative authority.

Flowstate workforce uses a separate managed identity plane and does not receive a customer role. Routine Flowstate access to patient data is prohibited.

### 5.2 Product surfaces

- **Provider web:** workforce clinical and practice operations.
- **Patient web:** responsive patient/guardian/proxy self-service.
- **Dedicated API:** internal REST workflow API plus a separately controlled standards gateway; not a general public API.
- **Public site:** marketing and minimal business application intake only.
- **Operations surfaces:** restricted activation, privacy, security, incident, vendor, evidence, and support workflows for authorized humans.

Native mobile applications are deferred.

## 6. Product modules

This section describes module purpose and boundaries. Detailed behavior and acceptance are in the PRD.

### 6.1 Organization activation and white-label configuration

Verified onboarding, customer/applicability profile selection, contracts and evidence references, operating envelope, branding, locale, enabled modules, and controlled production activation. White-label configuration cannot change security, legal policy, audit, retention, or tenant-isolation rules.

### 6.2 Identity, access, and delegated authority

Separate Pro identity; invitation-controlled workforce and patient accounts; MFA; session and step-up controls; least-privilege role and assignment policy; security management; guardians, proxies, substitute decision-makers, and representatives with evidence, scope, dates, expiry, revocation, and age-of-majority transition.

### 6.3 Patient administration and self-service

Patients may maintain approved demographic/contact data, manage account security and proxies, schedule, complete intake/consent/forms, view released records, pay, and submit rights requests. Clinic invitation is required. High-risk identity changes route to human review. Patient-reported content remains distinguishable from clinician-verified content.

### 6.4 Scheduling and practice operations

Appointments, provider/resource availability, booking, rescheduling, cancellation, reminders, intake readiness, and operational queues. Pro scheduling is clinical-practice scheduling and does not reuse Standard memberships, classes, rosters, or attendance records.

### 6.5 Intake, consent, forms, and representative authority

Versioned intake and form workflows with distinct records for consent, HIPAA authorization, acknowledgment, contract acceptance, and non-consent legal authority. Withdrawal is prospective and does not erase lawful history.

### 6.6 Longitudinal clinical chart

Patient summary, encounter history, diagnoses/treatments where approved, medications, allergies, health history, clinical notes, and patient-reported information. Draft clinical content may be edited; finalized records are immutable and change only through linked amendments or late entries with provenance and reason.

High-risk data classes—including SSN/SIN, government ID, biometrics, genetics, unrestricted narrative, and other profile-designated classes—are disabled by default and require approved purpose, authority, security, access, and retention.

### 6.7 Controlled clinical files

Approved file types, provenance, patient/encounter linkage, classification, malware scanning, quarantine, integrity hashes, governed object storage, immutable versions, append-only amendments, and lifecycle controls. DICOM/PACS is a separate integration lane and is not treated as ordinary upload storage.

### 6.8 Billing and eligibility

Direct-pay invoicing/payment and approved eligibility workflows. Pro uses separate Stripe resources and reconciliation. Claims and full revenue-cycle management are deferred. Commercial suspension cannot delete records or block legally or emergency-required access.

### 6.9 Record release and portal sharing

Provider-controlled release of approved records and files to the correct patient or authorized representative, with access policy, notification, audit, revocation/expiry where applicable, and no automatic disclosure of unreleased clinical content.

### 6.10 Privacy operations

Authenticated rights requests; verification; access, correction/amendment, appeal, export, and approved disclosure-accounting workflows; legal holds; retention; offboarding; secure fulfilment; and custody/responsibility tracking. Legal and policy decisions remain human-owned.

### 6.11 Audit, incident, and support operations

PHI-free security audit, durable high-risk operation intent/outcome, deterministic security signals, human-led incident command, chain-of-custody references, JIT support access, and review. Flowstate staff have no clinical break-glass. Tenant-clinician break-glass is narrow, time-limited, MFA-protected, audited, notified, and reviewed.

### 6.12 Portability and external clinical migration

Governed migration from approved external clinical systems through staging, validation, mapping, preview, reconciliation, provenance, and cutover. Exports provide human-readable and structured formats, manifests, hashes, reconciliation, secure transfer, and staging destruction. There is no Standard-to-Pro migration.

### 6.13 Integration and standards gateway

Controlled, destination-aware interfaces for approved systems. Later lanes include standards APIs, clearinghouses, laboratories, pharmacy/e-prescribing, PACS/RIS, telehealth, calendars, and external exchanges. Integrations are disabled until vendor, agreement, residency/transfer, minimization, audit, support, and rollback gates are met.

## 7. Pro-US v1 product scope

Pro-US v1 is the minimum safe end-to-end clinical journey for an approved Virginia profile:

- verified organization activation and white-label configuration;
- workforce, patient, guardian/proxy identity, MFA, recovery, and sessions;
- patient self-service;
- appointment scheduling and operational queues;
- intake, consent, authorization, and forms;
- longitudinal chart and encounter workflow;
- draft notes, finalization, linked amendments, and late entries;
- controlled clinical files;
- medication, allergy, and health-history records;
- direct-pay billing and approved eligibility checks;
- provider-controlled portal record sharing;
- rights requests, secure export, correction/amendment, and disclosure accounting where applicable;
- profile-driven retention, legal holds, offboarding, and destruction controls;
- immutable security audit, incident workflow, and JIT support controls; and
- isolated US GCP operations, backup, restore, and disaster-recovery evidence.

A feature is not v1-active merely because code exists. It must be enabled for a named profile only after its technical, operational, legal, vendor, and evidence gates are complete.

## 8. Deferred scope and parity roadmap

The following are roadmap modules, not Virginia v1 launch requirements unless a named profile cannot safely operate without one:

- secure patient/workforce messaging;
- telehealth;
- medication prescribing and e-prescribing networks;
- lab ordering/results and referral exchange;
- imaging/PACS/RIS integration and DICOM workflows;
- claims submission, remittance, and full revenue-cycle management;
- external clinical migration beyond an approved initial connector;
- broad standards API coverage;
- multi-location organizations;
- native iOS and Android applications;
- clinical AI or automated clinical decision support;
- advanced specialty templates and profile packs;
- public-sector, health-authority, insurer, and government-contracting profiles; and
- dedicated tenant projects/databases outside separately priced approved profiles.

Jane.app and Epic are versioned journey benchmarks, not promises to reproduce their full catalogs. Parity advances in approved waves: core clinic operations, communications/virtual care, interoperability/clinical networks, payer/revenue cycle, and specialty/enterprise depth. Each wave requires dated benchmark evidence, profile demand, control coverage, and measurable acceptance before activation.

## 9. Commercial model and boundaries

### 9.1 Billable dimensions

- Active workforce identities are seats.
- Active patient records are a separate volume metric.
- Guardians and proxies are associated with patients, not workforce seats.
- Suspended or deactivated workforce accounts are not active seats.
- Separately approved usage modules may be add-ons.

Pricing, minimums, credits, and included usage remain OWNER_APPROVAL_REQUIRED.

### 9.2 Customer operating envelope

There are no universal hard-coded organization, user, or patient caps. Each pilot and production customer has a documented envelope covering workforce seats, active patients, documents/files, storage, integrations, expected workload, tested capacity, support, recovery, and escalation. Exceeding the approved envelope triggers review, not silent degradation or automatic activation.

### 9.3 Separate commerce

Pro has distinct Stripe configuration/account boundaries, webhook secrets, products/prices, customer objects, access, and reconciliation. Standard purchases, subscriptions, credits, or billing identities do not grant Pro access.

### 9.4 Suspension, offboarding, and custody

Commercial cancellation and nonpayment may restrict non-required service features through a controlled suspension state. They cannot delete records or block legally or emergency-required access. Offboarding separately resolves record custody, patient/customer access, export, legal holds, integrations, retention, backups, and destruction.

### 9.5 Service commitments and claims

Availability, RTO, and RPO are internal engineering targets until executive, legal, operations, and pricing approval creates commercial SLA terms. Public privacy, security, HIPAA, PIPEDA, provincial, residency, or availability claims require approval for the exact profile, configuration, vendors, evidence period, and wording.

## 10. Explicit exclusions and prohibitions

- No Standard-to-Pro upgrade, migration, downgrade, shared identity, shared session, shared clinical store, or shared billing configuration.
- No self-service regulated activation or real-PHI demo/trial without full activation gates.
- No universal claim that Flowstate or every customer is compliant.
- No automatic legal applicability, breach-reportability, rights, retention, consent, or disclosure decision.
- No tenant-authored legal-policy rules.
- No routine Flowstate access to patient data and no Flowstate clinical break-glass.
- No destructive edit of finalized clinical records or uncontrolled destructive cascades.
- No PHI in logs, metrics, audit payloads, support tools, test fixtures, screenshots, or non-production environments.
- No unapproved high-risk data classes, vendors, destinations, integrations, cross-border flows, or public-sector lanes.
- No ordinary object upload path for DICOM/PACS content.
- No rebuilding of PACS, LIS, pharmacy, payer, telehealth, or health-information-exchange cores.
- No GKE, global active-active, HSM, native mobile, multi-location, or microservice expansion without an approved requirement.

## 11. Success measures

Measures are established per approved profile and operating envelope. Initial product measures are:

- safe completion rate for activation-to-visit-to-record-release journeys;
- patient invitation, MFA enrollment, intake, scheduling, payment, and released-record access completion;
- time to complete clinical documentation and amendments without integrity exceptions;
- rights/export fulfilment within the profile-approved deadline;
- zero unauthorized cross-tenant or cross-patient access in adversarial tests and verified incidents;
- audit completeness for required sensitive operations;
- restore, failover, incident, and offboarding exercise success;
- support burden per activated organization;
- migration reconciliation accuracy for approved external sources; and
- benchmarked parity gaps closed per roadmap wave.

Exact targets remain OWNER_APPROVAL_REQUIRED and must not weaken safety or legal gates to improve adoption metrics.

## 12. Product approval conditions

Owner approval of this document confirms product direction only. It does not approve legal values, vendors, production activation, pricing, SLAs, public claims, or a customer profile.

Before moving this specification to `APPROVED`, the owner must confirm:

1. Virginia-first and BC-private-clinic-second sequencing;
2. the broad profile target with individually gated activation;
3. the Pro-US v1 and deferred module boundary;
4. patient self-service scope;
5. the separate-product and no-Standard-migration boundary;
6. commercial dimensions and controlled suspension/offboarding behavior; and
7. Jane/Epic journey parity as a staged roadmap rather than a launch-wide promise.

## 13. Source alignment

Binding product decisions: `decision-register-and-open-items.md`.  
Package status and precedence: `README.md`.  
Detailed testable requirements: `product-requirements-document.md`.  
Release gates and parity sequencing: `roadmap.md`.  
Standard baseline references: `../../product_decisions_ledger.md`, `../../domain_model.md`, repository `README.md`, and `packages/db/prisma/schema.prisma`.
