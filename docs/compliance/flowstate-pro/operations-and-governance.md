# Flowstate Pro operations and governance

**Status:** SPECIFIED — G0 `BLOCKED`; WP1.x unauthorized; staffing, operating evidence, exercises, legal review, vendor approval, profile approval, and production authorization remain `BLOCKED`

**Scope:** Flowstate Pro only; Virginia first and British Columbia private clinics second under separate profile gates

**Decision baseline:** Q13–Q19, Q30, Q33–Q35, Q61, Q93–Q97, Q106–Q114, Q117–Q121, Q129–Q143, Q158, Q165–Q166, Q194–Q206

**WP0.3 reconciliation:** 2026-09-23

**Non-claim:** This specification does not staff a role, complete a review or exercise, approve a vendor or legal value, establish insurance coverage, or prove compliance or production readiness.

This document specifies access review, screening, training, sanctions, incident command, vendor review, risk analysis, penetration/security assessment, insurance review, and protected evidence handling. Missing human ownership or evidence keeps the dependent control and gate `BLOCKED`.

## 1. Operating rules

1. **Profile-specific activation.** Regulated activity requires the exact organization, customer/entity classification, jurisdiction, service and record flow, modules, data classes, regions, vendors, agreements, policy versions, operating envelope, candidate/configuration, evidence, and named approvals.
2. **Unknown fails closed.** Missing or expired human ownership, policy, training, review, exercise, assessment, insurance review, vendor decision, agreement, destination, evidence, or approval blocks the dependent profile, module, destination, claim, gate, or operation.
3. **Standard remains separate.** Pro operations do not use Standard identities, sessions, data, credentials, vendors, billing, backups, keys, logs, or support access. There is no Standard-to-Pro migration or fallback.
4. **Humans own legal, clinical, and risk decisions.** Automation may collect facts, enforce approved versions, preserve evidence, and route work; it does not decide applicability, reportability, notice, custody, retention, rights, representative authority, agreement sufficiency, insurance sufficiency, or residual-risk acceptance.
5. **Protected evidence stays protected.** Git contains approved templates and metadata/reference-only records, not PHI/PII, secrets, contracts, legal advice, personnel records, incident bodies, assessor workpapers, customer exports, or vendor-console content.
6. **No silent exception.** Temporary access, emergency continuity, delayed review, vendor exception, exercise exception, or residual risk requires a named authorized owner, scope, reason, expiry, evidence reference, independent approval where required, and rollback/disable path.

## 2. Accountability, authority, and coverage

Every required function must be assigned to a named natural person before its dependent gate can advance. The appointment record must identify primary and delegate, remit, decision limits, prohibited combinations, escalation route, effective/expiry dates, succession or absence coverage, evidence location, and review cadence. Unknown assignments remain `BLOCKED`; this document does not invent names or imply staffing.

One person may hold compatible duties in a small organization only when the role register records the combination and conflict controls. A person must not approve their own privileged access, high-risk change, evidence sufficiency, assessment exception, residual risk, or release recommendation. Designated high-risk actions require an independent second approval. Delegates receive no broader authority than the primary and must use their own identity and audit trail.

