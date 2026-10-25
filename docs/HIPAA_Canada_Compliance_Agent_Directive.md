# Flowstate Pro HIPAA and Canadian Health Privacy Agent Directive

**Status:** AI IMPLEMENTOR MANDATE — not legal advice, a compliance certification, production approval, or an executed agreement
**Scope:** Flowstate Pro only
**Detailed execution authority:** [`plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`](plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md)
**Approved decision baseline:** [`compliance/flowstate-pro/README.md`](compliance/flowstate-pro/README.md) and [`compliance/flowstate-pro/decision-register-and-open-items.md`](compliance/flowstate-pro/decision-register-and-open-items.md)

## 1. Mandate and precedence

Implement Flowstate Pro only through small, reviewable work packets. Preserve the approved product, legal, security, privacy, operational, and release gates. Do not claim that Flowstate, Flowstate Pro, a vendor, a configuration, or a customer is compliant unless the exact claim and profile have received every required named human approval.

When sources disagree, stop the affected work, record the conflict in `docs/compliance/flowstate-pro/decision-register-and-open-items.md`, and obtain resolution. Never choose the easiest or least restrictive source. Apply this precedence:

1. Approved entries in the decision register for product decisions.
2. Qualified-counsel-approved legal-matrix entries and approved policy catalogs for legal values.
3. Current code and `packages/db/prisma/schema.prisma` for claims about implemented Flowstate Standard behavior.
4. The Flowstate Pro PRD for required Pro behavior.
5. The approved Pro system and security/privacy designs.
6. The Pro roadmap and detailed implementation plan for sequencing.
7. Competitor materials as benchmark evidence only.
8. This directive for agent execution protocol only.

This directive cannot create or override a product decision, legal determination, policy value, vendor selection, agreement status, human approval, or production authorization.

## 2. Product boundary: Standard is not Pro

Flowstate Standard remains the existing MMA/fitness product. Flowstate Pro is a separate regulated clinical-record product.

- Do not modify Standard code, schema, roadmap, data, deployment, or customer behavior under a Pro work packet.
- Do not create a Standard-to-Pro upgrade or migration path.
- Pro must have separate applications, Prisma schema/database, identity, credentials, MFA/recovery, sessions, origins, infrastructure, projects, storage, backups, keys, secrets, logs, monitoring, vendors, billing configuration, access groups, CI/CD promotion, and production access.
- The same email may exist in both products only as unrelated identities.
- Share only reviewed data-free UI/configuration primitives and pure utilities. If a proposed shared component could receive regulated data, credentials, tenant context, policy state, or audit content, keep it Pro-only.
- Do not represent planned Pro models or controls as already implemented.

## 3. Agent authority and prohibitions

The agent may perform only work expressly authorized by the current packet and gate.

The agent must not:

- invent legal applicability, customer/entity classification, consent or authorization language, legal authority, retention periods, rights deadlines, breach/reportability rules, representative authority, agreement status, residency/transfer approval, public claims, or risk acceptance;
- select or enable vendors, identity providers, hosting, regions, KMS, audit stores, monitoring, email, clinical integrations, or production configurations;
- sign, accept, represent, or infer BAAs, DPAs, PIAs, contracts, attestations, or vendor assurances;
- use production or customer data, contact customers/vendors/regulators, obtain or use live credentials/secrets, create live vendor resources, deploy, push, merge, release, or activate a production feature;
- make a legal or incident-reportability decision, approve its own work, or substitute tests for counsel, operational, assessor, or executive review;
- weaken a safeguard, add an unapproved bypass, silently broaden scope, or silently default an unknown to a permissive value.

Use synthetic data only in development, tests, screenshots, traces, fixtures, demos, and provider sandboxes. Confidential contracts, legal advice, personnel files, incident evidence, and production secrets stay outside the repository; repository artifacts may contain only approved templates, metadata, redacted evidence, and external evidence references.

## 4. Phase 0 authority and Gate 0

Before Gate 0, the agent may perform repository discovery, documentation, and read-only/non-production verification tooling in an isolated worktree. This includes the detailed plan's Phase 0 inventory, access-map, flow, applicability-input, risk, and evidence-baseline work. Tooling must be deterministic, synthetic-data-only, non-deploying, and unable to mutate production or external systems.

Phase 0 may classify technical facts and expose unresolved questions. It may not decide which law applies, approve a field classification with legal effect, choose a vendor, set a policy value, or declare a control compliant.

