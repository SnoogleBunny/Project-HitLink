# Flowstate Pro security and privacy architecture

**Status:** SPECIFIED PLANNING TARGET — no current compliance, implementation, or production-approval claim  
**Decision baseline:** Q1–Q206, confirmed 2026-08-24  
**Scope:** Flowstate Pro-US and Pro-Canada; Standard is outside this control boundary

## 1. Security objective and non-claim

Flowstate Pro must make the safe path the only normal path for clinical and personal data: authenticated identity, explicit authority and purpose, deny-by-default policy, tenant-enforced repositories and PostgreSQL RLS, minimal disclosure, immutable clinical history, durable audit, governed lifecycle, and isolated regional operations.

Google describes HIPAA compliance as a shared responsibility, requires customers to determine their status and BAA need, and states that applications and environments remain the customer's configuration/security responsibility.[1] Google Cloud selection, a BAA, encryption, or passing tests does not by itself establish Flowstate or customer compliance.

### CURRENT — Standard facts that must not be represented as Pro controls

The repository currently implements a separate fitness product with `OWNER`, `COACH`, and `CUSTOMER` roles, database-backed cookies, a seven-day absolute session expiry, direct Prisma access from application code, application-filter tenant scoping, PostgreSQL-stored PDF bytes, and no Pro RLS/policy/audit/lifecycle/envelope-encryption controls in the implemented Prisma schema. These are baseline observations, not approved Pro shortcuts.

### PLANNED — Pro security posture

- full Standard/Pro and US/Canada data-plane separation;
- no routine Flowstate access to patient data;
- backend-only database, storage, key, policy, and vendor access;
- strong identity, MFA, session ceilings, step-up, recovery and revocation;
- layered authorization at policy, repository, RLS, relationship, field and lifecycle boundaries;
- PHI-free operational logs and payload-free security audit;
- fail-closed unknowns and outages, with no plaintext or direct-vendor fallback;
- evidence-based activation per customer/applicability profile.

## 2. Trust boundaries

| Boundary | Untrusted or less-trusted side | Trusted side and required crossing control |
|---|---|---|
| Public internet → edge | Browsers, bots, uploaded files, webhook senders, external systems | TLS, approved hosts/origins, WAF/rate controls, request-size/type limits, route templates, webhook/standards authentication. |
| Browser → Provider/Patient Web | User-controlled input, URL, browser extensions/storage | CSP/security headers, no sensitive URL/query values, server-authoritative session, minimal rendering, no analytics/session replay without approval. |
| Web apps → Pro API | Compromised frontend server or forged client calls | Mutual/private service identity plus user/session proof; API reconstructs actor/tenant/assurance and ignores caller-supplied authority. |
| API boundary → policy/repositories | Route/action input and arbitrary IDs | Typed action/resource request, central deny-by-default policy, relationship and purpose checks, minimal projection. |
| Repository → PostgreSQL | Application defects, guessed IDs, connection-pool residue | Least-privilege non-owner role, transaction-local trusted context, composite tenant integrity, forced RLS, constraints and concurrency checks. |
| API/workers → Cloud Storage | Malicious file, path/name manipulation, stale release state | Opaque keys, quarantine, scanning, immutable versions, metadata authorization, short-lived delivery. |
| API/workers → KMS/secrets | Compromised workload identity or ciphertext substitution | Per-plane service accounts and keys, minimum IAM, authenticated encryption context, no exported KEK/plaintext fallback. |
| Business transaction → audit | Rollback, crash, malicious payload, audit tampering | Separate append-only destination/credential; schema allowlist; independent denied/failure write; intent/outcome correlation. |
| Outbox → external destination | Vendor, network ambiguity, cross-border transfer | Registered/approved destination, agreement and transfer gates, minimization, idempotency, disclosure/audit outcome. |
| Pro-US → Pro-Canada | Separate jurisdictions, keys, operators, stores | No runtime trust or failover. Only an explicitly approved, audited transfer through the destination gateway. |
| Pro → Standard | Separate product and prohibition boundary | No identity federation, database connection, migration, shared session, vendor account, key, log, backup or runtime package. |
| Production → non-production | Developer/test environment and artifacts | Synthetic data only; separate projects/credentials; no production export/import path. |
| Customer plane → Flowstate operations | Platform support and administrators | Managed workforce identity, approved device/MFA, JIT scope/time, independent approval, full audit and post-access review. |

## 3. Identity and session architecture

### Customer identities