| Function | Accountable authority | Required segregation / delegate boundary | Required evidence | Initial state |
|---|---|---|---|---|
| Executive risk owner/signatory | Resources the program; accepts residual business risk; approves launch and claims only with required reviewers. | Cannot replace counsel, Security/Privacy, customer record authority, assessor, or QA conclusions; residual-risk acceptance requires independent review. | Appointment, delegation, decision and expiry records. | `BLOCKED` |
| Product owner | Owns product/profile scope, workflow and content requirements, activation intent, commercial-trigger routing, and packet sequencing. | Cannot supply legal, Security/Privacy, operations, evidence, customer-authority, or production approval; delegates stay within recorded product remit. | Appointment, scope/decision, delegation, review, and supersession records. | `BLOCKED` |
| Architecture owner | Owns approved system boundaries, dependency/resource topology, Standard/Pro and country-plane separation, and architecture change review. | Cannot self-approve implementation evidence, production configuration, residual risk, or release; material boundary changes require Security/Privacy, Operations, Database, and QA review. | Appointment, architecture decision, change review, delegation, and approval records. | `BLOCKED` |
| Security Official / Security-Privacy lead | Security program, risk analysis, access governance, safeguards, training, incidents, assessments, and evidence protection. | Cannot self-approve privileged access, close their own assessment exception, or alone approve launch. | Appointment, policy/risk/access/assessment review records. | `BLOCKED` |
| Privacy lead | Responsibility matrices, data/flow inventory, purpose/authority coordination, rights, retention/hold, disclosure, offboarding, and privacy incidents. | Counsel and customer authority retain their decisions; Privacy does not invent legal values. | Appointment and approved catalog/workflow references. | `BLOCKED` |
| Qualified Virginia and BC counsel | Customer/profile applicability, legal-policy values, agreements, claims, and notice determinations within remit. | Legal advice and contract bodies remain outside Git; technical reviewers cannot substitute. | Non-privileged decision metadata and protected references. | `COUNSEL_REVIEW_REQUIRED` |
| Customer record authority | Customer-owned custody/control, representative authority, rights, release, retention, disclosure, and clinical continuity decisions. | Cannot delegate beyond documented customer authority; Flowstate cannot assume this role by default. | Responsibility and delegated-authority records. | `BLOCKED` |
| Incident commander | Declares and commands operational incidents; coordinates containment, recovery, evidence, escalation, and closure. | Legal/Privacy owns reportability and notice; communications require approved spokesperson/legal review. | On-call/coverage roster, runbook, exercise and incident records. | `BLOCKED` |
| Communications owner | Coordinates approved customer, regulator, public, sales, support, and internal incident wording, audience, channel, and release timing. | Cannot decide reportability, recipients, or legal content; every external communication requires exact Legal/Privacy approval and incident-command coordination. | Appointment/delegate, approved wording/audience/channel, release authorization, distribution, and correction/withdrawal records. | `BLOCKED` |
| Platform/Operations | Executes identity, infrastructure, deployment, backup/restore, DR, monitoring, access, revocation, and continuity procedures. | Cannot self-approve JIT access or erase/rewrite audit; key, database, deployment, and audit duties remain separated. | Runbooks, approvals, read-back, exercise and revocation records. | `BLOCKED` |
| Vendor owner / Procurement | Due diligence, destination/agreement lifecycle, renewal/change monitoring, and disablement. | Cannot treat sales claims or generic terms as Security/Privacy, counsel, or executive approval. | Vendor register and protected review/agreement references. | `BLOCKED` |
| Engineering | Implements approved controls and maintains repeatable verification. | Cannot self-award operational exercise, evidence completeness, legal review, profile approval, or G0. | Exact revision, test output, change record. | `SPECIFIED` |
| Database owner | RLS/integrity, migrations, backup/restore, and lifecycle technical controls. | Runtime, migration, key, and audit privileges remain segregated. | Migration, RLS, restore and lifecycle evidence. | `BLOCKED` |
| QA/Assurance | Independently verifies candidate/control evidence and recommends gate disposition. | Must not approve work they produced without an independent reviewer. | Review record and evidence manifest. | `BLOCKED` |
| Independent assessor | Performs qualified independent penetration/security assessment and retest. | Scope and findings cannot be controlled or closed solely by the implementation team. | Engagement/scope, protected report reference, remediation and retest records. | `BLOCKED` |
| People owner | Administers screening, acknowledgements, training, sanctions, and joiner/mover/leaver evidence. | Receives minimum necessary security information; personnel details remain in the approved HR system. | Protected workforce-control records and access correlation. | `BLOCKED` |

