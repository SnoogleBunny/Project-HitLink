# WP0.3 — Author legal, data, control, and operations specifications

## Status

`COMPLETED 2026-09-23 — SPECIFICATION PASS; TECHNICAL QUALITY APPROVED; HUMAN ACCEPTANCE RECORDED; WP0.4 AUTHORIZED BUT NOT STARTED; COUNSEL VALUES UNRESOLVED; G0 BLOCKED; WP1.x UNAUTHORIZED`

## Goal

Reconcile the existing Flowstate Pro legal-applicability, data-classification/flow, control/evidence, operations/governance, and competitor-parity documents into one internally consistent, executable specification set without inventing legal conclusions, customer facts, vendor approvals, accountable humans, commercial terms, production configuration, operating evidence, or Gate G0 approval.

## Human outcome

A reviewer can trace each legal/policy decision input and each applicable control across the five WP0.3 specifications, identify the accountable human function and blocked dependency, see the implementation target, repeatable test, human exercise, protected evidence reference, review cadence, and release gate, and confirm that every unresolved value fails closed rather than becoming a product or code default.

## Why this packet exists

WP0.1 froze the implemented Flowstate Standard boundary. WP0.2 specified the separate Flowstate Pro product and architecture contract and was technically verified; on 2026-09-22 the project owner explicitly accepted all five required WP0.2 review roles and authorized WP0.3. WP0.3 now reconciles the legal-input, data, control, operations, and parity layer required for the remaining Milestone 0 dossier.

This packet is documentation reconciliation only. It does not perform legal review, choose a first customer profile, approve a vendor, staff an accountable role, create protected operating evidence, implement a control, authorize production, approve G0, or authorize WP1.x.

## Authority and precedence

Apply this order when sources disagree:

1. Approved entries in `docs/compliance/flowstate-pro/decision-register-and-open-items.md` for product and architecture decisions.
2. Qualified-counsel-approved legal-matrix entries and approved policy catalogs for legal values. No such approval may be inferred from a draft, statutory summary, product decision, technical specification, or this packet.
3. Current code and `packages/db/prisma/schema.prisma` for claims about implemented Flowstate Standard behavior.
4. `docs/compliance/flowstate-pro/product-requirements-document.md` for specified Flowstate Pro behavior.
5. `docs/compliance/flowstate-pro/system-design.md` and `docs/compliance/flowstate-pro/security-privacy-architecture.md` for specified architecture and security/privacy contracts.
6. `docs/compliance/flowstate-pro/roadmap.md` and `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` for sequence and gates.
7. `docs/compliance/flowstate-pro/competitor-parity-matrix.md` for dated benchmark evidence only.
8. `docs/HIPAA_Canada_Compliance_Agent_Directive.md` for agent execution protocol; it cannot create product, legal, vendor, operational, commercial, or production authority.

If controlling sources conflict, stop the affected reconciliation, record the conflict and owner in the decision register, keep the affected control/profile/module/destination `BLOCKED`, and do not choose the easiest or least restrictive interpretation.

## Required context

Read the complete current contents before editing:

- `README.md`
- `CLAUDE.md`
- `docs/HIPAA_Canada_Compliance_Agent_Directive.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- every Markdown document under `docs/compliance/flowstate-pro/`
- `docs/Agents/README.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/Agent Permission Matrix.md`
- `docs/Agents/Work Packet Template.md`
- other `docs/Agents/` role guidance needed to route Product/CEO, Security/Privacy, Operations, QA/Assurance, Database/Backend, vendor/procurement, and counsel review

Use the repository documents already present as the research boundary. Do not refresh statutes, regulations, competitor claims, vendor claims, pricing, or product availability from the web in this packet. If an existing source is stale, contradictory, missing, or insufficient, record a blocker and owner instead of silently updating the conclusion.

## Starting state

- Repository/worktree: `/Users/alvinlo/Desktop/Project-HitLink-wp0-3`
- Branch: `hermes/pro-wp0-3-controls`
- Base commit: `d4f2098b4940cae61b9f36345cb480bda33d990d`
- WP0.1 artifacts and evidence are inherited unchanged.
- WP0.2 specification artifacts are inherited unchanged and were accepted by explicit project-owner authorization on 2026-09-22 for Product/CEO, Architecture/Backend, Database, Security/Privacy, and Operations/QA-Assurance review roles.
- The current legal, control, operations, and competitor documents remain draft/incomplete for WP0.3. The data document is a specified planning target but lacks the complete WP0.3 reconciliation.
- All customer/profile legal conclusions and legal-policy values remain `COUNSEL_REVIEW_REQUIRED`.
- Exact first customer profiles, vendors/configurations/agreements, commercial and production inputs, protected evidence systems, and named accountable humans remain `BLOCKED`.
- Gate G0 remains `BLOCKED`. No application, schema, migration, test, runtime, infrastructure, vendor, credential, PHI-capable, production, or WP1.x work is authorized.

## Exact mutable-candidate identity

**Manifest ID:** `WP0.3-MUTABLE-MANIFEST-V1`

**Base commit:** `d4f2098b4940cae61b9f36345cb480bda33d990d`

The exact mutable candidate is the base commit plus the eight SHA-256 values below. Seven paths use their ordinary file bytes. To avoid a self-hash cycle, the packet hash uses one canonical normalization only: replace the 64 lowercase hexadecimal characters in this packet's own manifest row with 64 zeroes, preserving every other byte, then SHA-256 hash the normalized UTF-8 bytes. The validator applies the same single-row normalization. Any later edit to any mutable path requires regenerating this table; a stale value fails validation.

<!-- WP0.3-MUTABLE-MANIFEST-START -->
| Path | SHA-256 |
|---|---|
| `docs/compliance/flowstate-pro/legal-applicability-matrix.md` | `ba9915dd4db1a8527d108bd06600dbeba9bb9437c30790b4c88c67139d873747` |
| `docs/compliance/flowstate-pro/data-classification-and-flows.md` | `35aea0e7da9c67abe39bb96374cd77ec6cad395824673e43f39179550538ea37` |
| `docs/compliance/flowstate-pro/control-and-evidence-matrix.md` | `397aade176447b3783e36169d9fd0944b8cdc9f52dcc3e0f49b43e792b2724ae` |
| `docs/compliance/flowstate-pro/operations-and-governance.md` | `591774b3889fb09c0139ee3ce65c8886b49645b26ef6cd65896a2662a18cb453` |
| `docs/compliance/flowstate-pro/competitor-parity-matrix.md` | `fb5816d180d8595f1012ddea30b4aa5d5d8c5848d135d624b30391a29c5649e2` |
| `docs/compliance/flowstate-pro/decision-register-and-open-items.md` | `c4092750e8ebbe8d29add4e1c29204c1c9ec73a3fab52dfaeaad71244e45548c` |
| `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` | `1f55a03633e97f6c99869d903d4a7a83a5aac7e3281bf0b9af76015308867715` |
| `docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md` | `5a43f32e05f8fd3eb4ec4f980c6d6cff2eef825a1964ad1b5fa9dbaabdf59357` |
<!-- WP0.3-MUTABLE-MANIFEST-END -->

**Independent specification review outcome:** `PASS`

**Independent specification review date:** `2026-09-23`

**Independent specification review candidate:** `WP0.3-MUTABLE-MANIFEST-V1`

**Independent quality review outcome:** `APPROVED`

**Independent quality review date:** `2026-09-23`

**Independent quality review candidate:** `WP0.3-MUTABLE-MANIFEST-V1`

## Product, data, profile, and actor boundary

- Product: Flowstate Pro only. Flowstate Standard remains a separate gym-management product and must not be modified or represented as a Pro foundation.
- Profiles: Virginia individually approved profiles first; British Columbia private-clinic profiles second through a separate gate. No Virginia approval transfers to BC.
- Data: specifications and repository metadata only. Do not copy PHI, PII, secrets, contracts, legal advice, personnel files, incident evidence, assessor workpapers, customer exports, or vendor-console content into Git.
- Actors: documentation implementer and reviewers only. This packet may name accountable functions and required human roles, but may not invent the natural person filling a role.
- Vendors/destinations: inventory and blocked decision contracts only. No vendor selection, approval, provisioning, configuration, agreement conclusion, or live contact.
- Regions: preserve only the already approved planning topology. Do not convert a region target into deployed evidence, residency approval, or a public claim.

## Allowed edits

Edit only these eight paths:

1. `docs/compliance/flowstate-pro/legal-applicability-matrix.md`
   - Required because WP0.3 owns the factual legal branch inventory, counsel-owned decision inputs, responsibility allocations, and legal blocker contract.
2. `docs/compliance/flowstate-pro/data-classification-and-flows.md`
   - Required because WP0.3 must reconcile purpose/authority, customer profile, record origin, rights, retention, hold, disclosure, transfer, incident, vendor, responsibility, store, and flow inputs.
3. `docs/compliance/flowstate-pro/control-and-evidence-matrix.md`
   - Required because WP0.3 acceptance requires every applicable control to have an owner, implementation target, test, exercise, evidence reference, review cadence, and release gate.
4. `docs/compliance/flowstate-pro/operations-and-governance.md`
   - Required because WP0.3 must define accountable functions, staffing blockers, access review, screening, training, sanctions, incident command, vendor review, risk analysis, penetration testing, insurance review, and protected evidence handling.
5. `docs/compliance/flowstate-pro/competitor-parity-matrix.md`
   - Required only to reconcile dated benchmark treatment with the approved v1/later/out-of-scope decisions, blocked controls, evidence limits, and no-procurement/no-compliance-claim boundary. Do not refresh the benchmark source set.
6. `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
   - Required only for WP0.3 reconciliation status, conflicts, blockers, owners, dependencies, review requirements, and handoff state.