- Roles are `ORGANIZATION_ADMIN`, `PROVIDER`, `CLINICAL_SUPPORT`, `ADMINISTRATIVE_STAFF`, `BILLING_STAFF`, `PRIVACY_OFFICER`, `PATIENT`, and `GUARDIAN_OR_PROXY`; Standard roles have no meaning in Pro.
- Organization admins are manually verified. Workforce and patient identities are invitation-controlled and tenant-bound.
- MFA is mandatory for workforce and patients. Workforce initial idle/absolute limits are 15 minutes/12 hours; patient limits are 30 minutes/24 hours; privileged step-up is 5 minutes. Security owns configurable ceilings and may shorten them by profile.
- Sessions use high-entropy tokens stored only as cryptographic hashes, secure/HTTP-only cookies, product-specific host scope, absolute and idle expiry, assurance timestamps, revocation reason/time, and bounded activity updates.
- Recovery, invite, enrollment and proxy tokens are random, purpose-bound, short-lived, single-use, hashed at rest, rate-limited, revocable, and excluded from URLs/logs where feasible. Enumeration-safe responses are required.
- Patient CIAM remains **BLOCKED** until residency, BAA, passkey/MFA, recovery, support-access and contract questions are approved. This document does not choose a vendor.

### Flowstate workforce identities

Cloud Identity is planned for Flowstate workforce. Production privilege requires managed devices, MFA, JIT elevation, named ticket/incident/purpose, explicit resource scope, expiry, independent approval for high-risk access, and automatic revocation. Separate groups administer organization policy, deployment, database, keys, audit, and support; no single standing identity can both decrypt patient data and erase its audit trail.

### Patient, guardian, proxy and representative authority

Authority is not inferred from matching email, family relationship, billing responsibility, minor status, or possession of a link. A grant identifies the patient, proxy identity, authority type, allowed actions/data, evidence reference, verifier, effective/expiry dates, revocation, age-of-majority transition, and policy version. The policy engine checks the grant on every access. Changes require step-up, notification and audit; high-risk changes require review. Expired, revoked, conflicting or unverified authority denies.

## 4. Authorization and tenant isolation

### Access context

The Pro API creates a trusted context after authoritative authentication. It includes actor and membership IDs, tenant, role and explicit grants, patient/proxy relationship, session and MFA/step-up assurance, purpose/legal-authority code, privacy/applicability profile, request/operation ID, and server-derived source metadata. Form, query, header or job payload fields cannot override trusted identity, tenant, role or assurance.

### Deny-by-default policy

Central policy resolves action/resource, tenant activation, role/grant, patient/provider relationship, field class, purpose/legal authority, consent/authorization where applicable, release/finalization state, lifecycle/hold state, destination and assurance. Unknown action, profile, authority, relationship, purpose, destination, agreement, transfer status, consent rule, release state or policy version denies with a stable non-sensitive reason code.

The legal-policy catalog is versioned, reviewed, staged, tested, rollback-aware and owned by Legal/Privacy/Security—not tenant administrators or code defaults.

### Repositories and RLS

Only concrete Pro repositories can import the Pro Prisma client. Each method accepts trusted context, invokes policy, uses a minimal select/mutation, sets transaction-local database context, and records audit outcome. A static gate rejects direct sensitive-model access from Pro web apps, route modules, integration adapters, or unapproved workers.

PostgreSQL RLS is defense in depth for tenant rows. The runtime role cannot own regulated tables or have `BYPASSRLS`; protected tables use forced RLS where the reviewed migration permits it. Google warns that `BYPASSRLS` roles and table owners can bypass row policies.[6] Administrative/migration identities are therefore isolated, time-bound, and not available to runtime. Connection-pool tests prove context cannot leak across requests.

Composite tenant constraints and database relations prevent cross-tenant child/root references. RLS tests include reads, writes, joins, bulk operations, background jobs, guessed/swapped IDs, owner/admin roles, migrations, backup behavior, and absent context.

### Field and clinical controls

Authorization returns explicit projections; hiding a field in CSS or a component is not access control. Patient-reported data remains distinct from clinician-verified data. Draft notes can change; finalized clinical content cannot be updated or deleted and accepts only linked, reasoned, attributable amendments/late entries. Portal release is explicit. Optimistic concurrency prevents silent overwrite.

## 5. Privileged and emergency access

### Tenant clinician break-glass

Break-glass is limited to eligible tenant clinicians and a narrow patient/clinical scope; it requires current MFA/step-up, declared emergency reason, short expiry, prominent in-session indication, real-time notification, immutable intent/outcome audit, automatic revocation and mandatory Privacy/Security review. It does not bypass clinical immutability or permit bulk export. Repeated/abusive use raises an incident signal.

### Flowstate support