A missing primary, delegate, on-call route, independent approver, succession plan, or authority record keeps the affected controls and release gate `BLOCKED`.

Procedure shorthand resolves to the section 2 registry: `Product`, `Operations`, `QA`, `Vendor owner`, `Security/Privacy`, `Privacy/Security`, `customer authority`, and `qualified independent assessor` mean Product owner, Platform/Operations, QA/Assurance, Vendor owner/Procurement, the Security Official and Privacy lead within separate remits, Customer record authority, and Independent assessor respectively. An `accountable manager`, spokesperson, evidence producer, reviewer, or second approver is an assignment of a registered function and must inherit that function's named-person, delegate, authority-limit, segregation, coverage, and succession requirements; shorthand never creates an ungoverned function.

## 3. Required policies and registers

Policies and registers are versioned, owner-approved, effective-dated, review-dated, distributed to affected people, mapped to controls, and explicitly superseded rather than silently overwritten. Legal values remain owned by `legal-applicability-matrix.md`; control traceability and release gates remain owned by `control-and-evidence-matrix.md`.

| Artifact | Minimum contract | Accountable function | Fail-closed result until current |
|---|---|---|---|
| Role and delegation register | Named primary/delegate, remit, conflicts, independent approvals, escalation, succession, dates, review. | Executive risk owner + Security/Privacy | Affected gate and privileged action `BLOCKED`. |
| Customer responsibility matrix | Custody/control, rights, representatives, releases, retention/holds, incidents, continuity, support, and offboarding allocation. | Privacy lead + customer record authority | Customer/profile activation `BLOCKED`. |
| Applicability and legal-policy catalog | Jurisdiction, purpose/authority, consent/authorization, rights, retention, hold, transfer, disclosure, incident, notice, and approval metadata. | Counsel + Privacy lead | Dependent action denied or routed to review. |
| Asset, data, flow, and risk registers | Data/stores/flows/vendors, threat/risk, treatment, owner, due date, residual-risk decision, and re-review trigger. | Security Official + Privacy lead | New or changed profile/module/destination `BLOCKED`. |
| Access and privileged-access policy | Joiner/mover/leaver, screening, device/MFA, JIT, approvals, logging, review, emergency access, revocation. | Security Official + Operations + People owner | Access denied beyond approved non-production discovery. |
| Incident and notice runbook | Discovery, containment, assessment, reportability/notice, evidence, counsel/customer escalation, communications, recovery, closure. | Incident commander + Privacy lead + Communications owner | Production profile activation `BLOCKED`. |
| Continuity runbooks | Backup/restore, same-country DR, key recovery, audit/scanner/vendor outage, rights/offboarding continuity, and profile suspension. | Operations | Profile activation or affected operation `BLOCKED`. |
| Vendor and destination register | Service/configuration, purpose, classes/fields, region/transfer, support/subprocessors, agreements, retention/deletion, expiry/change, evidence, and disable action. | Vendor owner + Privacy/Security | Destination disabled and queued work blocked. |
| Claims and insurance decision records | Exact claim scope/substantiation/approvers/expiry; insurance reviewer, expert advice reference, decision, gaps, renewal/change trigger. | Executive risk owner + qualified counsel + Product owner | Claim prohibited; insurance-dependent launch decision `BLOCKED`. |
| Evidence catalog | Artifact/control/profile/candidate/configuration binding, producer/reviewer, result, hash/integrity, protected location, access, retention/expiry, and review state. | QA/Assurance + Security Official | Evidence-dependent gate cannot pass. |

## 4. Workforce and access lifecycle

### 4.1 Joiner

Before access, the accountable manager, People owner, and Security/Privacy must record role-risk screening appropriate to the role; confidentiality and acceptable-use acknowledgement; privacy, security, incident, and role-specific training; device compliance; MFA enrollment; manager/owner approval; least-privilege role and resource scope; and access expiry where temporary. Screening details and personnel files remain outside Git.