7. `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
   - Required only to convert WP0.3 into an evidence-backed checklist/status record and identify the next packet after review.
8. `docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md`
   - Required to record final status, validator output, blockers, reviews, and implementation handoff.

Every allowed path must have a necessary WP0.3 change. Do not edit a path merely because it is allowed.

## Forbidden edits and actions

- Any file not listed under **Allowed edits**.
- `README.md`, `CLAUDE.md`, dossier `README.md`, all WP0.1 evidence, and all inherited WP0.1/WP0.2 artifacts outside the eight-path WP0.3 edit set.
- `product-spec.md`, `product-requirements-document.md`, `roadmap.md`, `system-design.md`, and `security-privacy-architecture.md`; treat them as immutable WP0.2 contracts in this packet.
- Any application, package, source, schema, migration, seed, fixture, test, script, runtime configuration, infrastructure, CI/CD, lockfile, or dependency change.
- Any credential, `.env` file, secret, local/customer database, vendor console, cloud resource, live endpoint, production system, external system, or regulated payload.
- Any deploy, push, merge, commit, release, vendor/customer/regulator contact, procurement action, contract acceptance, production activation, public claim, or Gate G0 approval.
- Any Standard-to-Pro migration, Standard modification, shared identity/session/data/billing assumption, or Pro implementation scaffold.

## Mandatory legal/non-legal boundary

The implementer may:

- preserve and organize verified factual legal research already present;
- map which facts counsel and customer authorities must decide;
- define technical and operational behavior while a legal input is unresolved;
- name accountable functions, required approval metadata, evidence references, and fail-closed dependencies;
- identify contradictions, missing facts, and review questions.

The implementer must not:

- decide whether a law applies to a customer, record, service, flow, vendor, or incident;
- choose consent, authorization, acknowledgement, withdrawal, revocation, expiry, representative-authority, release, emergency-access, rights, retention, legal-hold, disclosure, notice, custody, offboarding, cross-border, claim, or similar legal values;
- infer agreement sufficiency or executed status;
- mark a counsel-owned decision `APPROVED`, `LEGALLY_REVIEWED`, `NOT_APPLICABLE`, or `APPROVED_FOR_PROFILE`;
- convert a verified statutory fact into a customer/profile conclusion;
- describe technical documentation, code, tests, configuration, a BAA/DPA, or a cloud service as proof of compliance, legal sufficiency, vendor approval, operational readiness, production readiness, or G0 approval.

All counsel-owned applicability, consent, rights, retention, breach, disclosure, representative-authority, legal-hold, release, revocation, expiry, emergency-access, custody, offboarding, cross-border, and similar values remain exactly `COUNSEL_REVIEW_REQUIRED` unless an existing approved source in the repository already records the required named approval. No such new approval is authorized by this packet.

## Required deliverables

### 1. Legal applicability and counsel-input specification

Reconcile `legal-applicability-matrix.md` so it:

- distinguishes verified factual legal branches, customer/profile facts, counsel determinations, technical/operational planning effects, and blockers;
- preserves `LEG-01` through `LEG-11` as the counsel-owned decision registry, each with required facts, accountable/consulted human functions, fail-closed behavior, evidence/reference metadata, review trigger, and status;
- keeps every `LEG-01` through `LEG-11` status exactly `COUNSEL_REVIEW_REQUIRED`;
- maps purpose/authority, customer profile, record origin, rights, retention, legal hold, disclosure, transfer, incident, vendor/agreement, and responsibility decisions to the canonical control/reconciliation map;
- states that statutory summaries do not authorize a profile value or production behavior;
- records all unresolved first-customer, role, customer/entity, vendor/agreement, transfer, legal-text, policy, and claims inputs as blockers with owners/dependencies;
- retains official-source references already present without adding refreshed legal conclusions;
- contains no privileged advice, contract body, personal data, or legal conclusion.

Do not hard-code a generally applicable retention period, rights deadline, breach threshold, consent text, disclosure rule, representative rule, legal-hold rule, emergency-access rule, custody result, offboarding result, or cross-border permission. Existing factual examples must remain explicitly branch-limited and counsel-owned for profile use.

### 2. Data classification, decision inputs, and flows

Reconcile `data-classification-and-flows.md` so it:

- preserves the `D0`–`D9` and `DX` vocabulary unless an approved source requires an editorial correction;
- distinguishes Standard evidence from planned Pro behavior and never represents planned stores/flows as implemented;
- defines the minimum field/store/flow inventory contract for purpose/authority, customer/applicability profile, record origin/provenance, rights, retention, hold, disclosure, transfer, incident, destination/vendor, and customer/Flowstate responsibility;
- maps each decision family to the relevant `LEG-*`, control IDs, `FR-*`/`NFR-*`, operations register, and fail-closed behavior without duplicating legal values;
- preserves the destination-registry contract and requires unknown vendor, service, configuration, region, agreement, support path, transfer approval, retention/deletion behavior, owner, or evidence reference to remain `BLOCKED`;
- identifies protected evidence by metadata/reference only and keeps evidence bodies outside Git;
- keeps high-risk data/classes/modules absent or disabled until approved purpose, authority, exact fields, access, encryption, destination, lifecycle, and profile exist;
- keeps Standard and Pro data, stores, identities, sessions, vendors, billing, backups, keys, and migrations separate;
- avoids introducing a new taxonomy or speculative framework when the existing structures can hold the required fields.

### 3. Canonical requirement/control reconciliation map

Add one canonical cross-document reconciliation table to `control-and-evidence-matrix.md`. Use these exact mapping row IDs and exact minimum references:

| Mapping ID | Decision family | Required legal references | Required control references | Required requirement references |
|---|---|---|---|---|
| `MAP-PURPOSE-AUTHORITY` | Purpose and authority | `LEG-02`, `LEG-03`, `LEG-05` | `LEG-01`, `CON-01`, `DAT-01` | `FR-019`, `FR-032`, `NFR-002` |
| `MAP-CUSTOMER-PROFILE` | Customer/applicability profile | `LEG-01`, `LEG-02`, `LEG-03` | `GOV-01`, `DAT-01` | `FR-004`, `FR-005`, `FR-044` |
| `MAP-RECORD-ORIGIN` | Record origin and provenance | `LEG-03`, `LEG-05` | `DAT-01`, `CLN-01` | `FR-015`, `FR-032`, `NFR-003` |
| `MAP-RIGHTS` | Rights and verification | `LEG-06` | `RGT-01` | `FR-022`, `FR-034` |
| `MAP-RETENTION` | Retention and disposition | `LEG-07` | `RET-01` | `FR-033`, `NFR-014` |
| `MAP-LEGAL-HOLD` | Legal hold | `LEG-07` | `RET-01`, `OFF-01` | `FR-033`, `FR-035` |
| `MAP-DISCLOSURE` | Release, disclosure, and accounting | `LEG-04`, `LEG-05`, `LEG-06` | `RGT-01`, `OUT-01` | `FR-029`, `FR-034`, `FR-040` |
| `MAP-TRANSFER` | Residency and transfer | `LEG-04`, `LEG-10` | `OUT-01`, `VEN-01` | `FR-040`, `FR-044`, `NFR-006` |
| `MAP-INCIDENT` | Incident and notice decision | `LEG-08` | `INC-01`, `INC-02` | `FR-039`, `NFR-019` |
| `MAP-VENDOR` | Vendor, agreement, and destination | `LEG-04` | `VEN-01`, `OUT-01` | `FR-040`, `NFR-015`, `NFR-016` |
| `MAP-RESPONSIBILITY` | Customer/Flowstate responsibility and accountable humans | `LEG-02`, `LEG-04`, `LEG-06` | `GOV-01`, `GOV-02`, `GOV-03` | `FR-004`, `FR-031`, `FR-034`, `NFR-019` |

The map is traceability, not a legal decision. Each row must also name the owning dossier document, fail-closed result, unresolved owner/dependency, and release gate. If an approved source demonstrates that a required reference is wrong, record the conflict instead of silently changing this packet's mapping.

### 4. Control and evidence matrix

Reconcile every existing control row in `control-and-evidence-matrix.md`. Keep the existing control IDs stable. The main control table must use these exact columns:

1. `ID`
2. `Requirement / source`
3. `Applicability / profile`
4. `Accountable owner`
5. `Implementation target`
6. `Test`
7. `Exercise`
8. `Evidence reference`
9. `Review cadence / trigger`
10. `Release gate`
11. `Status / gap`

For every control:

- **Applicability/profile:** name the applicable lane/profile or explicitly state that applicability is counsel/profile dependent. Do not infer `NOT_APPLICABLE`.
- **Accountable owner:** name a function and required approving/reviewing role, not a fictional person.
- **Implementation target:** name the smallest future document/module/configuration/operational mechanism responsible for the control. Do not claim it exists.
- **Test:** define a repeatable technical or documentary check with positive/negative/failure behavior as applicable.
- **Exercise:** define the human/operational rehearsal or state `Not separately applicable — technical/document review only` with a reason. Silence is not acceptable.
- **Evidence reference:** name the future protected artifact type/location contract or the existing redacted repository reference. `None recorded` may be retained only with the required future evidence reference and blocker.
- **Review cadence/trigger:** state a cadence and/or material-change trigger owned by a human function. Do not invent legal deadlines or commercial promises.
- **Release gate:** map to G0–G4 and/or P1–P7 as already defined; do not create a new release gate.
- **Status/gap:** use the approved vocabulary and state the unresolved dependency. Specification cannot self-award implementation, technical verification, exercise, evidence completeness, legal review, or profile approval.

The exact existing control ID set that must remain present is:

`GOV-01`, `GOV-02`, `GOV-03`, `GOV-04`, `LEG-01`, `DAT-01`, `DAT-02`, `ARC-01`, `TEN-01`, `IAM-01`, `IAM-02`, `IAM-03`, `AUD-01`, `AUD-02`, `LOG-01`, `ENC-01`, `FIL-01`, `CLN-01`, `CON-01`, `RGT-01`, `RET-01`, `OFF-01`, `OUT-01`, `VEN-01`, `BCP-01`, `INC-01`, `INC-02`, `HR-01`, `DEV-01`, `DEV-02`, `QUA-01`, `ASS-01`, `CLM-01`, `EVD-01`, `REV-01`.

### 5. Operations and governance specification

Reconcile `operations-and-governance.md` so it defines, without claiming staffing or exercise completion:

- accountable functions, named-natural-person requirement, delegates, authority limits, segregation of duties, succession/coverage, and independent second approval;
- joiner/mover/leaver screening, confidentiality/acceptable-use acknowledgement, pre-access and recurring training, sanctions, device/MFA requirements, access grant/revocation, and quarterly access review;
- tenant clinician break-glass versus Flowstate support/JIT separation;
- incident command, discovery/containment/assessment/notice clocks, Legal/Privacy decision ownership, evidence preservation, communications approval, closure, and lessons learned;
- vendor due diligence, destination approval, agreement/region/support/subprocessor/retention/deletion review, expiry/change monitoring, and disablement;
- initial and recurring risk analysis/risk management, material-change review, finding ownership, due dates, residual-risk acceptance, and release effect;
- qualified independent penetration/security assessment scope, remediation, retest, exceptions, and protected report handling;
- insurance review as an owner/expert decision with no invented limits, exclusions, carrier, or coverage claim;
- backup/restore, same-country DR, key recovery, audit outage, scanner outage, vendor outage, rights/offboarding continuity, and profile suspension exercises;
- protected evidence catalog, access, hash/integrity, retention/expiry, reviewer, candidate/profile/configuration binding, and repository-reference-only rules;
- review calendar/cadence and material-change triggers aligned to the control matrix;
- exact launch-blocker behavior when a person, policy, training record, review, exercise, vendor decision, assessment, insurance review, or evidence system is missing.

Unknown natural-person assignments remain `BLOCKED`; do not invent names, contacts, on-call coverage, counsel, assessor, vendor owner, executive signatory, or customer record authority.

### 6. Competitor parity reconciliation

Reconcile `competitor-parity-matrix.md` with the smallest necessary diff:

- retain the existing 2026-08-24 source review date and 2026-08-26 initial benchmark history unless an approved repository source says otherwise;
- do not browse, refresh, or add competitor/vendor claims;
- preserve first-party-public-evidence limitations and the distinction between `VERIFIED`, `MARKETING_CLAIM`, `MODULE_OR_ADD_ON`, `REGION_DEPENDENT`, `MANUAL_OR_PARTIAL`, `UNCLEAR`, and `OUT_OF_SCOPE`;
- align every Flowstate treatment with the WP0.2 product/PRD/roadmap contract and the canonical control map;
- make explicit that parity evidence cannot approve a vendor, legal value, profile, security control, production capability, compliance claim, procurement decision, or release gate;
- keep deferred integrations/modules blocked until their own legal, vendor, data-flow, control, operational, evidence, and profile gates complete;
- preserve Jane/Epic as dated journey benchmarks, not a requirement to reproduce either catalog.

### 7. Decision register and implementation plan

Update `decision-register-and-open-items.md` only to record:

- the WP0.3 reconciliation result and exact document roles;
- discovered contradictions and their owner/status;
- the canonical mapping IDs and stable control-ID treatment;
- the five mandatory blocker records below, each with status, owner, dependency/evidence needed, affected profiles/controls, and next review;
- required independent and human reviews;
- G0 remains `BLOCKED` and WP1.x remains unauthorized.

The decision register must contain these exact blocker IDs:

| Blocker ID | Category | Required status | Minimum owner function |
|---|---|---|---|
| `WP03-B01` | First customer/profile and customer/entity facts | `BLOCKED` | Product owner + Privacy lead + qualified counsel |
| `WP03-B02` | Counsel-owned legal/policy values | `BLOCKED` | Qualified Virginia/BC counsel + Privacy lead + customer record authority as applicable |
| `WP03-B03` | Vendors, exact configurations, agreements, regions, support paths, and transfers | `BLOCKED` | Vendor owner/Procurement + Privacy/Security |
| `WP03-B04` | Commercial, claims, insurance, operating-envelope, and production inputs | `BLOCKED` | Executive risk owner + Product/Commercial + Legal/Security/Operations as applicable |
| `WP03-B05` | Named accountable humans, protected evidence system, exercises, assessor, and operating coverage | `BLOCKED` | Executive risk owner + Security/Privacy + Operations + QA/Assurance |

Update the implementation plan's WP0.3 section into an evidence-backed checklist. Record exact files changed, validation output, blockers, deviations, required reviewers, G0 state, and the next packet only after review. Do not mark WP0.3 complete merely because the implementer finished editing.

## Requirement/control reconciliation rules

1. Keep requirement IDs, control IDs, `LEG-*` IDs, mapping IDs, blocker IDs, gate IDs, and status vocabulary exact.
2. The PRD remains authoritative for `FR-*`/`NFR-*`; do not duplicate or amend requirement text in WP0.3 documents.
3. The legal matrix owns factual legal branches and counsel decision inputs; no other WP0.3 document may invent or approve a legal value.
4. The data document owns classification, store, destination, and flow inventory contracts.
5. The control matrix owns canonical decision-to-control-to-test/exercise/evidence/gate traceability.
6. The operations document owns human procedures, roles, cadence, exercise, and protected evidence handling.
7. The competitor matrix owns dated benchmark evidence only.
8. The decision register owns blocker/decision status and approval metadata, not privileged advice or evidence bodies.
9. A document may summarize another document's rule only with an exact relative reference and without strengthening, weakening, or changing ownership.
10. When a control applies only after counsel/profile resolution, state the applicability dependency and fail-closed behavior; do not mark it `NOT_APPLICABLE`.
11. `None recorded`, `TBD`, `UNKNOWN`, or similar wording must include the accountable owner, dependency/evidence required, affected gate, and fail-closed outcome.
12. Do not convert `SPECIFIED` into `IMPLEMENTED`, `TECHNICALLY_VERIFIED`, `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, or `APPROVED_FOR_PROFILE`.

## Explicit fail-closed handling of unknowns

- Unknown or conflicting customer/entity classification, Flowstate role, applicable regime, purpose, authority, consent/authorization, representative authority, rights rule, release state, retention, legal hold, custody, offboarding, incident/reportability, disclosure, destination, vendor, agreement, region, transfer, support path, evidence, human owner, operating envelope, claim, or production state blocks the dependent action/profile/module/destination/release gate.
- Unknown legal values remain `COUNSEL_REVIEW_REQUIRED`; do not select a conservative-looking number or phrase as a placeholder.
- Unknown vendor/customer-profile/commercial/production/accountable-human inputs remain `BLOCKED` with owner and dependency.
- Unknown retention or hold state blocks destruction. Unknown release/authority blocks disclosure. Unknown destination/agreement/transfer blocks transmission. Unknown audit/evidence state blocks sensitive operation or release advancement as specified by the existing architecture.
- Missing exercises or operating evidence cannot be replaced by a test. Missing legal review cannot be replaced by technical documentation. Missing protected evidence cannot be replaced by repository prose.
- A blocker being resolved does not activate a runtime profile automatically; the existing versioned approval transition remains required.

## Detailed working instructions

1. Confirm repository root, branch, HEAD, and complete `git status --short -uall`. Preserve all inherited changes.
2. Hash the inherited WP0.1/WP0.2 artifacts listed in the validator before editing and compare them to the embedded expected hashes.
3. Read all required context. Build a temporary reconciliation worksheet in memory or under the Hermes scratch directory, never as a new repository file.
4. Inventory:
   - `LEG-01` through `LEG-11` and every counsel-owned value;
   - `D0` through `D9` and `DX`, stores, destinations, and flows;
   - every existing control ID and its current owner/test/evidence/status;
   - every accountable function, policy/register, cadence, exercise, and blocker;
   - every competitor row and Flowstate treatment;
   - all cross-references to `FR-*`, `NFR-*`, Q decisions, gates, and statuses.
5. Compare the five target documents to the immutable WP0.2 product/PRD/roadmap/system/security contracts. Resolve only editorial, traceability, ownership, field-completeness, and cross-document inconsistencies supported by approved sources.
6. Create the canonical mapping table in the control matrix before expanding control rows. Use it to drive targeted edits in the legal, data, operations, and competitor documents.
7. Reconcile the legal matrix without changing any counsel-owned value from `COUNSEL_REVIEW_REQUIRED`.
8. Reconcile the data document around existing structures. Do not add a parallel taxonomy, schema, or speculative data-governance framework.
9. Expand the control table to the exact required columns. Keep every existing control ID once, with non-empty content in all required fields.
10. Reconcile operations/governance so each human/recurring control has accountable function, evidence contract, cadence/trigger, exercise, blocker, and release effect.
11. Apply only the minimal competitor-matrix edits needed for parity/control consistency. Do not refresh source claims.
12. Update the decision register with `WP03-B01` through `WP03-B05`, mapping/status reconciliation, contradictions, required reviews, and no approval overclaim.
13. Update the implementation plan WP0.3 checklist only after the five target documents and decision register are consistent.
14. Run the embedded validator from the repository root. Fix the documents, not the validator, unless the validator contradicts this packet or an approved controlling source.
15. Run `git diff --check`, `git status --short -uall`, inspect the complete diff for all eight allowed paths, and confirm no forbidden path changed.
16. Update this packet's implementation record only with real command output. Do not mark human reviews accepted unless a named authorized human actually accepts them.
17. Do not commit, push, merge, deploy, provision, browse vendor consoles, or contact anyone.

## Acceptance requirements

- [x] Only the eight allowed paths changed; all inherited WP0.1/WP0.2 artifacts outside the WP0.3 edit set remain byte-identical.
- [x] All five target specifications are internally consistent with the immutable WP0.2 product, PRD, roadmap, system-design, and security/privacy contracts.
- [x] `LEG-01` through `LEG-11` are present exactly once and remain exactly `COUNSEL_REVIEW_REQUIRED`.
- [x] No applicability, consent, rights, retention, breach, disclosure, representative-authority, legal-hold, release, revocation, expiry, emergency-access, custody, offboarding, cross-border, claim, agreement, vendor, or similar blocked value was invented or approved.
- [x] The canonical reconciliation map contains all 11 exact `MAP-*` rows and required references.
- [x] Every existing control ID is present exactly once with non-empty applicability/profile, accountable owner, implementation target, test, exercise, evidence reference, review cadence/trigger, release gate, and status/gap.
- [x] Every applicable control maps to an existing G0–G4 and/or P1–P7 gate; no new release gate was invented.
- [x] Purpose/authority, customer profile, record origin, rights, retention, legal hold, disclosure, transfer, incident, vendor, and responsibility decisions trace across legal, data, control, operations, requirements, and gates.
- [x] Accountable functions, access reviews, screening, training, sanctions, incident command, vendor review, risk analysis, penetration testing, insurance review, and protected evidence handling are specified without claiming staffing or completion.
- [x] `WP03-B01` through `WP03-B05` exist exactly once, remain `BLOCKED`, and each has an owner, dependency/evidence requirement, affected scope, and next review/trigger.
- [x] Unknown legal/vendor/customer-profile/commercial/production/accountable-human values have explicit fail-closed behavior.
- [x] Competitor evidence remains dated benchmark context only; no source refresh, procurement conclusion, vendor approval, legal conclusion, parity promise, or compliance/production claim was added.
- [x] Standard and Pro remain separate; no Standard application, source, schema, migration, test, runtime, infrastructure, data, identity, session, billing, vendor, or production behavior changed.
- [x] Technical documentation is not represented as legal advice, proof of compliance, operational readiness, evidence completeness, vendor approval, production readiness, or G0 approval.
- [x] G0 remains `BLOCKED`; WP1.x remains unauthorized.
- [x] The embedded validator passes, including deterministic negative/mutation cases, relative-link checks, full-document metadata rendering, fenced-content secret/regulated-data scans, inherited hashes, untracked scope, and `git diff --check`.
- [x] Independent specification review returned `PASS` on 2026-09-23 for `WP0.3-MUTABLE-MANIFEST-V1`.
- [x] Independent technical quality/security/evidence review returned `APPROVED` on 2026-09-23 with no critical, important, or minor issues for `WP0.3-MUTABLE-MANIFEST-V1`.
- [x] Required human acceptance was explicitly recorded by the project owner on 2026-09-23 for Product, Architecture, Database, Security/Privacy, Operations/QA, and legal/counsel; WP0.3 is complete and WP0.4 is authorized but not started.

## Required reviewers and review expectations

### Independent specification reviewer — required result: `PASS`

A reviewer independent from the implementer must verify:

- all deliverables and acceptance requirements are satisfied;
- legal facts, counsel decisions, technical controls, operations, and benchmark evidence remain separate;
- counsel-owned values and blockers were preserved exactly;
- every control field is substantive, testable, and mapped to the correct existing gate;
- the canonical mapping has no missing or misleading cross-reference;
- no unsupported compliance, production, legal, vendor, evidence, or G0 claim exists;
- the validator covers the stated high-risk invariants and its mutation cases genuinely fail when expected.

Any miss returns `FAIL` with exact file/section and keeps WP0.3 open.