Flowstate staff have no clinical break-glass and no routine patient-data access. Exceptional support is JIT, approved, scoped to the minimum tenant/resource/time, device/MFA protected, audited, revoked and reviewed. Prefer tenant-supervised or metadata-only diagnosis. Production database console, bucket browsing, broad decrypt and audit deletion are not standing support privileges.

### Emergency audit mode

Normal sensitive operations fail closed when audit cannot persist. Any emergency mode must be pre-approved for a named safety/continuity scenario, time-limited, separately authorized, visibly alerted, restricted in actions/volume, and write durable local intent to an approved protected buffer for reconciliation. It cannot be invented during an outage or used for convenience.

## 6. Audit, monitoring and incident boundaries

### Security audit

Audit metadata includes event/request/operation IDs, time, tenant, actor type/opaque ID, session/assurance, action, resource type/opaque ID, purpose/legal-authority and policy version, outcome/reason, destination reference, and integrity metadata. It excludes PHI payloads, names, contact details, clinical text, file contents, tokens, request/response bodies, SQL, and free-form exception/provider messages.

Every sensitive operation has one terminal `SUCCESS`, `DENIED`, or `FAILURE`. High-risk operations persist **intent before effect** and correlated **outcome after effect**. Denied and failed events survive business rollback. Runtime audit credentials are insert-only. Retention/WORM configuration is evidence-read back; Cloud Storage Bucket Lock can prevent retained objects from being deleted/replaced before their period and a locked policy cannot be reduced or removed.[8]

Clinical history, disclosure accounting, legal case records and security audit are separate ledgers linked by opaque correlation—not merged into one overloaded log.

### Operational logs and signals

Application, edge, database, job, build and monitoring logs use allowlisted structured metadata and route templates. No PHI, free-form user content, tokens, raw identifiers in URLs, SQL bind values, file names/content, vendor payloads or unsanitized exceptions are permitted. Metrics use bounded non-personal dimensions; no patient/tenant label with cardinality or identity significance without approval.

Deterministic signals include repeated denials/cross-tenant guesses, bulk read/export, disabled-account access, MFA downgrade/recovery abuse, token abuse, outbound denies, break-glass use, privileged access, audit integrity/outage, KMS failure, malware, job reconciliation anomalies and unusual approved metadata patterns. Signals open an incident for humans; the system never declares legal reportability. Legal/Privacy owns reportability and notifications, preserving distinct discovery, containment and notice clocks plus minimal chain-of-custody evidence.

## 7. Encryption, key and secret architecture

Google Cloud encrypts stored customer content by default; Pro additionally requires verified provider encryption and separately controlled CMEK/application-layer controls appropriate to classification.[7]

- TLS and authenticated service identity are required across browser-edge, service-service, database, storage, KMS and vendor channels.
- Pro-US and Pro-Canada have separate regional key rings/keys; Standard and non-production cannot use them.
- Highest-sensitivity values use envelope encryption. A locally generated DEK encrypts data, a Cloud KMS KEK wraps the DEK, and storage retains ciphertext plus wrapped DEK/key/version metadata; the KEK stays in Cloud KMS.[7]
- Authenticated encryption context binds tenant, record, field, classification and schema/key version. Copying ciphertext to another tenant/field must fail authentication.
- Separate identities administer keys, deploy workloads and decrypt data. Runtime gets only required encrypt/decrypt permissions; humans do not receive raw key material.
- Rotation, rewrap, disable, destruction, restoration and compromise are runbook-controlled and tested. Key loss and KMS outage never trigger plaintext storage or an embedded-key fallback.
- Secret Manager stores database credentials, webhook secrets and vendor credentials. Secrets are versioned, rotated, access-logged, excluded from source/CI output, and unique per plane/environment/service.
- Search/equality on encrypted fields is disabled unless a separately approved minimization, blind-index or tokenization design is justified and threat-reviewed.

## 8. File security

Files enter a private quarantine bucket under opaque names. The server records tenant, uploader, provenance, claimed/observed type, size, hash, classification, intended patient/encounter, scan state and lifecycle. Controlled types and size limits are profile-specific. A fail-closed malware/active-content pipeline scans before release; scanner unavailability, mismatch or inconclusive result retains quarantine.

Released files use immutable versions and append-only amendments, not overwrite. Every read rechecks actor, authority, purpose, release state and lifecycle and records audit. Delivery is short-lived, non-cacheable as approved, safe-content-disposition, anti-sniffing and frame/CSP protected. Browsers never hold bucket credentials or durable object URLs. DICOM/PACS remains a separately gated connector.

Malicious archives, polyglots, MIME/header spoofing, path traversal, unsafe filenames, decompression bombs, scanner bypass, stale signed URL, cross-tenant object key and infected-backup restoration are explicit negative tests.