No training waiver, missing screening, missing acknowledgement, unmanaged device, missing MFA, or absent approver may be treated as pending-after-access. Access remains denied.

### 4.2 Mover

Role, team, customer, plane, privilege, or duty changes require a new request and conflict review. Remove obsolete access before or atomically with the new grant; re-screen or retrain when role risk changes; update delegations, on-call coverage, device requirements, and JIT eligibility; and independently verify high-risk changes. A mover does not inherit prior authority by convenience.

### 4.3 Leaver, suspension, and sanctions

Suspension or termination revokes sessions, invitations, factors/recovery paths, groups, privileged roles, device trust, API tokens, secrets, vendor access, on-call authority, and active JIT grants. Revocation is independently checked and correlated to the workforce event without copying personnel details into the evidence dossier.

The sanctions process must define consistent, role-appropriate handling for policy or access violations, preserve due process and confidentiality, coordinate incident action where needed, and verify access restriction or revocation. This document does not invent sanction outcomes.

### 4.4 Recurring training and review

Privacy/security/incident training is required before access and at least annually, plus targeted training after material role, policy, incident, system, data, vendor, or legal change. Phishing, incident, privileged-access, and role-specific exercises follow the approved plan. Missing, expired, or failed required training suspends the affected access or duty until resolved.

Security/Privacy and customer owners review workforce, privileged, service, vendor, recovery, and dormant access quarterly. Stale, orphaned, excessive, conflicting, expired, or unsupported grants are removed or escalated. No shared human accounts are permitted.

## 5. Emergency and support access separation

### 5.1 Tenant clinician break-glass

Tenant clinician break-glass is limited to an eligible clinician, a specific patient and clinical purpose, current MFA/step-up, declared emergency reason, short expiry, prominent indication, real-time notification, immutable intent/outcome audit, automatic revocation, and mandatory Privacy/Security review. It cannot bypass finalized-record immutability, release policy, legal hold, or bulk-export controls.

### 5.2 Flowstate support JIT

Flowstate staff have no clinical break-glass and no routine patient-data access. Support is metadata-first and preferably tenant-supervised. Exceptional production support requires a named ticket or incident, approved purpose, customer/authorized approval where applicable, managed device, MFA, independent approval for high-risk access, minimum tenant/resource/action scope, short expiry, full audit, automatic revocation, and post-access review.

Break-glass authority never converts into support authority, and support JIT never converts into a tenant clinical role. Missing approval, audit, managed device, MFA, scope, expiry, or reviewer denies the access.

## 6. Incident command and notice ownership

1. A deterministic PHI-free signal or human report opens a reviewable incident with discovery time, source, severity hypothesis, owner, and evidence-preservation action.
2. The incident commander owns operational command, containment, technical recovery, task assignment, status cadence, and closure coordination.
3. Security/Privacy preserves separate discovery, containment, assessment, reportability/notice-decision, and notice timestamps. No timer is collapsed or overwritten.
4. Legal/Privacy, with the customer record authority and other required authorities, exclusively determines legal/contractual reportability, recipients, content, and timing. Automation and engineers do not declare a breach or decide notice.
5. Evidence uses approved chain-of-custody, access, integrity/hash, retention, and protected-location controls. Incident bodies and legal advice remain outside Git.
6. External/customer/regulator/public communications require the named Communications owner and delegate/coverage recorded under section 2, plus Legal/Privacy approval for the exact wording, audience, channel, and release timing.
7. Closure requires containment and recovery evidence, impact/decision record, owner and due date for every finding, residual-risk disposition where applicable, customer/notice follow-through, and lessons-learned review.

Required synthetic scenarios include cross-tenant access, account compromise, malicious file, audit outage, KMS/key failure, lost export, vendor incident, insider/support misuse, disallowed transfer, and regional outage. A missing runbook, commander, coverage route, counsel/privacy decision path, exercise, or closure evidence keeps `INC-01`, `INC-02`, the affected profile, and its gate `BLOCKED`.