### Independent quality reviewer — required result: `APPROVED`

After specification `PASS`, a second independent reviewer must assess:

- minimum necessary diff and reuse of existing structures;
- readability, table integrity, status clarity, relative links, and no duplicated authority;
- deterministic validator quality, false-positive/false-negative risk, and safe error output;
- no hidden scope expansion, speculative framework, or stale contradictory wording;
- handoff completeness and honest blocker/review state.

Any material issue returns `REQUEST_CHANGES`; `APPROVED` is required before human acceptance.

### Required human review acceptance

The project owner explicitly accepted the exact pre-recording `WP0.3-MUTABLE-MANIFEST-V1` candidate with packet canonical self-hash `9bf74694d580ff123fca2033ecaa0bf1d25fa26c0839a7399766c61178c6d04a` on 2026-09-23 for these six required functions:

- Product — profile/product boundary, parity treatment, blocker ownership, gate state, and next-packet authorization.
- Architecture — implementation-target accuracy and no contradiction with WP0.2 architecture contracts.
- Database — repository/RLS/audit/lifecycle implications and no contradiction with WP0.2 database contracts.
- Security/Privacy — data/control mapping, fail-closed behavior, access, incident, evidence, risk, assessment, and claim boundaries.
- Operations/QA — human-role and operational contracts, exercises, continuity, control test/evidence completeness, validator output, negative cases, and exact-candidate reconciliation.
- Legal/counsel — legal-matrix facts, question framing, decision ownership, and fail-closed treatment only. This acceptance does not choose or approve any legal value; all `LEG-*` decisions remain `COUNSEL_REVIEW_REQUIRED`.

Vendor/Procurement, executive-risk, named-human staffing, protected-evidence, exercise, assessor, customer/profile, commercial, policy, compliance, and production decisions remain blockers rather than WP0.3 acceptance functions.

WP0.3 is complete as a specification packet. It is not legally reviewed, operationally exercised, evidence complete, approved for a profile, G0-approved, or production-ready.

## Durable validator

Run this exact repository-relative validator from `/Users/alvinlo/Desktop/Project-HitLink-wp0-3` after implementing WP0.3. It scans full file content, including fenced blocks, and reports category/path/identifier without printing matched secret or regulated values.

