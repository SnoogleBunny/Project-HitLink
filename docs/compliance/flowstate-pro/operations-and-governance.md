# Flowstate Pro operations and governance

**Status:** DRAFT — OWNER_APPROVAL_REQUIRED; operational, legal, vendor, and production evidence remains `BLOCKED`  
**Scope:** Flowstate Pro only; Virginia first and British Columbia private clinics second under separate profile gates  
**Decision baseline:** Q13–Q19, Q30, Q33–Q35, Q61, Q93–Q97, Q106–Q114, Q117–Q121, Q129–Q143, Q158, Q165–Q166, Q194–Q206  
**Non-claim:** This is a proposed operating model, not legal advice, a compliance certification, an executed agreement, or proof of operational readiness.

## 1. Operating principles

1. **Profile, not product-wide, activation.** A customer may process regulated production data only when the exact organization, customer/entity classification, jurisdiction, service/record flow, modules, regions, vendors, agreements, policy versions, operating envelope, evidence and named approvals are complete.
2. **Unknown fails closed.** Missing human owner, counsel conclusion, agreement, destination, retention rule, incident authority, operating procedure, exercise, evidence or review blocks the dependent activation or operation.
3. **Standard is not Pro.** Pro has distinct applications, identities, sessions, projects, databases, storage, backups, keys, logs, vendors, billing configuration and access groups. Pro operations never use Standard customer data, credentials, vendors or support access.
4. **Humans own legal and clinical decisions.** Automation may collect facts, enforce approved policy, preserve evidence and route work; it does not decide legal applicability, reportability, notice, record custody, retention, representative authority, rights exceptions, agreement sufficiency or risk acceptance.
5. **Synthetic evidence by default.** Development, tests, previews, screenshots, traces, demos and sandbox exercises use unmistakably synthetic data. Contracts, legal advice, personnel records, incident evidence and production secrets remain in approved protected systems; the repository contains only approved metadata and references.
6. **No hidden exception.** Temporary access, emergency continuity, profile suspension, vendor exception, delayed review or residual risk needs a named owner, scope, expiry, audit trail, review and rollback/disable path.

## 2. Accountability model

No production profile is eligible until each required function has a named natural person, named delegate, authority boundary, contact/escalation route, evidence location and review cadence. One person may hold compatible duties in a small organization; an independent second approver may not approve their own high-risk action or residual risk.

| Function | Accountable duties | Required operating evidence | Initial state |
|---|---|---|---|
| Executive risk owner/signatory | Resources the program; accepts residual business risk; approves launch and claims only with required reviewers. | Named appointment, decision record, launch/claim approval. | `BLOCKED` |
| Security Official / Security-Privacy lead | Risk analysis, technical safeguards, access governance, security policies, training, incident/security review. | Appointment, policy catalog, risk register, review records. | `BLOCKED` |
| Privacy lead | Privacy program, responsibility matrices, data inventory, rights, purpose/authority catalog, retention/hold and privacy incident coordination. | Appointment, approved matrix/catalog references, rights and review evidence. | `BLOCKED` |
| Virginia and BC counsel | Customer/profile applicability, legal values, contracts, claims and notice determinations within remit. | Non-privileged decision metadata and protected evidence reference. | `COUNSEL_REVIEW_REQUIRED` |
| Customer record authority | Customer decisions allocated for clinical custody, representative authority, rights, releases, retention and disclosures. | Signed responsibility matrix and delegated-authority record. | `BLOCKED` |
| Incident commander | Declares operational incident, coordinates containment, clocks, evidence, escalation and closure. | On-call role, exercise records, incident runbook. | `BLOCKED` |
| Platform/Operations | Regional infrastructure, identity operations, privileged access, backup/restore, DR, monitoring, deployment and access execution. | Runbooks, configuration read-back, restore/failover/JIT exercises. | `BLOCKED` |
| Vendor owner / Procurement | Due diligence, agreement lifecycle, subprocessor/region/support review and disablement on drift. | Vendor register, approval/expiry review, agreement reference. | `BLOCKED` |
| Engineering | Implements approved controls and maintains repeatable static, unit, integration and browser tests. | Exact revision, test output, change record. | `SPECIFIED` |
| Database owner | RLS, integrity, migrations, backup/restore and data-lifecycle technical evidence. | Migration and adversarial RLS/restore evidence. | `BLOCKED` |
| QA/Assurance | Independent verification, evidence completeness, candidate/profile reconciliation and release recommendation. | Review record and evidence manifest. | `BLOCKED` |
| Independent assessor | Independent security assessment and retest of agreed scope. | Engagement/scope, protected report reference, remediation/retest record. | `BLOCKED` |