## 7. Vendor, destination, and change governance

A vendor is not approved because it is common, markets compliance, provides generic terms, or appears in a test environment. Before enablement, the vendor owner and required reviewers must record exact service and configuration, purpose, allowed classes/fields, plane and region, transfers, subprocessors, support access, identity/security model, availability and continuity dependencies, retention/deletion/backup behavior, incident and reconciliation path, agreement status, evidence reference, effective/expiry dates, risk tier, and disable/offboarding action.

Due diligence covers security/privacy controls, independent evidence, financial/operational continuity appropriate to the dependency, breach and support obligations, data return/deletion, and configuration-specific limitations. Protected reports and agreements remain outside Git.

Renewal, expiry, service/configuration change, new region or subprocessor, support-path change, incident, control degradation, agreement change, or changed data/purpose triggers review. Unknown, expired, conflicting, or changed state disables the destination or blocks queued work; no direct-provider bypass is allowed. Disablement must revoke credentials, stop new transmissions, reconcile in-flight/uncertain work, preserve required records and audit, and execute approved return/deletion/offboarding duties.

Material application, schema, data-flow, identity, policy, region, vendor, control, or operating-envelope changes require impact analysis, tests, exercises where affected, rollback/disable steps, evidence, and named approvals before release. Emergency changes remain narrow, time-limited, audited, and independently reviewed; they cannot invent a legal or vendor decision.

## 8. Risk analysis and risk management

Before a profile or production-intended candidate advances, the Security Official coordinates a documented risk analysis across data, systems, identities, workforce, physical/operational environment, vendors, regions/transfers, clinical integrity, privacy, continuity, and customer responsibilities. The analysis binds to the exact profile, candidate, configuration, vendors, and operating envelope.

The risk register records threat/scenario, affected assets/data/profiles, likelihood and impact method, inherent risk, controls/evidence, treatment, owner, due date, current state, residual risk, accepting authority, expiry/review, and release effect. Findings cannot be closed by prose alone; treatment requires evidence or a named authorized residual-risk acceptance independent of the implementer where required.

Risk analysis is repeated at least annually and on material change, significant incident, assessment finding, vendor/control drift, new profile/data class/region, or evidence expiry. Overdue treatment, missing owner, unapproved residual risk, or a scope mismatch returns the affected profile/module/gate to `BLOCKED` or the runtime subject to `REVIEW_BLOCKED`/suspension as defined by the architecture.

## 9. Independent penetration and security assessment

A qualified independent assessor must review an approved scope covering the exact externally reachable surfaces, provider/patient/API applications, identity/session/recovery, authorization and tenant isolation, RLS/repositories, files, audit/logging, encryption/key handling, outbox/destinations, cloud/IAM/network configuration, regional separation, vendor interfaces, and applicable profile/configuration. Scope exclusions, constraints, methods, candidate identifiers, dates, and retest expectations must be explicit.

Every finding receives severity/risk rationale, owner, due date, treatment, release effect, and protected evidence reference. Remediated findings require independent retest. Exceptions require a named executive risk acceptance with Security/Privacy and assessor input, scope, rationale, compensating controls, expiry, and re-review trigger. A missing assessor, incomplete scope, open release-blocking finding, absent retest, expired exception, or missing protected report reference keeps `ASS-01` and the dependent gate `BLOCKED`.

Assessment reports and workpapers remain in the approved protected system; Git stores only non-sensitive metadata, hashes where approved, and references.

## 10. Insurance review

The executive risk owner must obtain review by the appropriate insurance/risk expert for the exact business, customer profiles, jurisdictions, services, data, vendors, contractual duties, incident response, and operating envelope. Record reviewer, date, evidence reference, decision, identified gaps, dependencies, renewal/expiry, and material-change triggers.