```bash
python3 - <<'PY'
from collections import Counter
from hashlib import sha256
from pathlib import Path
import os
import re
import subprocess
import sys

ROOT = Path.cwd()
DOSSIER = Path("docs/compliance/flowstate-pro")
LEGAL = DOSSIER / "legal-applicability-matrix.md"
DATA = DOSSIER / "data-classification-and-flows.md"
CONTROL = DOSSIER / "control-and-evidence-matrix.md"
OPS = DOSSIER / "operations-and-governance.md"
PARITY = DOSSIER / "competitor-parity-matrix.md"
DECISIONS = DOSSIER / "decision-register-and-open-items.md"
PLAN = Path("docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md")
PACKET = DOSSIER / "work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md"
WP03 = {LEGAL, DATA, CONTROL, OPS, PARITY, DECISIONS, PLAN, PACKET}

IMMUTABLE = {
    DOSSIER / "current-standard-baseline.md": "2d5cc1e5a2f092b39601885b1e3f25d100e34894648b912ea7cb80eb89497bab",
    DOSSIER / "evidence/README.md": "d76dee09203d52a62b76cfd95465c315289c23299df95a279c99bfb55c2160a4",
    DOSSIER / "evidence/wp0.1-standard-baseline/candidate-manifest.txt": "bcc7aae1c21d36bb41a9e9f0481353be9e321770334d7ea9dd5a1b5791b29568",
    DOSSIER / "evidence/wp0.1-standard-baseline/prisma-inventory.txt": "ecc37f046fc56a9609df6f18ee38dfaf957f5969d8c75d867f7cbe38e2c798ee",
    DOSSIER / "evidence/wp0.1-standard-baseline/root-command-results.txt": "7c77a60afdef3547bf7d6093d845ef18676ca81ba300c92e72efb3830bc7d431",
    DOSSIER / "evidence/wp0.1-standard-baseline/snapshot-and-toolchain.txt": "e451ef6cdd0868b155d0995d39ca9f658a72ca794dcf8f2f7896ec3fe78f383e",
    DOSSIER / "product-spec.md": "052e636fb5559cf5a853d9db8cca88c238913b006db364d1176410225618f3b9",
    DOSSIER / "product-requirements-document.md": "67363f693d10bc4351664245e3fa9dcc703207b4627bcb946afcd7d18786e8b1",
    DOSSIER / "roadmap.md": "bca12a78c2c19a04305f92932f1698c9ff602130c439b1f5e4075b7c52e38b79",
    DOSSIER / "security-privacy-architecture.md": "4118a63e6a27a4037a45ad2331fbdeef8bacd0c912a20c0734d76c8f152fba59",
    DOSSIER / "system-design.md": "752e8715aeb99444acc8a7185418fa0e9467ae505bcd339b0ec940394f7ebac9",
    DOSSIER / "work-packets/WP0.1-freeze-evidence-and-boundaries.md": "3517e9f0eb37cbb1d0e2e98eb1241c39e774dadc3d8ddeac80fda2b3ec0a9537",
    DOSSIER / "work-packets/WP0.2-author-product-and-architecture-specifications.md": "5d91399f7d99e2ec29019ae3a4dd16eaaea08b04e2a85c85b01f4e2011a3cac0",
}

EXPECTED_LEG = [f"LEG-{n:02d}" for n in range(1, 12)]
EXPECTED_CONTROLS = [
    "GOV-01", "GOV-02", "GOV-03", "GOV-04", "LEG-01", "DAT-01", "DAT-02",
    "ARC-01", "TEN-01", "IAM-01", "IAM-02", "IAM-03", "AUD-01", "AUD-02",
    "LOG-01", "ENC-01", "FIL-01", "CLN-01", "CON-01", "RGT-01", "RET-01",
    "OFF-01", "OUT-01", "VEN-01", "BCP-01", "INC-01", "INC-02", "HR-01",
    "DEV-01", "DEV-02", "QUA-01", "ASS-01", "CLM-01", "EVD-01", "REV-01",
]
EXPECTED_MAPS = {
    "MAP-PURPOSE-AUTHORITY": ({"LEG-02", "LEG-03", "LEG-05"}, {"LEG-01", "CON-01", "DAT-01"}, {"FR-019", "FR-032", "NFR-002"}),
    "MAP-CUSTOMER-PROFILE": ({"LEG-01", "LEG-02", "LEG-03"}, {"GOV-01", "DAT-01"}, {"FR-004", "FR-005", "FR-044"}),
    "MAP-RECORD-ORIGIN": ({"LEG-03", "LEG-05"}, {"DAT-01", "CLN-01"}, {"FR-015", "FR-032", "NFR-003"}),
    "MAP-RIGHTS": ({"LEG-06"}, {"RGT-01"}, {"FR-022", "FR-034"}),
    "MAP-RETENTION": ({"LEG-07"}, {"RET-01"}, {"FR-033", "NFR-014"}),
    "MAP-LEGAL-HOLD": ({"LEG-07"}, {"RET-01", "OFF-01"}, {"FR-033", "FR-035"}),
    "MAP-DISCLOSURE": ({"LEG-04", "LEG-05", "LEG-06"}, {"RGT-01", "OUT-01"}, {"FR-029", "FR-034", "FR-040"}),
    "MAP-TRANSFER": ({"LEG-04", "LEG-10"}, {"OUT-01", "VEN-01"}, {"FR-040", "FR-044", "NFR-006"}),
    "MAP-INCIDENT": ({"LEG-08"}, {"INC-01", "INC-02"}, {"FR-039", "NFR-019"}),
    "MAP-VENDOR": ({"LEG-04"}, {"VEN-01", "OUT-01"}, {"FR-040", "NFR-015", "NFR-016"}),
    "MAP-RESPONSIBILITY": ({"LEG-02", "LEG-04", "LEG-06"}, {"GOV-01", "GOV-02", "GOV-03"}, {"FR-004", "FR-031", "FR-034", "NFR-019"}),
}
EXPECTED_BLOCKERS = {f"WP03-B{n:02d}" for n in range(1, 6)}
MANIFEST_ID = "WP0.3-MUTABLE-MANIFEST-V1"
PACKET_HASH_PLACEHOLDER = "0" * 64
CONTROL_HEADER = [
    "ID", "Requirement / source", "Applicability / profile", "Accountable owner",
    "Implementation target", "Test", "Exercise", "Evidence reference",
    "Review cadence / trigger", "Release gate", "Status / gap",
]
ALLOWED_STATUS = {
    "DRAFT", "PROPOSED", "COUNSEL_REVIEW_REQUIRED", "OWNER_APPROVAL_REQUIRED",
    "APPROVED", "SPECIFIED", "IMPLEMENTED", "TECHNICALLY_VERIFIED",
    "OPERATIONALLY_EXERCISED", "EVIDENCE_COMPLETE", "LEGALLY_REVIEWED",
    "APPROVED_FOR_PROFILE", "BLOCKED", "NOT_APPLICABLE", "SUPERSEDED",
}

errors = []
cache = {}

def fail(category, detail):
    errors.append(f"{category}: {detail}")

def text(path):
    if path not in cache:
        if not path.is_file():
            fail("missing-file", path.as_posix())
            cache[path] = ""
        else:
            cache[path] = path.read_text(encoding="utf-8")
    return cache[path]

def prose(path):
    return re.sub(r"(?ms)^```.*?^```[ \t]*$", "", text(path))

def cells(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]

def require(path, label, pattern):
    if not re.search(pattern, prose(path), re.I | re.S):
        fail("document-contract", f"{path}: missing {label}")

def ids(value, pattern):
    return set(re.findall(pattern, value))

def luhn(value):
    digits = [int(ch) for ch in value if ch.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0

repo_root = Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], text=True, capture_output=True, check=True
).stdout.strip()).resolve()
if ROOT.resolve() != repo_root:
    fail("repository-root", f"run from {repo_root}")
head = subprocess.run(["git", "rev-parse", "HEAD"], text=True, capture_output=True, check=True).stdout.strip()
if head != "d4f2098b4940cae61b9f36345cb480bda33d990d":
    fail("base-commit", head)

# Exact mutable candidate identity. The packet self-hash replaces only its own
# manifest-row digest with the fixed 64-zero placeholder before hashing.
manifest_block = re.search(
    r"<!-- WP0\.3-MUTABLE-MANIFEST-START -->\n(.*?)\n<!-- WP0\.3-MUTABLE-MANIFEST-END -->",
    text(PACKET),
    re.S,
)
mutable_manifest = {}
if not manifest_block:
    fail("mutable-manifest", "manifest block missing")
else:
    for line in manifest_block.group(1).splitlines():
        match = re.fullmatch(r"\| `([^`]+)` \| `([0-9a-f]{64})` \|", line)
        if match:
            path = Path(match.group(1))
            if path in mutable_manifest:
                fail("mutable-manifest", f"duplicate {path}")
            mutable_manifest[path] = match.group(2)
if set(mutable_manifest) != WP03:
    fail(
        "mutable-manifest",
        f"unexpected={sorted(map(str, set(mutable_manifest)-WP03))} missing={sorted(map(str, WP03-set(mutable_manifest)))}",
    )

def mutable_hash(path):
    if path != PACKET:
        return sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    body = path.read_text(encoding="utf-8")
    row_pattern = re.compile(
        rf"(?m)^(\| `{re.escape(PACKET.as_posix())}` \| `)[0-9a-f]{{64}}(` \|)$"
    )
    normalized, replacements = row_pattern.subn(
        lambda match: match.group(1) + PACKET_HASH_PLACEHOLDER + match.group(2), body
    )
    if replacements != 1:
        fail("mutable-manifest", f"packet normalization rows={replacements}")
        return "invalid"
    return sha256(normalized.encode("utf-8")).hexdigest()

for path, expected_hash in mutable_manifest.items():
    if mutable_hash(path) != expected_hash:
        fail("mutable-identity", path.as_posix())

# Exact dirty/untracked scope and inherited identity.
status = subprocess.run(
    ["git", "status", "--porcelain=v1", "-uall"], text=True, capture_output=True, check=True
)
status_paths = {Path(line[3:]) for line in status.stdout.splitlines() if line}
expected_paths = WP03 | set(IMMUTABLE)
if status_paths != expected_paths:
    fail(
        "scope",
        f"unexpected={sorted(map(str, status_paths - expected_paths))} missing={sorted(map(str, expected_paths - status_paths))}",
    )
for path, expected_hash in IMMUTABLE.items():
    actual_hash = sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    if actual_hash != expected_hash:
        fail("inherited-identity", path.as_posix())

# Explicit review outcomes, dates, and candidate binding; loose PASS/APPROVED
# vocabulary elsewhere is not review evidence.
for path in [DECISIONS, PLAN, PACKET]:
    body = text(path)
    exact_review_fields = {
        "specification outcome": r"^\*\*Independent specification review outcome:\*\* `PASS`$",
        "specification date": r"^\*\*Independent specification review date:\*\* `2026-09-23`$",
        "specification candidate": rf"^\*\*Independent specification review candidate:\*\*.*`{re.escape(MANIFEST_ID)}`",
        "quality outcome": r"^\*\*Independent quality review outcome:\*\* `APPROVED`$",
        "quality date": r"^\*\*Independent quality review date:\*\* `2026-09-23`$",
        "quality candidate": rf"^\*\*Independent quality review candidate:\*\*.*`{re.escape(MANIFEST_ID)}`",
    }
    for label, pattern in exact_review_fields.items():
        if not re.search(pattern, body, re.M):
            fail("review-record", f"{path}: {label}")

# Top-level status and G0/WP1 boundaries.
for path in [LEGAL, DATA, CONTROL, OPS, PARITY]:
    first = "\n".join(text(path).splitlines()[:16])
    if not re.search(r"^\*\*Status:\*\*.*\bSPECIFIED\b", first, re.I | re.M):
        fail("status", f"{path}: top status must include SPECIFIED")
    if not re.search(r"\bG0\b.*\bBLOCKED\b|\bBLOCKED\b.*\bG0\b", first, re.I):
        fail("status", f"{path}: top status must state G0 BLOCKED")
for path in WP03:
    body = prose(path)
    if not re.search(r"\bG0\b.{0,80}\bBLOCKED\b|\bBLOCKED\b.{0,80}\bG0\b", body, re.I | re.S):
        fail("g0-boundary", path.as_posix())
    if not re.search(r"WP1(?:\.x|\.1|\b).{0,80}(?:unauthorized|not authorized|must not begin|prohibited)", body, re.I | re.S):
        fail("wp1-boundary", path.as_posix())

# Full-document metadata rendering on all eight mutable documents.
for path in WP03:
    if re.search(r"^\*\*[^\n]+:\*\*[^\n]*\n\*\*[^\n]+:\*\*", text(path), re.M):
        fail("metadata-rendering", f"{path}: adjacent bold metadata lines require a blank line")
    for number, line in enumerate(text(path).splitlines(), 1):
        if line.endswith((" ", "\t")):
            fail("trailing-whitespace", f"{path}:{number}")

# LEG-01..LEG-11 exact counsel registry. Parse any table row beginning with LEG-*.
legal_rows = {}
for number, line in enumerate(text(LEGAL).splitlines(), 1):
    row = cells(line) if line.lstrip().startswith("|") else []
    if row and re.fullmatch(r"LEG-\d{2}", row[0]):
        if row[0] in legal_rows:
            fail("duplicate-legal-decision", row[0])
        legal_rows[row[0]] = (number, row)
if list(sorted(legal_rows)) != EXPECTED_LEG:
    fail("legal-decision-set", f"missing={sorted(set(EXPECTED_LEG)-set(legal_rows))} unexpected={sorted(set(legal_rows)-set(EXPECTED_LEG))}")
for identifier, (number, row) in legal_rows.items():
    if not any(cell == "`COUNSEL_REVIEW_REQUIRED`" or cell == "COUNSEL_REVIEW_REQUIRED" for cell in row):
        fail("counsel-status", f"{LEGAL}:{number} {identifier}")
    if any(re.fullmatch(r"`?(?:APPROVED|LEGALLY_REVIEWED|NOT_APPLICABLE|APPROVED_FOR_PROFILE)`?", cell) for cell in row):
        fail("counsel-approval-overclaim", f"{LEGAL}:{number} {identifier}")
    if len(row) < 8 or any(not re.search(r"\w", cell) for cell in row[1:7]):
        fail("legal-decision-fields", f"{LEGAL}:{number} {identifier}")

# Control table exact header and complete exact control ID set.
control_lines = text(CONTROL).splitlines()
header_index = None
for index, line in enumerate(control_lines):
    if line.lstrip().startswith("|") and cells(line) == CONTROL_HEADER:
        header_index = index
        break
if header_index is None:
    fail("control-header", "exact 11-column header not found")
control_rows = {}
if header_index is not None:
    for number, line in enumerate(control_lines[header_index + 2 :], header_index + 3):
        if not line.lstrip().startswith("|"):
            if control_rows:
                break
            continue
        row = cells(line)
        if not row or not re.fullmatch(r"[A-Z]{2,3}-\d{2}", row[0]):
            if control_rows:
                break
            continue
        if row[0] in control_rows:
            fail("duplicate-control", row[0])
        control_rows[row[0]] = (number, row)
if set(control_rows) != set(EXPECTED_CONTROLS):
    fail("control-id-set", f"missing={sorted(set(EXPECTED_CONTROLS)-set(control_rows))} unexpected={sorted(set(control_rows)-set(EXPECTED_CONTROLS))}")
for identifier, (number, row) in control_rows.items():
    if len(row) != len(CONTROL_HEADER):
        fail("control-column-count", f"{CONTROL}:{number} {identifier}")
        continue
    for column, value in zip(CONTROL_HEADER[1:], row[1:]):
        if not re.search(r"\w", value):
            fail("control-field", f"{identifier} empty {column}")
    if not re.search(r"\b(?:G[0-4]|P[1-7])\b", row[9]):
        fail("release-gate", f"{identifier} {row[9]}")
    statuses = set(re.findall(r"`([A-Z_]+)`", row[10]))
    unknown_statuses = statuses - ALLOWED_STATUS
    if unknown_statuses:
        fail("status-vocabulary", f"{identifier} {sorted(unknown_statuses)}")
    if not statuses:
        fail("control-status", identifier)

# Canonical mapping rows and minimum exact references.
map_rows = {}
for number, line in enumerate(control_lines, 1):
    row = cells(line) if line.lstrip().startswith("|") else []
    if row and re.fullmatch(r"MAP-[A-Z-]+", row[0]):
        if row[0] in map_rows:
            fail("duplicate-map", row[0])
        map_rows[row[0]] = (number, row)
if set(map_rows) != set(EXPECTED_MAPS):
    fail("mapping-id-set", f"missing={sorted(set(EXPECTED_MAPS)-set(map_rows))} unexpected={sorted(set(map_rows)-set(EXPECTED_MAPS))}")
for identifier, (legal_expected, control_expected, req_expected) in EXPECTED_MAPS.items():
    if identifier not in map_rows:
        continue
    number, row = map_rows[identifier]
    body = " | ".join(row)
    if not legal_expected <= ids(body, r"LEG-\d{2}"):
        fail("mapping-legal-ref", f"{identifier} at {number}")
    if not control_expected <= ids(body, r"(?:GOV|LEG|DAT|ARC|TEN|IAM|AUD|LOG|ENC|FIL|CLN|CON|RGT|RET|OFF|OUT|VEN|BCP|INC|HR|DEV|QUA|ASS|CLM|EVD|REV)-\d{2}"):
        fail("mapping-control-ref", f"{identifier} at {number}")
    if not req_expected <= ids(body, r"(?:FR|NFR)-\d{3}"):
        fail("mapping-requirement-ref", f"{identifier} at {number}")
    if not re.search(r"\b(?:G[0-4]|P[1-7])\b", body):
        fail("mapping-release-gate", identifier)
    if not re.search(r"(?:BLOCKED|deny|retain|quarantine|review|disabled)", body, re.I):
        fail("mapping-fail-closed", identifier)

# Required blocker records in the decision register.
blocker_rows = {}
for number, line in enumerate(text(DECISIONS).splitlines(), 1):
    row = cells(line) if line.lstrip().startswith("|") else []
    if row and re.fullmatch(r"WP03-B\d{2}", row[0]):
        if row[0] in blocker_rows:
            fail("duplicate-blocker", row[0])
        blocker_rows[row[0]] = (number, row)
if set(blocker_rows) != EXPECTED_BLOCKERS:
    fail("blocker-id-set", f"missing={sorted(EXPECTED_BLOCKERS-set(blocker_rows))} unexpected={sorted(set(blocker_rows)-EXPECTED_BLOCKERS)}")
for identifier, (number, row) in blocker_rows.items():
    if len(row) < 6:
        fail("blocker-fields", f"{DECISIONS}:{number} {identifier}")
        continue
    if not any(cell == "`BLOCKED`" or cell == "BLOCKED" for cell in row):
        fail("blocker-status", identifier)
    if any(re.fullmatch(r"`?(?:APPROVED|LEGALLY_REVIEWED|APPROVED_FOR_PROFILE)`?", cell) for cell in row):
        fail("blocker-approval-overclaim", identifier)
    if any(not re.search(r"\w", cell) for cell in row[1:6]):
        fail("blocker-fields", f"{DECISIONS}:{number} {identifier}")

# Required document contracts and exact cross-document references.
require(LEGAL, "counsel boundary", r"statutory facts?.*not.*customer|customer.*conclusion.*COUNSEL_REVIEW_REQUIRED")
require(LEGAL, "row-level DRAFT semantics", r"Row-level `DRAFT`.*source summary.*not been accepted.*customer/profile applicability conclusion.*pending qualified-counsel.*`COUNSEL_REVIEW_REQUIRED`")
require(LEGAL, "all mapping families", r"MAP-PURPOSE-AUTHORITY.*MAP-CUSTOMER-PROFILE.*MAP-RECORD-ORIGIN.*MAP-RIGHTS.*MAP-RETENTION.*MAP-LEGAL-HOLD.*MAP-DISCLOSURE.*MAP-TRANSFER.*MAP-INCIDENT.*MAP-VENDOR.*MAP-RESPONSIBILITY")
require(DATA, "classification vocabulary", r"`D0`.*`D1`.*`D2`.*`D3`.*`D4`.*`D5`.*`D6`.*`D7`.*`D8`.*`D9`.*`DX`")
require(DATA, "decision-input fields", r"purpose/authority.*customer/applicability profile.*record origin.*rights.*retention.*legal hold.*disclosure.*transfer.*incident.*vendor.*responsibility")
require(DATA, "unknown destination block", r"Unknown.*vendor.*agreement.*transfer.*`BLOCKED`|Unknown.*provider.*agreement.*transfer.*`BLOCKED`")
require(CONTROL, "launch evidence fields", r"Implementation target.*Test.*Exercise.*Evidence reference.*Review cadence / trigger.*Release gate")
require(OPS, "accountable humans", r"named natural person.*delegate.*segregation|segregation.*named natural person")
require(OPS, "required safeguards", r"access review.*screening.*training.*sanctions.*incident command.*vendor review.*risk analysis.*penetration.*insurance.*protected evidence")
require(OPS, "missing human blocker", r"Missing.*(?:human|role|owner).*`BLOCKED`|`BLOCKED`.*(?:human|role|owner)")
require(PARITY, "benchmark-only boundary", r"benchmark.*not.*(?:vendor approval|procurement|legal|compliance|production)|not.*(?:vendor approval|procurement|legal|compliance|production).*benchmark")
require(PARITY, "source dates preserved", r"2026-08-24.*2026-08-26")
require(DECISIONS, "WP0.3 review state", r"WP0\.3.*independent specification.*PASS.*quality.*APPROVED")
require(DECISIONS, "WP0.3 human acceptance", r"2026-09-23.*accepted.*Product.*Architecture.*Database.*Security/Privacy.*Operations/QA.*legal/counsel")
require(DECISIONS, "WP0.3 completion", r"WP0\.3.*COMPLETED")
require(DECISIONS, "WP0.4 authorization boundary", r"WP0\.4.*authorized.*not started")
require(PLAN, "WP0.3 checklist", r"### WP0\.3.*Acceptance checklist")
require(PLAN, "WP0.3 complete", r"WP0\.3.*complete")
require(PLAN, "WP0.4 authorized not started", r"WP0\.4.*authorized.*not started")
require(PLAN, "G0 blocked", r"WP0\.3.*G0.*`BLOCKED`|G0.*`BLOCKED`.*WP0\.3")
require(PLAN, "WP1 unauthorized", r"WP0\.3.*WP1\.x.*unauthorized|WP1\.x.*unauthorized.*WP0\.3")

for function in ["Product owner", "Architecture owner", "Communications owner", "Independent assessor"]:
    if not re.search(rf"^\| {re.escape(function)}(?: / [^|]+)? \|", text(CONTROL), re.M):
        fail("accountable-function", f"{CONTROL}: {function}")
    if not re.search(rf"^\| {re.escape(function)}(?: / [^|]+)? \|", text(OPS), re.M):
        fail("accountable-function", f"{OPS}: {function}")

# Unsupported sequencing, approval, legal, compliance, vendor, evidence, and production claims.
semantic_patterns = {
    "g0-approved": re.compile(
        r"(?:\bG0\b\s+(?:"
        r"(?:is|was|remains)\s+(?:now\s+)?(?:approved|pass(?:ed)?|open(?:ed)?|authorized|cleared)"
        r"|(?:has|had)\s+(?:now\s+)?(?:been\s+)?(?:approved|passed|open(?:ed)?|authorized|cleared)"
        r"|(?:may|can|will)\s+(?:now\s+)?(?:pass|open|be\s+(?:approved|opened|authorized|cleared))"
        r"|(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)(?:granted|given|confirmed)\s+(?:approval|authorization|clearance)"
        r"|(?:is|was)\s+not\s+(?:not\s+(?:approved|authorized|cleared)|unapproved|unauthorized|uncleared)"
        r"|(?:approval|authorization|clearance)\s+(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)?(?:granted|given|confirmed)"
        r"|(?:now\s+)?(?:approved|pass(?:ed)?|open|authorized|cleared))"
        r"|\bIt\s+is\s+not\s+the\s+case\s+that\s+\bG0\b\s+(?:is|was)\s+not\s+(?:approved|authorized|cleared)"
        r"|\b(?:approval|authorization|clearance)\b\s+(?:"
        r"for\s+\bG0\b\s+(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)?(?:granted|given|confirmed)"
        r"|(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)(?:granted|given|confirmed)\s+for\s+\bG0\b))\b",
        re.I,
    ),
    "wp1-authorized": re.compile(
        r"(?:\bWP1(?:\.x|\.\d+)?\b(?:\s+(?:work|implementation|development))?\s+(?:"
        r"(?:is|was)\s+(?:now\s+)?(?:authorized|approved|cleared|(?:allowed|permitted)\s+to\s+(?:begin|start|commence|proceed))"
        r"|(?:has|had)\s+(?:now\s+)?been\s+(?:authorized|approved|cleared)"
        r"|(?:may|can|will)\s+(?:now\s+)?(?:begin|start|commence|proceed|be\s+(?:authorized|approved|cleared))"
        r"|(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)(?:granted|given|confirmed)\s+(?:approval|authorization|clearance)"
        r"|(?:is|was)\s+not\s+(?:not\s+(?:approved|authorized|cleared)|unapproved|unauthorized|uncleared)"
        r"|(?:may|can|will)\s+not\s+not\s+(?:begin|start|commence|proceed)"
        r"|(?:approval|authorization|clearance)\s+(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)?(?:granted|given|confirmed)"
        r"|(?:now\s+)?(?:authorized|approved|cleared))"
        r"|\bIt\s+is\s+not\s+the\s+case\s+that\s+\bWP1(?:\.x|\.\d+)?\b\s+(?:(?:is|was)\s+not\s+(?:approved|authorized|cleared)|(?:may|can|will)\s+not\s+(?:begin|start|commence|proceed))"
        r"|\b(?:approval|authorization|clearance)\b\s+(?:"
        r"for\s+\bWP1(?:\.x|\.\d+)?\b\s+(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)?(?:granted|given|confirmed)"
        r"|(?:(?:is|was)\s+(?:now\s+)?|(?:has|had)\s+(?:now\s+)?been\s+)(?:granted|given|confirmed)\s+for\s+\bWP1(?:\.x|\.\d+)?\b))\b",
        re.I,
    ),
    "standard-migration-allowed": re.compile(r"\b(?:supports?|allows?|offers?|provides?|has)\s+(?:a\s+)?Standard-to-Pro\s+(?:migration|upgrade|conversion|link)", re.I),
    "compliance-claim": re.compile(
        r"\b(?:Flowstate(?: Pro)?|the (?:platform|product|service|system)|we)(?:'s)?\s+"
        r"(?:(?:is|are)\s+(?:fully\s+)?(?:(?:HIPAA|PIPEDA|PIPA)[ -]?)?compliant"
        r"|(?:is|are)\s+compliant\s+with\s+(?:HIPAA|PIPEDA|PIPA)"
        r"|(?:satisf(?:y|ies|ied)|meet(?:s)?|met|fulfills?|(?:has|have)\s+satisfied)\s+"
        r"(?:(?:HIPAA|PIPEDA|PIPA)\s+)?(?:compliance\s+)?requirements"
        r"|(?:HIPAA|PIPEDA|PIPA)?\s*compliance\s+(?:is|has been)\s+satisfied)\b",
        re.I,
    ),
    "production-ready-claim": re.compile(r"\b(?:Flowstate(?: Pro)?|the (?:platform|product|service|system)|we)\s+(?:is|are|has been)\s+(?:production[- ]ready|ready for production)\b", re.I),
    "vendor-approved-claim": re.compile(r"\b(?:patient CIAM|email|malware scanner|monitoring|eligibility|calendar|vendor)\b.{0,40}\b(?:is|has been)\s+(?:approved|selected|contracted)\b", re.I),
    "evidence-complete-claim": re.compile(r"\b(?:WP0\.3|Flowstate Pro|the dossier)\b.{0,50}\b(?:is|has been)\s+EVIDENCE_COMPLETE\b", re.I),
    "legal-review-claim": re.compile(r"\b(?:WP0\.3|Flowstate Pro|the dossier|the profile)\b.{0,50}\b(?:is|has been)\s+LEGALLY_REVIEWED\b", re.I),
    "profile-approved-claim": re.compile(r"\b(?:WP0\.3|Flowstate Pro|the dossier|the profile)\b.{0,50}\b(?:is|has been)\s+APPROVED_FOR_PROFILE\b", re.I),
}

def logical_blocks(body):
    blocks = []
    parts = []
    start = None

    def flush():
        nonlocal parts, start
        if parts:
            blocks.append((start, " ".join(part.strip() for part in parts)))
            parts = []
            start = None

    for number, line in enumerate(body.splitlines(), 1):
        if not line.strip():
            flush()
            continue
        standalone = bool(re.match(r"\s*(?:#{1,6}\s|\|)", line))
        new_item = bool(re.match(r"\s*(?:[-*+] |\d+[.)] )", line))
        if standalone or new_item:
            flush()
        if start is None:
            start = number
        parts.append(line)
        if standalone:
            flush()
    flush()
    return blocks

def sentence_context(block, match):
    boundaries = list(re.finditer(r"[.!?;](?=\s|$)", block))
    start = max((item.end() for item in boundaries if item.end() <= match.start()), default=0)
    end = next((item.end() for item in boundaries if item.start() >= match.end()), len(block))
    return block[start:end], match.start() - start, match.end() - start

def claim_is_nonassertive(block, match):
    sentence, claim_start, claim_end = sentence_context(block, match)
    prefix = sentence[:claim_start]
    suffix = sentence[claim_end:]
    stripped = re.sub(r"^\s*[-*+]\s*", "", sentence)
    coordinator = r"\b(?:and|but|however|yet|nevertheless|instead)\b"
    local_prefix = re.split(rf"(?:[:,]|{coordinator})", prefix, flags=re.I)[-1]

    question_sentence = re.sub(r"[`*_]", "", stripped)
    question_prefix = re.sub(r"[`*_]", "", prefix)
    leading_question = re.match(
        r"\s*(?:is|are|was|were|do|does|did|has|have|had|can|could|may|might|will|would|shall|should|must)\b",
        question_sentence,
        re.I,
    )
    if (
        sentence.rstrip().endswith("?")
        and leading_question
        and not re.search(rf"[,;:]|{coordinator}", question_prefix[leading_question.end():], re.I)
    ):
        return True
    if re.fullmatch(r"\s*(?:is|was|has|had|may|can|will)\s+", prefix, re.I):
        return True
    if re.search(r"\bnot\b[^.;:!?]*\b(?:statement|claim|assertion)\s+that\s*$", prefix, re.I):
        return True
    if re.match(r"\s*No\b[^.;:!?]*\b(?:or|nor)\s+$", prefix, re.I):
        return True
    if re.search(r"\bno(?:\s+(?:production|current|specific|such|public|deployed|configured|named|live|applicable)){0,3}\s*$", local_prefix, re.I):
        return True
    if re.search(r"\b(?:does?|did)\s+not\s+(?:mean|establish|state|claim|assert|show|demonstrate|confirm)\s+(?:that\s+)?$", local_prefix, re.I):
        return True

    for pattern in [
        r"\bIt\s+is\s+(?:false|disputed)\s+that\s*$",
        r"\bIt\s+(?:has|had)\s+not\s+been\s+established\s+that\s*$",
        r"\bNo\s+evidence\s+(?:confirms?|establishes?|shows?|demonstrates?)\s+that\s*$",
        r"\bIt\s+is\s+unresolved\s+whether\s*$",
        r"\bWe\s+have\s+not\s+resolved\s+whether\s*$",
    ]:
        governed = re.search(pattern, prefix, re.I)
        if governed and not re.search(coordinator, prefix[governed.end():], re.I):
            return True

    leading_conditional = re.match(r"\s*(?:if|when|unless|whether|assuming|provided\s+that|assume|imagine)\b", stripped, re.I)
    if leading_conditional:
        comma = sentence.find(",")
        if comma < 0 or claim_start < comma or not re.search(coordinator, sentence[comma + 1:claim_start], re.I):
            return True
    for pattern in [
        r"\b(?:hypothetical|hypothetically)\b\s*[:,]?",
        r"\bsuppose\b",
        r"\b(?:remains?\s+unresolved|open\s+question\s+is)\s+whether\b",
    ]:
        governed = re.search(pattern, prefix, re.I)
        if governed and not re.search(coordinator, prefix[governed.end():], re.I):
            return True

    clause_suffix = re.split(coordinator, suffix, maxsplit=1, flags=re.I)[0]
    if re.search(r"\b(?:the\s+question\s+)?whether\s*$", prefix, re.I) and re.match(r"\s+remains?\s+unresolved\b", clause_suffix, re.I):
        return True
    if re.search(r"\b(?:if|when|unless|provided\s+that|after)\b", clause_suffix, re.I):
        return True
    return False

def claim_is_labeled_example(block, match):
    prefix = block[:match.start()]
    if not re.search(r"\b(?:quoted vocabulary|allowed example|mutation fixture|test fixture)\s*:\s*[`\"']?\s*$", prefix, re.I):
        return False
    after = block[match.end():]
    inline_code = prefix.count("`") % 2 == 1 and after.count("`") % 2 == 1
    quoted = (prefix.rstrip().endswith(('"', "'")) and after.lstrip().startswith(('"', "'")))
    return inline_code or quoted

def semantic_findings(body):
    findings = []
    for line_number, block in logical_blocks(body):
        for category, pattern in semantic_patterns.items():
            for match in pattern.finditer(block):
                if claim_is_nonassertive(block, match):
                    continue
                if claim_is_labeled_example(block, match):
                    continue
                findings.append((category, line_number))
    return findings

unsupported_status = re.compile(
    r"^\*\*Status:\*\*\s*(?P<tick>`?)(?:COMPLIANT|PRODUCTION_READY|APPROVED_FOR_PROFILE|LEGALLY_REVIEWED|EVIDENCE_COMPLETE)\b(?P=tick)",
    re.I | re.M,
)
for path in WP03:
    body = prose(path)
    for category, number in semantic_findings(body):
        fail(category, f"{path}:{number}")
    if unsupported_status.search("\n".join(body.splitlines()[:16])):
        fail("unsupported-status", path.as_posix())

# Deterministic mutation tests for claims, statuses, counsel values, blockers, and G0.
BAD_CLAIMS = {
    "hipaa-compliant": ("Flowstate Pro is HIPAA-compliant.", "compliance-claim"),
    "satisfies-pipeda": ("The platform satisfies PIPEDA requirements.", "compliance-claim"),
    "production-ready": ("Flowstate Pro is production-ready.", "production-ready-claim"),
    "vendor-approved": ("The patient CIAM vendor has been approved.", "vendor-approved-claim"),
    "evidence-complete": ("WP0.3 is EVIDENCE_COMPLETE.", "evidence-complete-claim"),
    "legally-reviewed": ("The dossier is LEGALLY_REVIEWED.", "legal-review-claim"),
    "profile-approved": ("The profile is APPROVED_FOR_PROFILE.", "profile-approved-claim"),
    "g0-has-been-passed": ("G0 has been passed.", "g0-approved"),
    "g0-has-passed": ("G0 has passed.", "g0-approved"),
    "g0-inline-has-passed": ("`G0 has passed`", "g0-approved"),
    "g0-pass": ("G0 PASS", "g0-approved"),
    "g0-inline-pass": ("`G0 PASS`", "g0-approved"),
    "g0-approved": ("G0 approved.", "g0-approved"),
    "g0-inline-approved": ("`G0 approved`", "g0-approved"),
    "g0-authorized": ("G0 is authorized.", "g0-approved"),
    "g0-inline-authorized": ("`G0 is authorized`", "g0-approved"),
    "g0-was-approved": ("G0 was approved.", "g0-approved"),
    "g0-had-passed": ("G0 had passed.", "g0-approved"),
    "g0-may-pass": ("G0 may pass.", "g0-approved"),
    "g0-can-be-authorized": ("G0 can be authorized.", "g0-approved"),
    "g0-is-now-approved": ("G0 is now approved.", "g0-approved"),
    "g0-inline-is-now-approved": ("`G0 is now approved`", "g0-approved"),
    "g0-has-now-passed": ("G0 has now passed.", "g0-approved"),
    "g0-inline-has-now-passed": ("`G0 has now passed`", "g0-approved"),
    "g0-is-cleared": ("G0 is cleared.", "g0-approved"),
    "g0-approval-granted": ("G0 approval granted.", "g0-approved"),
    "g0-approval-has-been-granted": ("G0 approval has been granted.", "g0-approved"),
    "g0-inline-approval-has-been-granted": ("`G0 approval has been granted`", "g0-approved"),
    "g0-approval-for-has-been-granted": ("Approval for G0 has been granted.", "g0-approved"),
    "g0-approval-was-granted-for": ("Approval was granted for G0.", "g0-approved"),
    "g0-clearance-for-has-been-given": ("Clearance for G0 has been given.", "g0-approved"),
    "g0-inline-approval-for-has-been-granted": ("`Approval for G0 has been granted`", "g0-approved"),
    "g0-wrapped-approval-for-has-been-granted": ("Approval for G0 has been\ngranted.", "g0-approved"),
    "g0-was-granted-approval": ("G0 was granted approval.", "g0-approved"),
    "g0-inline-was-granted-approval": ("`G0 was granted approval.`", "g0-approved"),
    "g0-wrapped-was-granted-approval": ("G0 was granted\napproval.", "g0-approved"),
    "g0-has-been-given-clearance": ("G0 has been given clearance.", "g0-approved"),
    "g0-inline-has-been-given-clearance": ("`G0 has been given clearance.`", "g0-approved"),
    "g0-wrapped-has-been-given-clearance": ("G0 has been given\nclearance.", "g0-approved"),
    "wp1-authorized": ("WP1.1 is now authorized.", "wp1-authorized"),
    "wp1-inline-authorized": ("`WP1.1 is now authorized`", "wp1-authorized"),
    "wp1-approved": ("WP1.1 approved.", "wp1-authorized"),
    "wp1-inline-approved": ("`WP1.1 approved`", "wp1-authorized"),
    "wp1-may-begin": ("WP1.1 may begin.", "wp1-authorized"),
    "wp1-inline-may-begin": ("`WP1.1 may begin`", "wp1-authorized"),
    "wp1x-can-begin": ("WP1.x can begin.", "wp1-authorized"),
    "wp1x-inline-can-begin": ("`WP1.x can begin`", "wp1-authorized"),
    "wp1-was-approved": ("WP1.1 was approved.", "wp1-authorized"),
    "wp1-has-been-approved": ("WP1.1 has been approved.", "wp1-authorized"),
    "wp1-may-be-authorized": ("WP1.1 may be authorized.", "wp1-authorized"),
    "wp1-permitted-to-begin": ("WP1.1 is permitted to begin.", "wp1-authorized"),
    "wp1x-direct-authorized": ("WP1.x authorized.", "wp1-authorized"),
    "wp1x-inline-authorized": ("`WP1.x authorized`", "wp1-authorized"),
    "wp1-bare-authorized": ("WP1 is authorized.", "wp1-authorized"),
    "wp1-can-start": ("WP1.1 can start.", "wp1-authorized"),
    "wp1-inline-can-start": ("`WP1.1 can start`", "wp1-authorized"),
    "wp1-may-commence": ("WP1.1 may commence.", "wp1-authorized"),
    "wp1-inline-may-commence": ("`WP1.1 may commence`", "wp1-authorized"),
    "wp1-work-may-commence": ("WP1.1 work may commence.", "wp1-authorized"),
    "wp1-implementation-can-proceed": ("WP1.1 implementation can proceed.", "wp1-authorized"),
    "wp1-is-cleared": ("WP1.1 is cleared.", "wp1-authorized"),
    "wp1-authorization-granted": ("WP1.1 authorization granted.", "wp1-authorized"),
    "wp1-authorization-has-been-granted": ("WP1.1 authorization has been granted.", "wp1-authorized"),
    "wp1-inline-authorization-has-been-granted": ("`WP1.1 authorization has been granted`", "wp1-authorized"),
    "wp1-authorization-for-has-been-granted": ("Authorization for WP1.1 has been granted.", "wp1-authorized"),
    "wp1-authorization-has-been-granted-for": ("Authorization has been granted for WP1.1.", "wp1-authorized"),
    "wp1-inline-authorization-has-been-granted-for": ("`Authorization has been granted for WP1.1`", "wp1-authorized"),
    "wp1-wrapped-authorization-has-been-granted-for": ("Authorization has been granted\nfor WP1.1.", "wp1-authorized"),
    "wp1-was-granted-authorization": ("WP1.1 was granted authorization.", "wp1-authorized"),
    "wp1-inline-was-granted-authorization": ("`WP1.1 was granted authorization.`", "wp1-authorized"),
    "wp1-wrapped-was-granted-authorization": ("WP1.1 was granted\nauthorization.", "wp1-authorized"),
    "wp1-has-been-given-clearance": ("WP1.1 has been given clearance.", "wp1-authorized"),
    "wp1-inline-has-been-given-clearance": ("`WP1.1 has been given clearance.`", "wp1-authorized"),
    "wp1-wrapped-has-been-given-clearance": ("WP1.1 has been given\nclearance.", "wp1-authorized"),
    "wp1-development-may-commence": ("WP1.1 development may commence.", "wp1-authorized"),
    "wp1-inline-development-may-commence": ("`WP1.1 development may commence`", "wp1-authorized"),
    "inline-hipaa-compliant": ("`Flowstate Pro is HIPAA-compliant`", "compliance-claim"),
    "inline-production-ready": ("`Flowstate Pro is production-ready`", "production-ready-claim"),
    "mixed-negative-positive-compliance": ("Flowstate Pro is not HIPAA-compliant, but Flowstate Pro is HIPAA-compliant.", "compliance-claim"),
    "colon-negative-positive-compliance": ("Flowstate Pro is not HIPAA-compliant: Flowstate Pro is HIPAA-compliant.", "compliance-claim"),
    "unrelated-disclaimer-before-g0": ("This is not legal advice and G0 is approved.", "g0-approved"),
    "unrelated-no-before-g0": ("No legal review occurred and G0 is approved.", "g0-approved"),
    "no-reviewer-objected-before-g0": ("No reviewer objected, G0 is approved.", "g0-approved"),
    "double-negative-g0": ("It is not false that G0 is approved.", "g0-approved"),
    "not-disputed-wp1": ("It is not disputed that WP1.1 may start.", "wp1-authorized"),
    "g0-not-not-approved": ("G0 is not not approved.", "g0-approved"),
    "g0-not-unapproved": ("G0 is not unapproved.", "g0-approved"),
    "wp1-may-not-not-begin": ("WP1.1 may not not begin.", "wp1-authorized"),
    "not-the-case-g0-not-approved": ("It is not the case that G0 is not approved.", "g0-approved"),
    "negative-g0-before-wp1": ("G0 is not approved and WP1.1 can start.", "wp1-authorized"),
    "prior-conditional-sentence-before-g0": ("If review is requested, record it. G0 is approved.", "g0-approved"),
    "conditional-and-independent-g0": ("If review is requested, record it, and G0 is approved.", "g0-approved"),
    "conditional-but-independent-g0": ("If review is requested, record it, but G0 is approved.", "g0-approved"),
    "hypothetical-but-independent-g0": ("Hypothetically, review the phrase, but G0 is approved.", "g0-approved"),
    "assuming-and-independent-g0": ("Assuming G0 is approved, record it, and G0 is approved.", "g0-approved"),
    "provided-but-independent-wp1": ("Provided that G0 is approved, record it, but WP1.1 can start.", "wp1-authorized"),
    "assume-next-sentence-g0": ("Assume G0 is approved. G0 is approved.", "g0-approved"),
    "imagine-but-independent-wp1": ("Imagine WP1.1 may begin, but WP1.1 may begin.", "wp1-authorized"),
    "suffix-provided-and-independent-wp1": ("G0 is approved provided that reviewers later approve it, and WP1.1 may begin.", "wp1-authorized"),
    "suffix-after-but-independent-g0": ("WP1.1 may commence after G0 passes, but G0 is approved.", "g0-approved"),
    "question-but-independent-wp1": ("The open question is whether review occurred, but WP1.1 can start.", "wp1-authorized"),
    "unresolved-and-independent-g0": ("It remains unresolved whether review occurred, and G0 is approved.", "g0-approved"),
    "wrapped-g0-approved": ("G0 is\napproved.", "g0-approved"),
    "wrapped-g0-approval-granted": ("G0 approval has been\ngranted.", "g0-approved"),
    "wrapped-wp1-development": ("WP1.1 development\nmay commence.", "wp1-authorized"),
    "wrapped-wp1-authorization": ("WP1.1 authorization has been\ngranted.", "wp1-authorized"),
    "wrapped-hipaa-compliant": ("Flowstate Pro is\nHIPAA-compliant.", "compliance-claim"),
    "question-then-positive": ("Is G0 approved? G0 is approved.", "g0-approved"),
    "wrapped-inline-g0-approved": ("`G0 is\napproved.`", "g0-approved"),
    "g0-declarative-before-tag-question": ("G0 is approved, but is that acceptable?", "g0-approved"),
    "wp1-declarative-before-tag-question": ("WP1.1 may start, correct?", "wp1-authorized"),
    "g0-declarative-before-independent-question": ("G0 is approved, and what happens next?", "g0-approved"),
}
PERFECT_OPEN_FIXTURES = {
    "g0-has-been-open": "G0 has been open.",
    "g0-had-been-open": "G0 had been open.",
    "g0-has-now-been-open": "G0 has now been open.",
    "g0-had-now-been-open": "G0 had now been open.",
}
for label, sample in PERFECT_OPEN_FIXTURES.items():
    BAD_CLAIMS[f"{label}-plain"] = (sample, "g0-approved")
    BAD_CLAIMS[f"{label}-inline"] = (f"`{sample}`", "g0-approved")
    BAD_CLAIMS[f"{label}-wrapped"] = (sample.rsplit(" ", 1)[0] + "\n" + sample.rsplit(" ", 1)[1], "g0-approved")
PASSIVE_GRANT_FIXTURES = {
    "g0-is-granted-approval": ("G0 is granted approval.", "g0-approved"),
    "g0-is-given-clearance": ("G0 is given clearance.", "g0-approved"),
    "g0-is-confirmed-authorization": ("G0 is confirmed authorization.", "g0-approved"),
    "wp1-is-granted-authorization": ("WP1.1 is granted authorization.", "wp1-authorized"),
    "wp1-is-given-clearance": ("WP1.1 is given clearance.", "wp1-authorized"),
    "wp1-is-confirmed-approval": ("WP1.1 is confirmed approval.", "wp1-authorized"),
    "g0-has-now-been-granted-approval": ("G0 has now been granted approval.", "g0-approved"),
    "wp1-had-now-been-given-clearance": ("WP1.1 had now been given clearance.", "wp1-authorized"),
}
for label, (sample, expected) in PASSIVE_GRANT_FIXTURES.items():
    BAD_CLAIMS[f"{label}-plain"] = (sample, expected)
    BAD_CLAIMS[f"{label}-inline"] = (f"`{sample}`", expected)
    BAD_CLAIMS[f"{label}-wrapped"] = (sample.rsplit(" ", 1)[0] + "\n" + sample.rsplit(" ", 1)[1], expected)
ALLOWED_NEGATIVE_CLAIMS = {
    "direct-negative": "Flowstate Pro is not HIPAA-compliant by virtue of this document.",
    "production-boundary": "The platform is not ready for production.",
    "vendor-boundary": "The vendor is not approved.",
    "evidence-legal-boundary": "WP0.3 is not EVIDENCE_COMPLETE or LEGALLY_REVIEWED.",
    "g0-wp1-boundary": "G0 remains BLOCKED; WP1.x is unauthorized.",
    "full-form-negative": "No application, schema, migration, test, runtime, infrastructure, vendor, credential, PHI-capable, production, or WP1.x work is authorized.",
    "quoted-vocabulary": "Quoted vocabulary: `G0 approved`.",
    "allowed-example": "Allowed example: \"WP1.x authorized\".",
    "g0-passed-fixture": "Test fixture: `G0 has passed`.",
    "wp1-begin-example": "Allowed example: \"WP1.1 may begin\".",
    "mutation-fixture": "Mutation fixture: `Flowstate Pro is HIPAA-compliant`.",
    "test-fixture": "Test fixture: \"Flowstate Pro is production-ready\".",
    "g0-negative-meaning": "This does not mean G0 has passed.",
    "wp1-negative-establishment": "This document does not establish that WP1.1 is authorized.",
    "g0-true-negative": "G0 is not approved.",
    "wp1-true-negative": "WP1.1 may not begin.",
    "false-g0-approval": "It is false that G0 is approved.",
    "disputed-wp1-start": "It is disputed that WP1.1 may start.",
    "not-established-g0-approval": "It has not been established that G0 is approved.",
    "no-evidence-g0-approval": "No evidence confirms that G0 is approved.",
    "unresolved-whether-g0-approved": "It is unresolved whether G0 is approved.",
    "question-whether-wp1-proceed": "The question whether WP1.1 may proceed remains unresolved.",
    "not-resolved-whether-g0-open": "We have not resolved whether G0 is open.",
    "legal-disclaimer": "It is not a legal opinion, certification, approval, or statement that Flowstate is compliant.",
    "conditional-approval": "If G0 is approved, WP1.1 may begin.",
    "conditional-passage": "When G0 has passed, WP1.1 can start.",
    "assuming-approval": "Assuming G0 is approved, WP1.1 may begin.",
    "provided-that-approval": "Provided that G0 is approved, WP1.1 can start.",
    "suffix-provided-that": "G0 is approved provided that qualified reviewers later approve it.",
    "suffix-after": "WP1.1 may commence after G0 passes.",
    "assume-g0": "Assume G0 is approved.",
    "imagine-wp1": "Imagine WP1.1 may begin.",
    "wrapped-provided-that": "Provided that G0 is approved, WP1.1 can\nstart.",
    "inline-assume-g0": "Assume `G0 is approved`.",
    "unresolved-question": "Whether WP1.1 may commence remains unresolved.",
    "g0-unresolved-whether": "It remains unresolved whether G0 is approved.",
    "wp1-open-question-whether": "The open question is whether WP1.1 may commence.",
    "g0-hypothetically": "Hypothetically, G0 is approved.",
    "wp1-hypothetical-inline": "Hypothetical: `WP1.1 can start`.",
    "direct-g0-question": "Is G0 approved?",
    "direct-wp1-question": "Is WP1.1 authorized?",
    "g0-is-it-true-question": "Is it true that G0 is approved?",
    "g0-confirm-whether-question": "Can reviewers confirm whether G0 is approved?",
    "wp1-know-whether-question": "Do we know whether WP1.1 may start?",
    "g0-inline-code-question": "Is `G0 approved`?",
    "g0-suffix-conditional": "G0 is approved if qualified reviewers later approve it.",
    "wp1-suffix-conditional": "WP1.1 may commence when G0 eventually passes.",
    "suppose-g0": "Suppose G0 is approved.",
}
for label, (sample, expected) in BAD_CLAIMS.items():
    found = {category for category, _ in semantic_findings(sample)}
    if expected not in found:
        fail("claim-mutation", f"bad phrase escaped: {label}")
for label, sample in ALLOWED_NEGATIVE_CLAIMS.items():
    if semantic_findings(sample):
        fail("claim-mutation", f"allowed context rejected: {label}")

INDEPENDENT_REJECT_MATRIX = {
    "target-first-g0-was-granted": ("G0 was granted clearance.", "g0-approved"),
    "target-first-g0-had-been-confirmed": ("`G0 had been confirmed authorization.`", "g0-approved"),
    "target-first-wp1-has-been-given": ("WP1.1 has been given\napproval.", "wp1-authorized"),
    "target-first-wp1-had-been-granted": ("WP1.1 had been granted clearance.", "wp1-authorized"),
    "double-negative-g0-not-not-authorized": ("G0 is not not authorized.", "g0-approved"),
    "double-negative-g0-not-unauthorized": ("G0 is not unauthorized.", "g0-approved"),
    "double-negative-wp1-can-not-not-start": ("WP1.1 can not not start.", "wp1-authorized"),
    "false-then-positive": ("It is false that G0 is approved. G0 is approved.", "g0-approved"),
    "disputed-but-positive": ("It is disputed that WP1.1 may start, but WP1.1 may start.", "wp1-authorized"),
    "not-established-and-positive": ("It has not been established that G0 is approved, and G0 is approved.", "g0-approved"),
    "no-evidence-then-positive": ("No evidence confirms that G0 is approved. G0 is approved.", "g0-approved"),
    "unresolved-but-positive": ("It is unresolved whether G0 is approved, but G0 is approved.", "g0-approved"),
    "question-then-positive": ("The question whether WP1.1 may proceed remains unresolved. WP1.1 may proceed.", "wp1-authorized"),
    "not-resolved-and-positive": ("We have not resolved whether G0 is open, and G0 is open.", "g0-approved"),
    "direct-question-then-positive": ("Is G0 approved? G0 is approved.", "g0-approved"),
    "g0-declarative-before-tag-question": ("G0 is approved, but is that acceptable?", "g0-approved"),
    "wp1-declarative-before-tag-question": ("WP1.1 may start, correct?", "wp1-authorized"),
    "g0-declarative-before-independent-question": ("G0 is approved, and what happens next?", "g0-approved"),
}
INDEPENDENT_ALLOW_MATRIX = {
    "true-negative-g0-approved": "G0 is not approved.",
    "true-negative-g0-authorized": "G0 is unauthorized.",
    "true-negative-wp1-begin": "WP1.1 may not begin.",
    "false-proposition": "It is false that G0 is approved.",
    "disputed-proposition": "It is disputed that WP1.1 may start.",
    "not-established-proposition": "It has not been established that G0 is approved.",
    "no-evidence-proposition": "No evidence confirms that G0 is approved.",
    "unresolved-whether-proposition": "It is unresolved whether G0 is approved.",
    "question-whether-proposition": "The question whether WP1.1 may proceed remains unresolved.",
    "not-resolved-whether-proposition": "We have not resolved whether G0 is open.",
    "direct-g0-question": "Is G0 approved?",
    "direct-wp1-question": "Is WP1.1 authorized?",
    "g0-is-it-true-question": "Is it true that G0 is approved?",
    "g0-confirm-whether-question": "Can reviewers confirm whether G0 is approved?",
    "wp1-know-whether-question": "Do we know whether WP1.1 may start?",
    "g0-inline-code-question": "Is `G0 approved`?",
}
for label, (sample, expected) in INDEPENDENT_REJECT_MATRIX.items():
    found = {category for category, _ in semantic_findings(sample)}
    if expected not in found:
        fail("independent-matrix", f"bad phrase escaped: {label}")
for label, sample in INDEPENDENT_ALLOW_MATRIX.items():
    if semantic_findings(sample):
        fail("independent-matrix", f"allowed context rejected: {label}")

BAD_STATUSES = {
    "compliant": "**Status:** `COMPLIANT`",
    "production-ready": "**Status:** `PRODUCTION_READY`",
    "profile-approved": "**Status:** `APPROVED_FOR_PROFILE`",
    "legally-reviewed": "**Status:** `LEGALLY_REVIEWED`",
    "evidence-complete": "**Status:** `EVIDENCE_COMPLETE`",
}
for label, sample in BAD_STATUSES.items():
    if not unsupported_status.search(sample):
        fail("status-mutation", label)
ALLOWED_STATUS_SAMPLE = "**Status:** SPECIFIED; G0 BLOCKED; WP1.x unauthorized"
if unsupported_status.search(ALLOWED_STATUS_SAMPLE):
    fail("status-mutation", "specified boundary rejected")

if os.environ.get("WP03_FOCUSED_PROBES") == "1":
    for label, (_, expected) in BAD_CLAIMS.items():
        print(f"reject claim {label}: pass -> {expected}")
    for label in ALLOWED_NEGATIVE_CLAIMS:
        print(f"allow context {label}: pass")
    for label, (_, expected) in INDEPENDENT_REJECT_MATRIX.items():
        print(f"reject matrix {label}: pass -> {expected}")
    for label in INDEPENDENT_ALLOW_MATRIX:
        print(f"allow matrix {label}: pass")
    for label in BAD_STATUSES:
        print(f"reject status {label}: pass")
    print("allow status specified-boundary: pass")
    print(f"WP0.3 FOCUSED MUTATION PROBES PASS: rejected_claims={len(BAD_CLAIMS)} allowed_contexts={len(ALLOWED_NEGATIVE_CLAIMS)} rejected_statuses={len(BAD_STATUSES)} allowed_statuses=1")
    print(f"WP0.3 INDEPENDENT SCANNER MATRIX PASS: rejected={len(INDEPENDENT_REJECT_MATRIX)} allowed={len(INDEPENDENT_ALLOW_MATRIX)} total={len(INDEPENDENT_REJECT_MATRIX) + len(INDEPENDENT_ALLOW_MATRIX)}")

def counsel_guard(sample):
    row = cells(sample)
    return bool(row and re.fullmatch(r"LEG-\d{2}", row[0]) and any(cell in {"COUNSEL_REVIEW_REQUIRED", "`COUNSEL_REVIEW_REQUIRED`"} for cell in row) and not any(re.fullmatch(r"`?(?:APPROVED|LEGALLY_REVIEWED|NOT_APPLICABLE|APPROVED_FOR_PROFILE)`?", cell) for cell in row))
if not counsel_guard("| LEG-05 | Purpose | Facts | Counsel | Deny | Evidence | Review | `COUNSEL_REVIEW_REQUIRED` |"):
    fail("counsel-mutation", "valid counsel row rejected")
for label, sample in {
    "approved": "| LEG-05 | Purpose | Facts | Counsel | Allow | Evidence | Review | `APPROVED` |",
    "legally-reviewed": "| LEG-05 | Purpose | Facts | Counsel | Allow | Evidence | Review | `LEGALLY_REVIEWED` |",
    "missing-status": "| LEG-05 | Purpose | Facts | Counsel | Deny | Evidence | Review | |",
}.items():
    if counsel_guard(sample):
        fail("counsel-mutation", f"bad counsel row escaped: {label}")

def blocker_guard(sample):
    row = cells(sample)
    return bool(row and re.fullmatch(r"WP03-B\d{2}", row[0]) and len(row) >= 6 and any(cell in {"BLOCKED", "`BLOCKED`"} for cell in row) and all(re.search(r"\w", cell) for cell in row[1:6]))
if not blocker_guard("| WP03-B01 | Profile | `BLOCKED` | Product + Counsel | Approved facts | G0 |"):
    fail("blocker-mutation", "valid blocker row rejected")
for label, sample in {
    "approved": "| WP03-B01 | Profile | `APPROVED` | Product + Counsel | Approved facts | G0 |",
    "missing-owner": "| WP03-B01 | Profile | `BLOCKED` | | Approved facts | G0 |",
    "missing-dependency": "| WP03-B01 | Profile | `BLOCKED` | Product + Counsel | | G0 |",
}.items():
    if blocker_guard(sample):
        fail("blocker-mutation", f"bad blocker row escaped: {label}")

# Relative Markdown links in all eight mutable files.
for path in WP03:
    for destination in re.findall(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", text(path)):
        target = destination.split("#", 1)[0].split("?", 1)[0].strip().strip("<>")
        if not target or re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I):
            continue
        if not (path.parent / target).resolve().exists():
            fail("broken-link", f"{path}: {target}")

# Secret, credential, personal/regulated payload patterns. Full content, including fences.
secret_patterns = {
    "private-key-header": re.compile("-----" + r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "aws-access-key": re.compile(r"\bA" + r"KIA[0-9A-Z]{16}\b"),
    "github-token": re.compile(r"\bgh" + r"[pousr]_[A-Za-z0-9]{20,}\b"),
    "stripe-live-secret": re.compile(r"\bsk" + r"_live_[A-Za-z0-9]{16,}\b"),
    "google-api-key": re.compile(r"\bAI" + r"za[0-9A-Za-z_-]{30,}\b"),
    "jwt": re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    "bearer-token": re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b", re.I),
    "credential-assignment": re.compile(r"\b(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*['\"][^'\"\n]{8,}['\"]", re.I),
    "database-url-with-credential": re.compile(r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s/:]+:[^\s/@]+@", re.I),
    "us-ssn": re.compile(r"(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)"),
    "canadian-sin": re.compile(r"(?<!\d)\d{3}[ -]\d{3}[ -]\d{3}(?!\d)"),
    "email-address": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "north-american-phone": re.compile(r"(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)"),
    "regulated-payload-assignment": re.compile(r"\b(?:patient[_ -]?name|customer[_ -]?name|member[_ -]?name|medical[_ -]?record[_ -]?(?:number|id)|mrn|date[_ -]?of[_ -]?birth|dob)\s*[:=]\s*['\"][^'\"\n]{2,}['\"]", re.I),
}
for path in WP03:
    body = text(path)
    for category, pattern in secret_patterns.items():
        if pattern.search(body):
            fail("secret-or-regulated-pattern", f"{path}: {category}")
    for candidate in re.findall(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)", body):
        if luhn(candidate):
            fail("secret-or-regulated-pattern", f"{path}: payment-card-number")
            break

# Whitespace and root diff validation.
diff = subprocess.run(["git", "diff", "--check"], text=True, capture_output=True)
if diff.returncode:
    fail("git-diff-check", diff.stdout.strip() or diff.stderr.strip() or f"exit {diff.returncode}")

if errors:
    print("WP0.3 VALIDATION FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)
print(f"WP0.3 VALIDATION PASS: legal_decisions={len(legal_rows)} controls={len(control_rows)} mappings={len(map_rows)} blockers={len(blocker_rows)}")
print(f"wp0.3_paths={len(WP03)} mutable_manifest=match self_hash=canonical inherited_paths={len(IMMUTABLE)} inherited_hashes=match scope=exact including_untracked")
print("counsel_values=preserved control_fields=complete cross_document_refs=pass links=pass metadata_rendering=pass")
print("review_records=specification_PASS quality_APPROVED human_acceptance=recorded WP0.3=COMPLETED WP0.4=AUTHORIZED_NOT_STARTED accountable_functions=complete legal_DRAFT=unapproved")
print("claim_status_counsel_blocker_mutations=pass inline_assertions=rejected labeled_examples=allowed secret_regulated_patterns=pass diff_check=pass G0=BLOCKED WP1=UNAUTHORIZED")
PY
```

The validator passing is technical documentation evidence only. It is not legal review, operational exercise, evidence completeness, vendor approval, production readiness, profile approval, or G0 approval.

## Additional validation and manual review

After the embedded validator passes:

1. Run `git diff --check` separately; expected output is empty and exit code 0.
2. Run `git status --short -uall`; verify it contains exactly the eight WP0.3 paths plus the 13 byte-identical inherited WP0.1/WP0.2 paths encoded by the validator.
3. Review the complete diff for all eight allowed paths. Confirm no allowed path contains unnecessary churn and no forbidden path changed.
4. Search the complete diff manually for permissive defaults, invented legal values, approved-vendor language, named-person fabrication, production/compliance overclaims, Standard/Pro blending, and G0/WP1 authorization drift.
5. Record the exact commands and real output in this packet's implementation record. A failed, skipped, stale, unavailable, or partially run check is not a pass.

Application build, test, lint, type, database, browser, infrastructure, and runtime commands are not required because this packet changes documentation only and forbids implementation/environment changes. Do not install dependencies or modify the environment merely to run unrelated application gates.

## Constraints

- Use Ponytail-full discipline: reuse existing structures, make the minimum documentation diff, and add no speculative framework, schema, generator, registry file, script, or dependency.
- Do not simplify away legal uncertainty, fail-closed behavior, control fields, evidence integrity, security/privacy boundaries, review routing, or mutation validation.
- Preserve exact identifiers and status vocabulary.
- Do not use current web research to refresh legal or competitor material.
- Do not put protected evidence bodies in Git; metadata/reference only.
- Do not claim an exercise, role assignment, contract, vendor review, risk analysis, penetration test, insurance review, counsel review, production configuration, or approval occurred without actual named evidence.
- Do not commit.

## Migration, rollback, and impact

- Application/schema/data migration: none.
- Backfill: none.
- Runtime concurrency behavior: unchanged; this packet only specifies future controls.
- Production data/credential/vendor/infrastructure impact: none.
- Production impact: none.
- Rollback: revert or explicitly supersede only the eight allowed documentation changes. Never alter inherited WP0.1/WP0.2 evidence to make rollback easier. Preserve approved history and record any corrected factual/legal-source conflict instead of erasing it.
- Failure impact: if the reconciliation or validator fails, keep WP0.3 open, G0 `BLOCKED`, and WP1.x unauthorized.

## Implementation record — 2026-09-23

### Outcome

The complete eight-path WP0.3 candidate is reconciled and accepted: 11 legal decisions, 35 controls, 11 canonical mappings, and five blockers pass the embedded validator with exact mutable-candidate identity, canonical packet self-hash, clean whitespace, exact scope including untracked files, and matching inherited hashes. Independent specification review is `PASS`, independent technical quality/security/evidence review is `APPROVED`, and project-owner acceptance is recorded for all six required WP0.3 review functions. WP0.3 is `COMPLETED`; WP0.4 is authorized but was not started. G0 remains `BLOCKED`; WP1.x is unauthorized.

### Exact eight-path current candidate

- `docs/compliance/flowstate-pro/legal-applicability-matrix.md` — 11 counsel-owned `LEG-*` decisions remain `COUNSEL_REVIEW_REQUIRED`.
- `docs/compliance/flowstate-pro/data-classification-and-flows.md` — `D0`–`D9`/`DX`, decision inputs, destinations, protected-evidence references, and fail-closed flows are reconciled.
- `docs/compliance/flowstate-pro/control-and-evidence-matrix.md` — exact 11-column table, all 35 stable controls, and all 11 canonical `MAP-*` rows are reconciled.
- `docs/compliance/flowstate-pro/operations-and-governance.md` — accountable functions, safeguards, procedures, exercises, cadence, and protected-evidence contracts are reconciled without claiming completion.
- `docs/compliance/flowstate-pro/competitor-parity-matrix.md` — dated benchmark-only treatment and control/profile boundaries are reconciled without refreshing sources.
- `docs/compliance/flowstate-pro/decision-register-and-open-items.md` — current reconciliation state, contradictions, five blockers, reviews, G0, and WP1 boundaries are recorded.
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` — technical reconciliation, independent reviews, human acceptance, WP0.3 completion, and WP0.4 authorization-not-started are recorded.
- `docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md` — the validator, focused mutations, exact evidence, and handoff state are durable here.

### Checks and exact output

Before human acceptance was recorded, the embedded validator was extracted from this packet and run verbatim from the repository root. Exit code: `0`.

```text
WP0.3 VALIDATION PASS: legal_decisions=11 controls=35 mappings=11 blockers=5
wp0.3_paths=8 mutable_manifest=match self_hash=canonical inherited_paths=13 inherited_hashes=match scope=exact including_untracked
counsel_values=preserved control_fields=complete cross_document_refs=pass links=pass metadata_rendering=pass
review_records=specification_PASS quality_APPROVED human_acceptance=outstanding accountable_functions=complete legal_DRAFT=unapproved
claim_status_counsel_blocker_mutations=pass inline_assertions=rejected labeled_examples=allowed secret_regulated_patterns=pass diff_check=pass G0=BLOCKED WP1=UNAUTHORIZED
```

Focused normal-run mutation probes returned exit code `0`:

```text
reject claim hipaa-compliant: pass -> compliance-claim
reject claim satisfies-pipeda: pass -> compliance-claim
reject claim production-ready: pass -> production-ready-claim
reject claim vendor-approved: pass -> vendor-approved-claim
reject claim evidence-complete: pass -> evidence-complete-claim
reject claim legally-reviewed: pass -> legal-review-claim
reject claim profile-approved: pass -> profile-approved-claim
reject claim g0-has-been-passed: pass -> g0-approved
reject claim g0-has-passed: pass -> g0-approved
reject claim g0-inline-has-passed: pass -> g0-approved
reject claim g0-pass: pass -> g0-approved
reject claim g0-inline-pass: pass -> g0-approved
reject claim g0-approved: pass -> g0-approved
reject claim g0-inline-approved: pass -> g0-approved
reject claim g0-authorized: pass -> g0-approved
reject claim g0-inline-authorized: pass -> g0-approved
reject claim g0-was-approved: pass -> g0-approved
reject claim g0-had-passed: pass -> g0-approved
reject claim g0-may-pass: pass -> g0-approved
reject claim g0-can-be-authorized: pass -> g0-approved
reject claim g0-is-now-approved: pass -> g0-approved
reject claim g0-inline-is-now-approved: pass -> g0-approved
reject claim g0-has-now-passed: pass -> g0-approved
reject claim g0-inline-has-now-passed: pass -> g0-approved
reject claim g0-is-cleared: pass -> g0-approved
reject claim g0-approval-granted: pass -> g0-approved
reject claim g0-approval-has-been-granted: pass -> g0-approved
reject claim g0-inline-approval-has-been-granted: pass -> g0-approved
reject claim g0-approval-for-has-been-granted: pass -> g0-approved
reject claim g0-approval-was-granted-for: pass -> g0-approved
reject claim g0-clearance-for-has-been-given: pass -> g0-approved
reject claim g0-inline-approval-for-has-been-granted: pass -> g0-approved
reject claim g0-wrapped-approval-for-has-been-granted: pass -> g0-approved
reject claim g0-was-granted-approval: pass -> g0-approved
reject claim g0-inline-was-granted-approval: pass -> g0-approved
reject claim g0-wrapped-was-granted-approval: pass -> g0-approved
reject claim g0-has-been-given-clearance: pass -> g0-approved
reject claim g0-inline-has-been-given-clearance: pass -> g0-approved
reject claim g0-wrapped-has-been-given-clearance: pass -> g0-approved
reject claim wp1-authorized: pass -> wp1-authorized
reject claim wp1-inline-authorized: pass -> wp1-authorized
reject claim wp1-approved: pass -> wp1-authorized
reject claim wp1-inline-approved: pass -> wp1-authorized
reject claim wp1-may-begin: pass -> wp1-authorized
reject claim wp1-inline-may-begin: pass -> wp1-authorized
reject claim wp1x-can-begin: pass -> wp1-authorized
reject claim wp1x-inline-can-begin: pass -> wp1-authorized
reject claim wp1-was-approved: pass -> wp1-authorized
reject claim wp1-has-been-approved: pass -> wp1-authorized
reject claim wp1-may-be-authorized: pass -> wp1-authorized
reject claim wp1-permitted-to-begin: pass -> wp1-authorized
reject claim wp1x-direct-authorized: pass -> wp1-authorized
reject claim wp1x-inline-authorized: pass -> wp1-authorized
reject claim wp1-bare-authorized: pass -> wp1-authorized
reject claim wp1-can-start: pass -> wp1-authorized
reject claim wp1-inline-can-start: pass -> wp1-authorized
reject claim wp1-may-commence: pass -> wp1-authorized
reject claim wp1-inline-may-commence: pass -> wp1-authorized
reject claim wp1-work-may-commence: pass -> wp1-authorized
reject claim wp1-implementation-can-proceed: pass -> wp1-authorized
reject claim wp1-is-cleared: pass -> wp1-authorized
reject claim wp1-authorization-granted: pass -> wp1-authorized
reject claim wp1-authorization-has-been-granted: pass -> wp1-authorized
reject claim wp1-inline-authorization-has-been-granted: pass -> wp1-authorized
reject claim wp1-authorization-for-has-been-granted: pass -> wp1-authorized
reject claim wp1-authorization-has-been-granted-for: pass -> wp1-authorized
reject claim wp1-inline-authorization-has-been-granted-for: pass -> wp1-authorized
reject claim wp1-wrapped-authorization-has-been-granted-for: pass -> wp1-authorized
reject claim wp1-was-granted-authorization: pass -> wp1-authorized
reject claim wp1-inline-was-granted-authorization: pass -> wp1-authorized
reject claim wp1-wrapped-was-granted-authorization: pass -> wp1-authorized
reject claim wp1-has-been-given-clearance: pass -> wp1-authorized
reject claim wp1-inline-has-been-given-clearance: pass -> wp1-authorized
reject claim wp1-wrapped-has-been-given-clearance: pass -> wp1-authorized
reject claim wp1-development-may-commence: pass -> wp1-authorized
reject claim wp1-inline-development-may-commence: pass -> wp1-authorized
reject claim inline-hipaa-compliant: pass -> compliance-claim
reject claim inline-production-ready: pass -> production-ready-claim
reject claim mixed-negative-positive-compliance: pass -> compliance-claim
reject claim colon-negative-positive-compliance: pass -> compliance-claim
reject claim unrelated-disclaimer-before-g0: pass -> g0-approved
reject claim unrelated-no-before-g0: pass -> g0-approved
reject claim no-reviewer-objected-before-g0: pass -> g0-approved
reject claim double-negative-g0: pass -> g0-approved
reject claim not-disputed-wp1: pass -> wp1-authorized
reject claim g0-not-not-approved: pass -> g0-approved
reject claim g0-not-unapproved: pass -> g0-approved
reject claim wp1-may-not-not-begin: pass -> wp1-authorized
reject claim not-the-case-g0-not-approved: pass -> g0-approved
reject claim negative-g0-before-wp1: pass -> wp1-authorized
reject claim prior-conditional-sentence-before-g0: pass -> g0-approved
reject claim conditional-and-independent-g0: pass -> g0-approved
reject claim conditional-but-independent-g0: pass -> g0-approved
reject claim hypothetical-but-independent-g0: pass -> g0-approved
reject claim assuming-and-independent-g0: pass -> g0-approved
reject claim provided-but-independent-wp1: pass -> wp1-authorized
reject claim assume-next-sentence-g0: pass -> g0-approved
reject claim imagine-but-independent-wp1: pass -> wp1-authorized
reject claim suffix-provided-and-independent-wp1: pass -> wp1-authorized
reject claim suffix-after-but-independent-g0: pass -> g0-approved
reject claim question-but-independent-wp1: pass -> wp1-authorized
reject claim unresolved-and-independent-g0: pass -> g0-approved
reject claim wrapped-g0-approved: pass -> g0-approved
reject claim wrapped-g0-approval-granted: pass -> g0-approved
reject claim wrapped-wp1-development: pass -> wp1-authorized
reject claim wrapped-wp1-authorization: pass -> wp1-authorized
reject claim wrapped-hipaa-compliant: pass -> compliance-claim
reject claim question-then-positive: pass -> g0-approved
reject claim wrapped-inline-g0-approved: pass -> g0-approved
reject claim g0-declarative-before-tag-question: pass -> g0-approved
reject claim wp1-declarative-before-tag-question: pass -> wp1-authorized
reject claim g0-declarative-before-independent-question: pass -> g0-approved
reject claim g0-has-been-open-plain: pass -> g0-approved
reject claim g0-has-been-open-inline: pass -> g0-approved
reject claim g0-has-been-open-wrapped: pass -> g0-approved
reject claim g0-had-been-open-plain: pass -> g0-approved
reject claim g0-had-been-open-inline: pass -> g0-approved
reject claim g0-had-been-open-wrapped: pass -> g0-approved
reject claim g0-has-now-been-open-plain: pass -> g0-approved
reject claim g0-has-now-been-open-inline: pass -> g0-approved
reject claim g0-has-now-been-open-wrapped: pass -> g0-approved
reject claim g0-had-now-been-open-plain: pass -> g0-approved
reject claim g0-had-now-been-open-inline: pass -> g0-approved
reject claim g0-had-now-been-open-wrapped: pass -> g0-approved
reject claim g0-is-granted-approval-plain: pass -> g0-approved
reject claim g0-is-granted-approval-inline: pass -> g0-approved
reject claim g0-is-granted-approval-wrapped: pass -> g0-approved
reject claim g0-is-given-clearance-plain: pass -> g0-approved
reject claim g0-is-given-clearance-inline: pass -> g0-approved
reject claim g0-is-given-clearance-wrapped: pass -> g0-approved
reject claim g0-is-confirmed-authorization-plain: pass -> g0-approved
reject claim g0-is-confirmed-authorization-inline: pass -> g0-approved
reject claim g0-is-confirmed-authorization-wrapped: pass -> g0-approved
reject claim wp1-is-granted-authorization-plain: pass -> wp1-authorized
reject claim wp1-is-granted-authorization-inline: pass -> wp1-authorized
reject claim wp1-is-granted-authorization-wrapped: pass -> wp1-authorized
reject claim wp1-is-given-clearance-plain: pass -> wp1-authorized
reject claim wp1-is-given-clearance-inline: pass -> wp1-authorized
reject claim wp1-is-given-clearance-wrapped: pass -> wp1-authorized
reject claim wp1-is-confirmed-approval-plain: pass -> wp1-authorized
reject claim wp1-is-confirmed-approval-inline: pass -> wp1-authorized
reject claim wp1-is-confirmed-approval-wrapped: pass -> wp1-authorized
reject claim g0-has-now-been-granted-approval-plain: pass -> g0-approved
reject claim g0-has-now-been-granted-approval-inline: pass -> g0-approved
reject claim g0-has-now-been-granted-approval-wrapped: pass -> g0-approved
reject claim wp1-had-now-been-given-clearance-plain: pass -> wp1-authorized
reject claim wp1-had-now-been-given-clearance-inline: pass -> wp1-authorized
reject claim wp1-had-now-been-given-clearance-wrapped: pass -> wp1-authorized
allow context direct-negative: pass
allow context production-boundary: pass
allow context vendor-boundary: pass
allow context evidence-legal-boundary: pass
allow context g0-wp1-boundary: pass
allow context full-form-negative: pass
allow context quoted-vocabulary: pass
allow context allowed-example: pass
allow context g0-passed-fixture: pass
allow context wp1-begin-example: pass
allow context mutation-fixture: pass
allow context test-fixture: pass
allow context g0-negative-meaning: pass
allow context wp1-negative-establishment: pass
allow context g0-true-negative: pass
allow context wp1-true-negative: pass
allow context false-g0-approval: pass
allow context disputed-wp1-start: pass
allow context not-established-g0-approval: pass
allow context no-evidence-g0-approval: pass
allow context unresolved-whether-g0-approved: pass
allow context question-whether-wp1-proceed: pass
allow context not-resolved-whether-g0-open: pass
allow context legal-disclaimer: pass
allow context conditional-approval: pass
allow context conditional-passage: pass
allow context assuming-approval: pass
allow context provided-that-approval: pass
allow context suffix-provided-that: pass
allow context suffix-after: pass
allow context assume-g0: pass
allow context imagine-wp1: pass
allow context wrapped-provided-that: pass
allow context inline-assume-g0: pass
allow context unresolved-question: pass
allow context g0-unresolved-whether: pass
allow context wp1-open-question-whether: pass
allow context g0-hypothetically: pass
allow context wp1-hypothetical-inline: pass
allow context direct-g0-question: pass
allow context direct-wp1-question: pass
allow context g0-is-it-true-question: pass
allow context g0-confirm-whether-question: pass
allow context wp1-know-whether-question: pass
allow context g0-inline-code-question: pass
allow context g0-suffix-conditional: pass
allow context wp1-suffix-conditional: pass
allow context suppose-g0: pass
reject matrix target-first-g0-was-granted: pass -> g0-approved
reject matrix target-first-g0-had-been-confirmed: pass -> g0-approved
reject matrix target-first-wp1-has-been-given: pass -> wp1-authorized
reject matrix target-first-wp1-had-been-granted: pass -> wp1-authorized
reject matrix double-negative-g0-not-not-authorized: pass -> g0-approved
reject matrix double-negative-g0-not-unauthorized: pass -> g0-approved
reject matrix double-negative-wp1-can-not-not-start: pass -> wp1-authorized
reject matrix false-then-positive: pass -> g0-approved
reject matrix disputed-but-positive: pass -> wp1-authorized
reject matrix not-established-and-positive: pass -> g0-approved
reject matrix no-evidence-then-positive: pass -> g0-approved
reject matrix unresolved-but-positive: pass -> g0-approved
reject matrix question-then-positive: pass -> wp1-authorized
reject matrix not-resolved-and-positive: pass -> g0-approved
reject matrix direct-question-then-positive: pass -> g0-approved
reject matrix g0-declarative-before-tag-question: pass -> g0-approved
reject matrix wp1-declarative-before-tag-question: pass -> wp1-authorized
reject matrix g0-declarative-before-independent-question: pass -> g0-approved
allow matrix true-negative-g0-approved: pass
allow matrix true-negative-g0-authorized: pass
allow matrix true-negative-wp1-begin: pass
allow matrix false-proposition: pass
allow matrix disputed-proposition: pass
allow matrix not-established-proposition: pass
allow matrix no-evidence-proposition: pass
allow matrix unresolved-whether-proposition: pass
allow matrix question-whether-proposition: pass
allow matrix not-resolved-whether-proposition: pass
allow matrix direct-g0-question: pass
allow matrix direct-wp1-question: pass
allow matrix g0-is-it-true-question: pass
allow matrix g0-confirm-whether-question: pass
allow matrix wp1-know-whether-question: pass
allow matrix g0-inline-code-question: pass
reject status compliant: pass
reject status production-ready: pass
reject status profile-approved: pass
reject status legally-reviewed: pass
reject status evidence-complete: pass
allow status specified-boundary: pass
WP0.3 FOCUSED MUTATION PROBES PASS: rejected_claims=148 allowed_contexts=48 rejected_statuses=5 allowed_statuses=1
WP0.3 INDEPENDENT SCANNER MATRIX PASS: rejected=18 allowed=16 total=34
WP0.3 VALIDATION PASS: legal_decisions=11 controls=35 mappings=11 blockers=5
wp0.3_paths=8 mutable_manifest=match self_hash=canonical inherited_paths=13 inherited_hashes=match scope=exact including_untracked
counsel_values=preserved control_fields=complete cross_document_refs=pass links=pass metadata_rendering=pass
review_records=specification_PASS quality_APPROVED human_acceptance=outstanding accountable_functions=complete legal_DRAFT=unapproved
claim_status_counsel_blocker_mutations=pass inline_assertions=rejected labeled_examples=allowed secret_regulated_patterns=pass diff_check=pass G0=BLOCKED WP1=UNAUTHORIZED
```

The recorded independent matrix exercised the validator's production logical-block scanner path for target-first passive grant order, direct double negatives versus true negatives, false/disputed/not-established/no-evidence forms, unresolved whether/question forms, proposition-local genuine questions versus preceding declarative claims, and later independent positive assertions after sentence boundaries or independent `and`/`but` clauses. Exit code: `0`.

```text
reject matrix target-first-g0-was-granted: pass -> g0-approved
reject matrix target-first-g0-had-been-confirmed: pass -> g0-approved
reject matrix target-first-wp1-has-been-given: pass -> wp1-authorized
reject matrix target-first-wp1-had-been-granted: pass -> wp1-authorized
reject matrix double-negative-g0-not-not-authorized: pass -> g0-approved
reject matrix double-negative-g0-not-unauthorized: pass -> g0-approved
reject matrix double-negative-wp1-can-not-not-start: pass -> wp1-authorized
reject matrix false-then-positive: pass -> g0-approved
reject matrix disputed-but-positive: pass -> wp1-authorized
reject matrix not-established-and-positive: pass -> g0-approved
reject matrix no-evidence-then-positive: pass -> g0-approved
reject matrix unresolved-but-positive: pass -> g0-approved
reject matrix question-then-positive: pass -> wp1-authorized
reject matrix not-resolved-and-positive: pass -> g0-approved
reject matrix direct-question-then-positive: pass -> g0-approved
reject matrix g0-declarative-before-tag-question: pass -> g0-approved
reject matrix wp1-declarative-before-tag-question: pass -> wp1-authorized
reject matrix g0-declarative-before-independent-question: pass -> g0-approved
allow matrix true-negative-g0-approved: pass
allow matrix true-negative-g0-authorized: pass
allow matrix true-negative-wp1-begin: pass
allow matrix false-proposition: pass
allow matrix disputed-proposition: pass
allow matrix not-established-proposition: pass
allow matrix no-evidence-proposition: pass
allow matrix unresolved-whether-proposition: pass
allow matrix question-whether-proposition: pass
allow matrix not-resolved-whether-proposition: pass
allow matrix direct-g0-question: pass
allow matrix direct-wp1-question: pass
allow matrix g0-is-it-true-question: pass
allow matrix g0-confirm-whether-question: pass
allow matrix wp1-know-whether-question: pass
allow matrix g0-inline-code-question: pass
WP0.3 INDEPENDENT SCANNER MATRIX PASS: rejected=18 allowed=16 total=34
```

A separate stdlib-only direct probe imported the extracted validator definitions, called the same `semantic_findings()` logical-block scanner, and verified all seven required sentences plus the nearby proposition-question matrix. It then reran every declared reject, allow, and independent-matrix regression through that same scanner path. Exit code: `0`.

```text
required allow is-it-true-g0: pass
required allow confirm-whether-g0: pass
required allow know-whether-wp1: pass
required allow inline-code-g0: pass
required reject g0-declarative-tag: pass -> g0-approved
required reject wp1-declarative-tag: pass -> wp1-authorized
required reject g0-declarative-independent-question: pass -> g0-approved
nearby allow direct-g0: pass
nearby allow direct-wp1: pass
nearby allow embedded-true: pass
nearby allow embedded-confirm-whether: pass
nearby allow embedded-know-whether: pass
nearby allow inline-code: pass
nearby reject declarative-tag-but: pass -> g0-approved
nearby reject declarative-tag-correct: pass -> wp1-authorized
nearby reject declarative-independent-question: pass -> g0-approved
nearby reject preceding-question-later-assertion: pass -> g0-approved
required_question_cases=7/7
nearby_question_matrix=10/10
declared_regressions=rejected_claims:148/148 allowed_contexts:48/48 independent_matrix:34/34
```

A direct perfect-tense probe called the same `semantic_findings()` logical-block scanner for all four `open` sentences in plain, inline-code, and ordinary wrapped rendering. Exit code: `0`.

```text
direct reject has-been-open-plain: pass -> g0-approved
direct reject has-been-open-inline: pass -> g0-approved
direct reject has-been-open-wrapped: pass -> g0-approved
direct reject had-been-open-plain: pass -> g0-approved
direct reject had-been-open-inline: pass -> g0-approved
direct reject had-been-open-wrapped: pass -> g0-approved
direct reject has-now-been-open-plain: pass -> g0-approved
direct reject has-now-been-open-inline: pass -> g0-approved
direct reject has-now-been-open-wrapped: pass -> g0-approved
direct reject had-now-been-open-plain: pass -> g0-approved
direct reject had-now-been-open-inline: pass -> g0-approved
direct reject had-now-been-open-wrapped: pass -> g0-approved
perfect_open_direct=12/12
```

The bounded perfect-tense regression matrix covered `has|had`, optional `now`, `approved|passed|open|opened|authorized|cleared`, and plain/inline/wrapped assertions through the production logical-block path. Its nonassertive side covered the corresponding plain negative, question, and conditional forms. Before this correction only the 12 rendered `open` assertions bypassed; after correction the rerun returned exit code `0` with no bypasses and no false positives.

```text
perfect_open_regression_matrix: rejects=72 bypasses=0 allows=72 false_positives=0 total=144
```

The final independent quality review also exercised the bounded present/past/perfect/optional-now grammar matrix through the same production scanner path: `144` assertions rejected with `0` bypasses and `192` nonassertive cases allowed with `0` false positives. All recorded transcripts were exact. The review returned `APPROVED` on 2026-09-23 with no critical, important, or minor issues.

A stale-identity probe temporarily changed one ASCII byte in `legal-applicability-matrix.md` without changing file length, ran the embedded validator unchanged, and restored the exact original bytes. The probe returned exit code `1` with the expected isolated identity failure:

```text
WP0.3 VALIDATION FAIL
- mutable-identity: docs/compliance/flowstate-pro/legal-applicability-matrix.md
```

After restoration, an independent SHA-256 recomputation verified all eight mutable manifest entries, including the packet's canonical normalized self-hash, and all 13 inherited hashes: `mutable_hashes=8/8 match; inherited_hashes=13/13 match`.

Separate `git diff --check` returned exit code `0` and no diff-check output.

Exact status scope is 21 paths: eight WP0.3 paths and 13 inherited WP0.1/WP0.2 paths, including untracked files.

```text
 M docs/compliance/flowstate-pro/competitor-parity-matrix.md
 M docs/compliance/flowstate-pro/control-and-evidence-matrix.md
 M docs/compliance/flowstate-pro/data-classification-and-flows.md
 M docs/compliance/flowstate-pro/decision-register-and-open-items.md
 M docs/compliance/flowstate-pro/legal-applicability-matrix.md
 M docs/compliance/flowstate-pro/operations-and-governance.md
 M docs/compliance/flowstate-pro/product-requirements-document.md
 M docs/compliance/flowstate-pro/product-spec.md
 M docs/compliance/flowstate-pro/roadmap.md
 M docs/compliance/flowstate-pro/security-privacy-architecture.md
 M docs/compliance/flowstate-pro/system-design.md
 M docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md
?? docs/compliance/flowstate-pro/current-standard-baseline.md
?? docs/compliance/flowstate-pro/evidence/README.md
?? docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/candidate-manifest.txt
?? docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/prisma-inventory.txt
?? docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/root-command-results.txt
?? docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/snapshot-and-toolchain.txt
?? docs/compliance/flowstate-pro/work-packets/WP0.1-freeze-evidence-and-boundaries.md
?? docs/compliance/flowstate-pro/work-packets/WP0.2-author-product-and-architecture-specifications.md
?? docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md
```

All 13 inherited paths match the SHA-256 values embedded in the validator. The complete diff for all eight WP0.3 paths was reviewed; no forbidden path, invented legal/vendor/customer/commercial/production value, named-person fabrication, Standard/Pro blending, permissive default, unsupported claim, or G0/WP1 authorization drift was found.

### Reconciliation, review, migration, and gate state

- Reconciliation counts: `legal_decisions=11`, `controls=35`, `mappings=11`, `blockers=5`.
- Blockers: `WP03-B01`–`WP03-B05` remain `BLOCKED` under their recorded owners and dependencies.
- Independent specification review: `PASS` on 2026-09-23 for `WP0.3-MUTABLE-MANIFEST-V1`.
- Independent technical quality/security/evidence review: `APPROVED` on 2026-09-23 for `WP0.3-MUTABLE-MANIFEST-V1`, with no critical, important, or minor issues. Review evidence includes exact transcripts; perfect-tense open 12/12 rejected; declared regressions 148/148 rejected, 48/48 allowed, and independent matrix 34/34; perfect-tense matrix 72 rejected/0 bypasses and 72 allowed/0 false positives; bounded present/past/perfect/optional-now matrix 144 rejected/0 bypasses and 192 allowed/0 false positives; stale-identity expected failure, exact restore, and post-restore pass; mutable 8/8, inherited 13/13, exact 21-path scope including untracked, and `git diff --check` exit 0. The canonical packet self-hash before recording approval was `99e9b81acfd376dcf1857d31b78450a79a19010029b4eab3e7bea3dd45c3f2a6`.
- Required human acceptance: recorded by explicit project-owner authorization on 2026-09-23 for Product, Architecture, Database, Security/Privacy, Operations/QA, and legal/counsel, for the exact pre-recording candidate whose packet canonical self-hash was `9bf74694d580ff123fca2033ecaa0bf1d25fa26c0839a7399766c61178c6d04a`.
- Migration: none. Backfill: none. Production impact: none. Rollback is documentation revert or explicit supersession within the allowed paths.
- WP0.3 completion: `COMPLETED` on 2026-09-23.
- Next packet: `WP0.4 — Establish change control and dossier validators` is authorized but was not started, drafted, injected, or executed in this task.
- G0 remains `BLOCKED`; WP1.x is unauthorized.

### Human-acceptance closure validation

After recording project-owner acceptance, WP0.3 completion, and WP0.4 authorization-not-started, the acceptance-aware embedded validator returned exit code `0`:

```text
WP0.3 VALIDATION PASS: legal_decisions=11 controls=35 mappings=11 blockers=5
wp0.3_paths=8 mutable_manifest=match self_hash=canonical inherited_paths=13 inherited_hashes=match scope=exact including_untracked
counsel_values=preserved control_fields=complete cross_document_refs=pass links=pass metadata_rendering=pass
review_records=specification_PASS quality_APPROVED human_acceptance=recorded WP0.3=COMPLETED WP0.4=AUTHORIZED_NOT_STARTED accountable_functions=complete legal_DRAFT=unapproved
claim_status_counsel_blocker_mutations=pass inline_assertions=rejected labeled_examples=allowed secret_regulated_patterns=pass diff_check=pass G0=BLOCKED WP1=UNAUTHORIZED
```

The final verification sequence regenerates all eight mutable hashes and the canonical packet self-hash, reruns this validator, performs the stale mutable-identity mutation with exact byte restoration, reruns the validator after restoration, verifies all 13 inherited hashes and exact 21-path scope including untracked files, and runs separate `git diff --check`.

## Implementation handoff

End implementation with exactly these sections:

1. **Outcome** — concise human result and why it matters; no compliance or production claim.
2. **Exact files changed** — list all and only the eight allowed paths, with one-line purpose per path.
3. **Checks and exact output** — embedded validator, separate `git diff --check`, `git status --short -uall`, and complete-diff review; include real exit/results.
4. **Reconciliation results** — counts for `LEG-*`, control IDs, `MAP-*`, and `WP03-B*`; contradictions resolved or recorded; no invented values.
5. **Blockers** — exact unresolved legal, customer-profile, vendor/agreement/transfer, commercial/production/insurance/claims, accountable-human/evidence/exercise/assessor blockers with owners and dependencies.
6. **Reviews** — independent specification result, independent quality result, and each required human review as accepted or outstanding. Do not infer acceptance.
7. **Migration/rollback/production impact** — migration none, backfill none, production impact none, documentation rollback/supersession path.
8. **Gate and next packet** — G0 remains `BLOCKED`; WP1.x unauthorized. The next authorized packet may be `WP0.4 — Establish change control and dossier validators` only after independent specification review is `PASS`, independent quality review is `APPROVED`, all required WP0.3 human review acceptance is recorded, and the project owner explicitly authorizes WP0.4. Otherwise report `BLOCKED`.

## Ponytail mode

PONYTAIL MODE ACTIVE — level: full.

Reuse the five existing specifications, decision register, plan, and this packet. Do not add files, schemas, tools, or abstractions. The embedded validator is required in this file because WP0.3 explicitly requires one durable check; do not extract it into a new script. The smallest correct reconciliation wins only after every legal boundary, blocker, control field, mapping, review, and validation requirement above is satisfied.