## 3. Required policy and register set

Policies and registers are versioned, owner-approved, effective-dated, review-dated, distributed to affected staff, linked to controls and evidence, and explicitly superseded rather than silently overwritten. Legal values and public wording require the named human approvals in the legal matrix and decision register.

| Artifact | Minimum content | Owner | Activation behavior until current |
|---|---|---|---|
| Customer responsibility matrix | Custody/control, roles, rights, releases, retention, holds, incidents, support and offboarding allocation for each profile. | Privacy lead + customer record authority | Customer/profile blocked. |
| Applicability and policy catalog | Jurisdiction, purpose/authority, consent/authorization, representative, rights, retention, hold, transfer and incident inputs with source/approver/version. | Counsel + Privacy lead | Dependent operation denies or routes to review. |
| Asset/data/risk register | Data/stores/flows/vendors, threat/risk, treatment, owner, due date, residual-risk acceptance and re-review trigger. | Security Official | New profile/module blocked. |
| Access and privileged-access policy | Joiner/mover/leaver, MFA/device, JIT, approval, logging, review, emergency and break-glass boundaries. | Security Official + Operations | No access beyond minimum non-production discovery. |
| Incident and breach-response runbook | Discovery/containment/assessment/notice clocks, roles, evidence, counsel/customer escalation, communications approval and lessons learned. | Incident commander + Privacy lead | No production profile activation. |
| Backup, DR and key-recovery runbooks | Restore, same-country DR, reconciliation, key loss/rotation, audit/scanner/vendor outage and service resumption. | Operations | No profile activation. |
| Rights, release, export, retention, hold and offboarding procedures | Verification, assigned decision authority, secure fulfilment, disposition review, backup truth, custody and suspension continuity. | Privacy lead + customer record authority | Automated destructive action disabled; unknown policy retains. |
| Vendor and destination register | Purpose, classes/fields, regions, transfers, agreement/evidence, support, retention/deletion, expiry/review and disable action. | Vendor owner + Privacy lead | Destination disabled. |
| Claims register | Exact approved wording, audience, profile/configuration, substantiation, limitations, approvers and expiry. | Executive risk owner + counsel | Claim prohibited. |
| Evidence catalog | Control/profile/candidate/configuration, producer/reviewer, date/result/hash, protected location, retention and access. | QA/Assurance + Security Official | Gate cannot pass. |

## 4. Workforce and access operations

### 4.1 Joiner, mover and leaver

- Grant only a named role with minimum scope after required screening, confidentiality/acceptable-use acknowledgement, role-specific training, MFA/device enrollment and manager/owner approval.
- Privilege changes require an approved request, justification, affected resources, expiry where temporary and audit correlation.
- Transfer, suspension and termination revoke sessions, invitations, MFA/recovery material, groups, device access, API tokens, secrets and vendor access promptly; the revocation is independently checked and retained as evidence.
- Quarterly, Security/Privacy and customer owners review workforce, privileged, service and vendor access. Stale, orphaned, excessive or unreviewed grants are removed or escalated.
- No shared human accounts. Service identities are separate by plane/environment and reviewed for least privilege.

### 4.2 Exceptional Flowstate access

Routine Flowstate access to patient data is prohibited. Support is metadata-first. Any exceptional production support requires a named ticket or incident, customer/authorized approval as applicable, current managed device and MFA, minimum tenant/resource scope, short expiry, audit, automatic revocation and post-access review. It is not clinical break-glass.

Tenant clinician break-glass is separately limited to eligible tenant clinicians, a specific patient/clinical scope, current step-up, emergency reason, short expiry, notification, immutable intent/outcome audit and mandatory Privacy/Security review. It cannot bypass record immutability, release policy or bulk-export controls.

## 5. Vendor, destination and change governance

A vendor is not approved because it is common, markets compliance, has a generic agreement or appears in a test environment. Before a destination may receive classified data, the vendor owner and required reviewers record the exact service/configuration, purpose, allowed classes/fields, plane/region, onward subprocessors, support access, security/identity model, retention/deletion/backup behavior, incident/reconciliation method, agreement and transfer status, evidence reference, effective/expiry date and disable action.

- Unknown, expired or changed agreement, region, subprocessor, support path, purpose or data class disables the destination or blocks the outbox item.
- Vendor changes and material application/schema/flow/region/policy/identity changes trigger data, legal, security, operations, QA and customer-profile review before release.
- Change records identify source decision, affected profiles/planes/data classes, migration/rollback or forward-fix, test and exercise plan, approvers, evidence and expiry/review date.
- Emergency change procedures are pre-approved, narrowly scoped, time-limited, audited and followed by independent review; they do not permit a legal/policy or vendor decision to be invented during an incident.