## 9. Privacy and lifecycle controls

- Collect only profile-enabled fields for an approved purpose. SSN/SIN, government IDs, biometrics, genetics, diagnoses, treatments and unrestricted narratives are disabled by default and require specific authority, security, access and retention approval.
- Consent, HIPAA authorization, acknowledgement, contract acceptance and non-consent legal authority are distinct versioned records. Withdrawal is prospective; lawful retained history is not erased.
- Lifecycle policy is resolved from approved organization/customer status, service location, patient residence where relevant, record origin, care relationship, payer/public-body involvement, contract, destination and overrides.
- Retention is record/profile/age/provider/jurisdiction/contract specific. Unknown or conflicting policy blocks disposition and opens review.
- Legal holds are scoped, independently controlled and audited. No destructive cascade can bypass hold, rights, custody, export or retention review.
- Rights requests use authenticated, risk-based verification and stateful review. Customer authority makes profile-specific decisions; secure fulfilment and legally scoped disclosure accounting are distinct from security audit.
- Offboarding separates commercial cancellation from custody/control, continued required access, export, holds, integrations, retention and destruction. Nonpayment cannot delete records or block legally/emergency-required access.
- Backups expire and reconcile truthfully under policy; the product does not promise immediate mutation of immutable backups.

## 10. GCP isolation and residency controls

Pro-US primary is `us-east4` (Northern Virginia) with same-country DR in `us-east1` (South Carolina). Pro-Canada primary is `northamerica-northeast2` (Toronto) with same-country DR in `northamerica-northeast1` (Montréal).[2][3] There is no selected Vancouver region and no BC-only hosting claim.

Each plane has separate workload and recovery/archive projects, networks, databases, buckets, backups, keys, logs, service accounts, secrets, build promotion and access groups. Organization policies constrain allowed resource locations; Google describes resource-location policies as a way to restrict resource creation and replication locations.[10] Controls must be read back from the deployed services because location policy does not settle identity, support, DNS, billing, build, control-plane or vendor transfer questions.

Cloud SQL HA provides synchronous zonal redundancy in one region.[4] Cross-region replicas are asynchronous and can have non-zero RPO, so regional failover is manual, declared and reconciled.[5] No plane fails into the other country. Google Cloud's shared-responsibility guidance emphasizes that customers must identify and configure the controls needed for their workloads and data locations.[9]

## 11. Threat model and control response

| Threat | Primary control response | Required evidence |
|---|---|---|
| Credential stuffing/account takeover | Invitation, MFA, rate limits, enumeration-safe flows, secure recovery, idle/absolute expiry, session revocation, risk signals. | Auth/recovery adversarial tests; rate-limit and revocation exercise. |
| Session/token theft | HTTP-only scoped cookies, hashes at rest, short/purpose-bound links, no logs/URLs, step-up, revocation. | Browser/network/log canary; stolen/replayed token tests. |
| Tenant-ID/record-ID guessing | Policy relationship check, minimal repositories, composite tenant constraints, forced RLS. | Cross-tenant read/write/join/bulk tests in PostgreSQL. |
| Privilege or provider overreach | Explicit grants/projections, care relationship, purpose, release state, field-level policy, audit. | Positive/negative role-resource-purpose matrix. |
| Proxy/guardian misuse | First-class scoped authority, evidence/dates, step-up, notification, expiry/revocation/majority transitions. | Transition and revoked/expired/conflicting authority tests. |
| Finalized record tampering | Immutable final state, append-only amendment, concurrency, provenance, audit. | DB constraints plus update/delete/amendment tests. |
| Malicious or misclassified upload | Quarantine, type/hash/size controls, fail-closed scan, immutable version, safe download. | Malware/polyglot/timeout/quarantine and restore tests. |
| Direct database/vendor bypass | Backend-only credentials, package/import static gate, egress controls, destination registry/gateway. | Build-time bypass fixture and runtime network/IAM read-back. |
| SQL/pool tenant-context leakage | Parameterized repository calls, transaction-local context, forced RLS, pool reset tests. | Alternating-tenant concurrency test. |
| Insider/support browsing | No routine access, managed identity/device, JIT scope/approval/expiry, metadata-first support, audit/review. | IAM inventory, access approval/revocation drill, audit correlation. |
| Audit suppression/tampering | Separate append-only credential/store, independent failure events, intent/outcome, WORM after approval, fail closed. | Permission proof, outage test, missing-outcome reconciliation, retention read-back. |
| PHI leakage to logs/URLs/artifacts | Structured allowlist/redaction, templated routes, synthetic-only tests, no telemetry by default. | Canary scans of logs, browser, traces, screenshots, CI and providers. |
| KMS/key misuse or loss | Separate plane/key duties, AEAD context, minimum IAM, rotation/disable/compromise runbooks, no fallback. | Wrong-context/tamper/disabled-key tests and recovery exercise. |
| Cross-border/vendor disclosure | Origin/profile resolution, destination/agreement/transfer allowlist, minimization, outbox and disclosure audit. | US/Canada/unknown destination negative tests; registry/evidence review. |
| Job replay or ambiguous vendor result | Atomic outbox, stable idempotency, leases, durable intent, uncertain state and reconciliation before retry. | Crash/replay/timeout/provider-readback tests. |
| Destructive cascade/retention error | Central lifecycle and hold registry, dry-run planner, no direct delete, independent approval, backup reconciliation. | Hold race, unknown policy, cascade inventory and restore tests. |
| Supply-chain compromise | Separate build projects/promotion, pinned/reviewed dependencies, Artifact Registry/Analysis, signed provenance, synthetic builds. | CI policy and artifact/IaC read-back. |
| Regional outage | Regional HA, same-country DR, manual incident decision, lag/RPO reconciliation and rehearsed failback. | Restore/failover exercise with measured outcomes.[4][5] |