This specification sets no insurer, policy type, limit, deductible, exclusion, endorsement, territory, or coverage conclusion. Missing review, unresolved gap, expired policy evidence, or changed scope keeps insurance-dependent commercial, contractual, claim, and production decisions `BLOCKED`.

## 11. Required continuity and operational exercises

Exercises use synthetic data and the exact intended candidate/configuration where applicable. Each record identifies scope/profile/plane, scenario, participants and roles, start/end times, expected and measured outcomes, evidence references, deviations, owners/due dates, residual-risk decisions, retest, and gate effect. A technical test does not replace a required human exercise.

| Exercise | Minimum outcome |
|---|---|
| Backup and isolated restore | Restore into the same-plane recovery boundary; reconcile data, hashes, authorization, policy/lifecycle, audit, files, keys, configuration, and release approval. |
| Same-country regional DR/failback | Human incident declaration, replica-loss-window decision, manual promotion/routing, reconciliation, controlled failback; never cross-country failover. |
| Key recovery/rotation/disablement | Recover approved access without plaintext fallback; verify wrong-context, disabled-key, compromise, and succession paths. |
| Audit outage | Sensitive operations fail closed; any pre-approved emergency mode is bounded, alerted, durably buffered, reconciled, expired, and reviewed. |
| File-scanner outage | Files remain quarantined and inaccessible; backlog recovery does not skip scan or release review. |
| Vendor/destination outage | New transmissions stop or queue safely; uncertain effects reconcile before retry; continuity and disablement paths preserve obligations. |
| Rights and disclosure continuity | Requests, clocks, verification, human decisions, secure fulfilment, and evidence continue or enter an explicit protected backlog without automatic legal decisions. |
| Offboarding/custody continuity | Export, holds, custody, required access, staging expiry, vendor disablement, backup truth, and disposition decisions remain controlled during cancellation or outage. |
| Profile/module suspension | Stop new regulated activity at the smallest scope while preserving records, audit, rights, holds, custody, incident response, export, and approved emergency continuity. |
| Incident tabletop | Exercise command, discovery/containment/assessment/notice clocks, Legal/Privacy ownership, communications approval, evidence, recovery, closure, and lessons learned. |
| JIT and break-glass | Separately prove support JIT and tenant clinician break-glass approval, scope, expiry, revocation, audit, notification, and review boundaries. |

Exercise cadence follows section 13 and `control-and-evidence-matrix.md`. Missing, stale, failed, wrong-profile, or unresolved exercise evidence cannot satisfy a gate and keeps the affected control/profile `BLOCKED`.

## 12. Protected evidence handling

The protected evidence catalog stores metadata for each artifact: stable ID and type; control/requirement; customer/profile/plane; exact candidate/configuration/vendor/policy versions; producer; independent reviewer; date; result; exception/finding links; integrity hash or equivalent; protected location; access class; retention/expiry; supersession; and next review trigger.

Access is least privilege, logged, periodically reviewed, and separated from artifact production where required. Integrity is verified on retrieval and before gate use. Expired, missing, inaccessible, altered, wrong-candidate, wrong-profile, unreviewed, or scope-mismatched evidence cannot satisfy a control.

Repository documents are reference-only. They may contain approved non-sensitive metadata, hashes/manifests, and protected-system references. They must not contain evidence bodies consisting of PHI/PII, secrets, contracts, legal advice, personnel files, incident bodies, assessor workpapers, customer exports, or vendor-console captures. A repository statement is not operating evidence.

## 13. Review calendar and material-change triggers