## 6. Incident, continuity and suspension operations

### 6.1 Incident lifecycle

Automated PHI-free signals and human reports open a reviewable incident. The incident commander coordinates containment, evidence preservation, technical recovery, customer and counsel escalation, and closure. Maintain separate timestamps for discovery, containment, assessment, report/notice decision and notice; the platform never auto-declares a breach, reportability or notification obligation.

Exercise at least synthetic scenarios for cross-tenant access, account compromise, malicious file, audit outage, KMS/key failure, lost export, vendor incident, insider/support misuse, disallowed transfer and regional outage. Findings receive owner, due date, remediation or named residual-risk decision; exercises without closure evidence do not establish readiness.

### 6.2 Continuity, restore and regional recovery

- Restore only into an isolated same-plane recovery boundary; inventory/reconcile data, audit, authorization, policy, lifecycle and keys before any release.
- Whole-region recovery is manual, same-country and incident-declared. Pro-US does not fail into Canada and Pro-Canada does not fail into the US.
- RTO/RPO are internal engineering targets until independently exercised and separately approved for commercial use.
- A failing tenant-isolation, audit, key, file-quarantine, destination or clinical-integrity control triggers the smallest safe rollback: module disable, destination disable, tenant/profile suspension or regional recovery. Preserve audit, rights, holds, custody, required access and export obligations. Do not move the customer to Standard.

## 7. Review cadence and evidence lifecycle

| Review | Minimum cadence / trigger | Required output |
|---|---|---|
| Access and privileged access | Quarterly; role, incident or vendor change | Grant/revocation review, exceptions and remediation. |
| Policy, legal input and claims | Before effective/expiry date; law, contract, profile or workflow change | Version decision, approval metadata, supersession/rollback record. |
| Vendor/destination | Before enablement; renewal, subprocessor/region/support change | Current due diligence/agreement/transfer review or disablement. |
| Risk/data/flow inventory | At least annually; schema, data class, store, log, vendor or browser-flow change | Updated inventory, risk treatment and control impact. |
| Training, sanctions and workforce safeguards | Before access and annually; role change | Completion/acknowledgement and exception escalation. |
| Backup/restore, DR, key and outage continuity | Scheduled by approved operational plan; material topology change | Exercise result, reconciliation, measured outcome and findings. |
| Incident tabletop | At least annually per relevant US/Canada profile; material incident/control change | Timeline, decisions, communications approvals, findings and closure. |
| Evidence and profile gate | Every candidate/profile activation; evidence expiry/change | Exact manifest, reviewer result, blockers and approval/denial. |

Evidence is profile- and candidate-specific. A passing check or exercise for one region, vendor, customer class or build cannot be reused to claim approval for another without the required review.

## 8. Activation and suspension gate

The Operations/QA recommendation for a regulated profile must show all applicable controls as technically verified and operationally exercised; named human roles/on-call coverage; current policies/training/access/vendor records; agreement and counsel references; restore/failover/incident/JIT evidence; the exact candidate/configuration/region/vendor list; unresolved-risk disposition; customer responsibility matrix; and explicit approvals required by the decision register.

Until that package is complete, keep production credentials, deployment, PHI-capable evaluation and regulated tenant activation disabled. If a prerequisite expires or fails, suspend the smallest affected destination/module/profile, preserve legally/emergency-required continuity and evidence, and require re-approval before reactivation.

## 9. Immediate blockers and next authorized work

`BLOCKED`: named role holders/delegates; first Virginia and BC private-clinic profiles; legal-policy catalog; patient CIAM; cloud/vendor agreements and covered configurations; customer responsibility matrices; vendor/destination register; policy/incident/continuity runbooks; screening/training/sanction program; protected evidence system; risk analysis; independent assessment; insurance review; public/contractual claims.

The next authorized work is Phase 0 documentation and synthetic, read-only discovery only: assign non-production documentation owners, create protected external evidence references, inventory Standard/Pro boundaries without changing Standard, and route legal/vendor questions to the named human owners. Do not provision vendors, use production data or credentials, deploy, activate a profile, or make a compliance claim.

## Sources

- `README.md`, `decision-register-and-open-items.md`, `legal-applicability-matrix.md`, `control-and-evidence-matrix.md`, `data-classification-and-flows.md`, `system-design.md`, `security-privacy-architecture.md`, `product-requirements-document.md`, and `roadmap.md` in this directory.
- [45 CFR 164.308, 164.310, 164.312 and 164.316](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C)
- [45 CFR 164.530](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.530)
- [HHS Business Associate guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html)
- [BC PIPA](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01)
- [PIPEDA](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/FullText.html)