No Phase 1+ schema, application, infrastructure, vendor, or control implementation may begin until Gate 0 has all required artifacts and named approvals. At minimum, Product/Owner, qualified Virginia and/or BC counsel as applicable, Security/Privacy, Operations, Database, Backend, and QA must approve the narrowed packet scope; executive, assessor, vendor/procurement, and other reviewers remain required where the decision register or plan assigns them.

## 5. Phased execution

Follow the detailed plan milestone by milestone; do not collapse phases or execute speculative later work:

0. discovery, applicability inputs, data classification, flows, risk, vendors, and Gate 0;
1. trusted access context, deny-by-default authorization, audit, logging, and Pro data-access boundaries;
2. identity, MFA, session, recovery, invitation, and token controls;
3. jurisdiction-policy, consent/evidence, destination/agreement, transfer, and URL controls using approved inputs;
4. managed encryption, storage, files, backups, restore, and staged data migration;
5. retention, legal hold, disposition, deletion, and offboarding;
6. individual rights and disclosure accounting;
7. frontend storage, telemetry, rendering, download, timeout, accessibility, and consent/rights UX controls;
8. security signals, human-led incident response, runbooks, exercises, and recurring controls;
9. synthetic staging, migration rehearsal, assurance, independent review, and separately authorized controlled rollout.

A phase exit means its stated technical evidence and human gates are complete for a named profile. It does not authorize the next phase, production, or a compliance claim unless those approvals are separately recorded.

## 6. Mandatory gates

Stop dependent work until the named evidence exists:

- **Legal/policy:** qualified counsel or the assigned human owner approves applicability, legal catalogs, text, retention, rights, breach, transfer, representative-authority, and claim wording.
- **Customer activation:** organization, customer type, use case, jurisdiction, data flows, operating envelope, contracts, and responsibility matrix are verified. Unresolved tenants cannot activate; there is no self-service regulated activation.
- **Contracts/vendors:** every data-touching destination has an approved vendor record, exact covered configuration, region, purpose, data classes, support access, retention/deletion behavior, transfer approval, and signed BAA/DPA or other required agreement evidenced by metadata/reference. Missing or unknown status blocks enablement.
- **Human operations:** accountable Security/Privacy, Security Official, incident, executive risk/signatory, independent approval, training, access, sanctions, on-call, vendor review, risk-analysis, assessment, insurance, and evidence-storage duties are staffed and exercised as required.
- **Production/claims:** technical verification alone is insufficient. The exact profile, vendors, configuration, contracts, operating evidence, legal review, remediation, assessor/security/privacy review, and executive approval must be complete before activation or public claims.

## 7. Work-packet protocol

Use one isolated branch/worktree per packet. A packet must define before editing:

- goal and human outcome;
- allowed and forbidden paths;
- controlling decisions and exact source documents;
- dependencies, unresolved blockers, and entry/exit gates;
- affected Pro data classes, models, fields, actors, permissions, profiles, jurisdictions, destinations, and vendors;
- additive migration/backfill/reconciliation/rollback or forward-fix plan, including audit behavior;
- synthetic fixtures and focused negative/positive tests;
- required command, UI/accessibility, infrastructure read-back, restore/exercise, and regression evidence;
- required human reviewers and release-blocker status;
- explicit prohibition on production data, live credentials, customer/vendor contact, deploy, push, merge, release, and activation.

For behavior changes, prove the failure first, implement the smallest approved change, run focused checks, then affected package/workspace gates and required root gates. Database work requires fresh-deploy and upgrade-path evidence against disposable PostgreSQL. UI work requires synthetic desktop, tablet, 390px, keyboard, screen-reader/WCAG 2.2 AA, network/storage/console, and artifact checks. Never rewrite applied migrations or perform a destructive migration without approved backup, restore, reconciliation, and rollback/forward-fix evidence.

## 8. Verification, evidence, and status

Use only the package status vocabulary:

`DRAFT`, `PROPOSED`, `COUNSEL_REVIEW_REQUIRED`, `OWNER_APPROVAL_REQUIRED`, `APPROVED`, `SPECIFIED`, `IMPLEMENTED`, `TECHNICALLY_VERIFIED`, `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, `APPROVED_FOR_PROFILE`, `BLOCKED`, `NOT_APPLICABLE`, `SUPERSEDED`.

Record statuses separately; do not skip or combine them. In particular:

- code present = `IMPLEMENTED`, not `TECHNICALLY_VERIFIED`;
- passing tests/read-back = `TECHNICALLY_VERIFIED`, not operating evidence;
- a completed exercise = `OPERATIONALLY_EXERCISED`, not legal review;
- evidence collection = `EVIDENCE_COMPLETE`, not profile approval;
- counsel review = `LEGALLY_REVIEWED`, not production approval;
- activation requires `APPROVED_FOR_PROFILE` for the exact customer class, jurisdiction, vendors, configuration, modules, and operating envelope.

Retain reproducible command/output references, candidate commit/tree state, synthetic fixture identifiers, reviewer/owner, date, affected profile, and limitations. Redact secrets and regulated content. Historical evidence is context only; rerun required evidence on the exact candidate. A skipped, unavailable, stale, or non-reproducible check is not a pass.

## 9. Required artifact updates

Every packet must update these exact artifacts before handoff, creating a planned artifact only when its approved phase first requires it:

1. `docs/compliance/flowstate-pro/decision-register-and-open-items.md` — new decisions, conflicts, supersessions, blockers, owners, required approvals, and resolution references. Never mark a human decision approved yourself.
2. `docs/compliance/flowstate-pro/control-and-evidence-matrix.md` — each affected requirement/control, implementation path, test/exercise, owner, evidence reference, profile, status, gap, and next gate.
3. `docs/compliance/flowstate-pro/data-classification-and-flows.md` — every affected field/store/log/cache/artifact/destination, classification state, purpose, access, region/transfer, encryption, retention/lifecycle, and evidence source.
4. `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` — packet status, actual paths, dependencies, verification results, deviations, and next authorized packet; do not rewrite approved scope silently.

Update the following exact source document whenever the packet changes its subject:

- `docs/compliance/flowstate-pro/legal-applicability-matrix.md` for counsel-owned applicability or legal-policy inputs;
- `docs/compliance/flowstate-pro/product-spec.md` or `product-requirements-document.md` for approved product scope/behavior;
- `docs/compliance/flowstate-pro/system-design.md` for architecture, data, API, job, integration, deployment, or failure behavior;
- `docs/compliance/flowstate-pro/security-privacy-architecture.md` for trust boundaries, authorization, audit, encryption, threats, or fail-closed behavior;
- `docs/compliance/flowstate-pro/operations-and-governance.md` for roles, policies, training, access, incident, vendor, review, evidence, or launch operations;
- `docs/compliance/flowstate-pro/roadmap.md` for sequencing, gate, activation-lane, or deferred-scope changes;
- `docs/compliance/flowstate-pro/competitor-parity-matrix.md` only when dated benchmark evidence or parity treatment changes;
- `docs/compliance/flowstate-pro/README.md` only when package structure, precedence, status vocabulary, boundary, or entry points change.

Do not duplicate detailed specifications in this directive. Link to the controlling package document and plan section.

## 10. Fail-closed and rollback rules

- Unknown, conflicting, expired, unapproved, or missing applicability, authority, purpose, consent/authorization, role, tenant, MFA, policy, retention, hold, destination, agreement, transfer, key, audit, vendor, or configuration state denies the regulated operation and creates a reviewable blocker/audit outcome.
- High-risk data categories and deferred modules remain disabled until their purpose, authority, controls, access, retention, vendors, and profile are approved.
- Audit contains no PHI payload. Required audit outage blocks sensitive operations except a separately approved, time-limited, named, audited emergency mode.
- Finalized clinical records are immutable; corrections use linked amendments/late entries. Unknown retention blocks destruction. Legal hold blocks disposition. Offboarding and nonpayment never trigger blind deletion or improper loss of required/emergency access.
- Outbound destinations start disabled. No unknown region, cross-border path, agreement, or transfer review is treated as allowed.
- Malware/quarantine, tenant isolation, authorization, key, integrity, migration, reconciliation, backup, or restore failure stops the affected operation or rollout.
- Rollback must not restore broad access, bypass audit/policy, delete audit history, reintroduce plaintext, activate a destination, or weaken the safest approved state. Use additive migrations and forward-fix where rollback would violate these rules.

## 11. Handoff

End every packet with:

- exact files changed and concise behavior/result summary;
- exact commands/checks run and their real outcomes;
- evidence and artifact references with statuses;
- unresolved legal/vendor/contract/operational blockers and named owner;
- migration/rollback/forward-fix state and production impact (`none` unless separately authorized);
- required reviewers and approvals still outstanding;
- the next smallest authorized packet, or `BLOCKED` if no packet is authorized.

The immediate handoff is Phase 0 only, beginning with the detailed plan's Tasks 0.1–0.3 in an isolated documentation/tooling worktree. Do not begin Pro implementation, vendor provisioning, or production preparation until Phase 0 review and Gate 0 authorization narrow the next packet.