| Review | Minimum cadence / trigger | Required output and fail-closed effect |
|---|---|---|
| Role, delegate, segregation, succession, and on-call coverage | Quarterly; any joiner/mover/leaver, absence, conflict, or authority change | Updated role register and coverage test; missing coverage blocks affected duty/gate. |
| Workforce, privileged, service, recovery, and vendor access | Quarterly; role, incident, vendor, device, or identity change | Grant/revocation review, exceptions, remediation; unsupported access revoked. |
| Training, acknowledgements, screening, and sanctions safeguards | Before access and at least annually; role/policy/incident/material change | Completion and exception record; expired requirement suspends access/duty. |
| Policy, legal input, responsibility, and claims | Before effective/expiry; law, contract, profile, workflow, customer, or claim change | Approved/superseded version and rollback; unresolved legal value remains `COUNSEL_REVIEW_REQUIRED`. |
| Vendor/destination/agreement | Before enablement; at least annually by approved risk tier; renewal, expiry, subprocessor/region/support/configuration/incident change | Current decision or disablement; unknown/expired state blocks destination. |
| Risk analysis and treatment | Initially and at least annually; material change, incident, assessment finding, new profile/data/region/vendor | Updated risk register/treatments/residual-risk decisions; unresolved release risk blocks gate. |
| Independent assessment and penetration retest | Before production-profile approval; material architecture/exposure change; after relevant findings; cadence set by approved risk plan | Scope/report/remediation/retest/exception references; missing or failed evidence blocks gate. |
| Insurance | Before insurance-dependent contracting/production approval; renewal/expiry; material service/profile/contract/incident change | Expert review decision and gaps; no invented coverage conclusion. |
| Continuity, outage, rights, offboarding, suspension, incident, JIT/break-glass exercises | Before first profile activation and on the cadence assigned by the control matrix; material topology/control/profile change or failed real event | Exercise and closure evidence; missing or failed exercise blocks affected gate. |
| Evidence catalog and open blockers | Quarterly and for every candidate/profile gate; artifact expiry/change | Retrieval/integrity/access review and exact manifest; deficient evidence cannot satisfy gate. |

Material change includes schema or data-class change; new or changed store, flow, log, browser surface, identity, role, authority, vendor, destination, region, transfer, agreement, subprocessor, support path, policy/legal input, clinical workflow, file type, key/audit/backup design, incident, customer profile, operating envelope, commercial claim, assessment finding, or responsible human.

## 14. Gate and suspension behavior

Operations and QA may recommend a regulated profile only when the exact candidate shows named primary/delegate coverage; current policies, screening, training, sanctions, device/MFA and access records; current vendor/agreement/destination decisions; risk and insurance reviews; independent assessment/retest; continuity, incident, JIT/break-glass, rights, offboarding, and suspension exercises; protected evidence manifest; responsibility matrix; legal decision references; residual-risk disposition; and all required approvals.

If any required person, delegate, authority, policy, training record, access review, vendor decision, agreement, risk treatment, residual-risk acceptance, assessment, retest, insurance review, exercise, evidence system, artifact, or approval is missing, expired, failed, conflicting, or unverifiable:

- the affected control and release gate remain `BLOCKED`;
- the runtime profile/module/destination remains `REVIEW_BLOCKED`, disabled, or suspended at the smallest safe scope;
- production credentials, PHI-capable evaluation, transmission, public claim, and release advancement remain disabled;
- required records, audit, rights, holds, custody, exports, incident response, and approved emergency continuity are preserved; and
- reactivation requires a new versioned approval transition after the deficiency is resolved and evidenced.

G0 remains `BLOCKED`. WP1.x is unauthorized and must not begin.

## 15. Repository references

- `decision-register-and-open-items.md` — approved product/architecture decisions, blockers, and approval state.
- `legal-applicability-matrix.md` — factual legal branches and counsel-owned values.
- `data-classification-and-flows.md` — classification, store, destination, and flow contracts.
- `control-and-evidence-matrix.md` — canonical control/test/exercise/evidence/cadence/gate traceability.
- `product-requirements-document.md`, `system-design.md`, `security-privacy-architecture.md`, and `roadmap.md` — immutable WP0.2 product and architecture contracts for this packet.