## 12. Fail-closed matrix

| Missing or failed dependency | Default |
|---|---|
| Identity, session, MFA or step-up | Deny. |
| Tenant, role, relationship, proxy authority or care assignment | Deny. |
| Applicability/profile, purpose/legal authority, consent rule or release state | Deny and route to review. |
| Database transaction context or RLS assurance | Deny/no rows; alert on invariant breach. |
| Audit persistence | Deny sensitive operation; approved emergency mode only. |
| KMS/encryption | Deny; never persist/return plaintext as fallback. |
| File scan/type/classification | Quarantine. |
| Destination, agreement, region or transfer approval | Block outbox item. |
| Provider response | Mark uncertain and reconcile; do not blind retry. |
| Retention/hold policy | Retain/block destruction. |
| Clinical concurrency/final state | Reject mutation; require amendment/reconciliation. |
| Region | No automatic cross-country routing; invoke same-plane DR decision. |

## 13. Control evidence and activation

Before a customer/profile/module can process regulated production data, the dossier must link requirement, control, test, owner, implemented configuration, technical verification, operational exercise, legal review, applicable agreements and explicit profile approval. Minimum evidence includes:

- exact GCP project/service/region/IAM/key/log/backup configuration read-back;
- executed applicable agreements and approved vendor/destination registry metadata;
- complete data inventory and flows;
- authorization/RLS/adversarial test output;
- session/MFA/recovery and JIT privileged-access exercises;
- audit completeness, append-only and outage evidence;
- log/browser/artifact canary results;
- KMS/encryption/rotation/restore evidence;
- file quarantine and malware-pipeline evidence;
- lifecycle/hold/disposition/offboarding and backup reconciliation;
- rights fulfilment, incident tabletop, restore and regional failover exercises;
- independent security assessment, counsel/Privacy/Security review and executive risk approval.

Missing human roles, policies, training, sanctions, device rules, incident coverage, contracts, vendor approval, risk acceptance or evidence are blockers. No code agent may mark them complete.

## Sources

[1] [HIPAA Compliance on Google Cloud](https://cloud.google.com/security/compliance/hipaa)  
[2] [Google Cloud regions and zones](https://docs.cloud.google.com/compute/docs/regions-zones)  
[3] [Cloud Run locations](https://docs.cloud.google.com/run/docs/locations)  
[4] [Cloud SQL for PostgreSQL high availability](https://docs.cloud.google.com/sql/docs/postgres/high-availability)  
[5] [Cloud SQL disaster recovery](https://docs.cloud.google.com/sql/docs/postgres/intro-to-cloud-sql-disaster-recovery)  
[6] [Cloud SQL data privacy strategies](https://cloud.google.com/sql/docs/postgres/data-privacy-strategies)  
[7] [Cloud KMS envelope encryption](https://cloud.google.com/kms/docs/envelope-encryption)  
[8] [Cloud Storage Bucket Lock](https://docs.cloud.google.com/storage/docs/bucket-lock)  
[9] [Shared responsibilities and shared fate on Google Cloud](https://docs.cloud.google.com/architecture/framework/security/shared-responsibility-shared-fate)  
[10] [Google Cloud regulatory compliance and privacy guidance](https://docs.cloud.google.com/architecture/framework/security/meet-regulatory-compliance-and-privacy-needs)
