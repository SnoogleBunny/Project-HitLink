# Flowstate Pro implementation roadmap and execution ledger

**Baseline:** [PR #3](https://github.com/SnoogleBunny/Project-HitLink/pull/3), `hipaa-integration` at `5b1b84b103a0cea9a521d5857c0b49fdeb710473`. Keep the packet numbering and scope in the [approved decision baseline](../compliance/flowstate-pro/decision-register-and-open-items.md), [implementation plan](2026-08-10-hipaa-canada-compliance-implementation-plan.md), [directive](../HIPAA_Canada_Compliance_Agent_Directive.md), and [gated roadmap](../compliance/flowstate-pro/roadmap.md).

**Execution:** The ledger, WP0.4 candidate, and earlier packet records live in the existing isolated `feat/flowstate-pro-implementation` worktree. Independent, authorized tasks use parallel subagents. Dependent implementation follows the packet gates. Reuse its existing artifacts. Any change to a governed review input requires a new candidate identity and renewed review. Use synthetic data and keep Pro separate from Standard. Keep legal values, vendors, credentials, deployments, and releases behind their documented human gates.

**Checkboxes:** Started includes existing implementation or evidence. Complete requires the packet's verification and approvals. A recorded historical acceptance applies only to its identified candidate.

## Phase 0 checklist

| Packet | Depends on | Files and outcome | Verification or outstanding approval | Started | Complete |
| --- | --- | --- | --- | --- | --- |
| WP0.1 Standard baseline | PR base | `current-standard-baseline.md`, `evidence/wp0.1-standard-baseline/` in dossier | Baseline evidence was independently reconciled. Owner accepted the published baseline and its known Playwright tooling failure for use in this packet. | [x] | [x] |
| WP0.2 Product and architecture | WP0.1 evidence | Dossier `product-spec.md`, PRD, roadmap, system and security designs | Retained register records exact-candidate technical verification and owner acceptance on 2026-09-22. | [x] | [x] |
| WP0.3 Legal, data, control and operations specifications | WP0.2 | Dossier legal, data, control, operations and competitor matrices | Retained register records specification and quality reviews and owner acceptance on 2026-09-23. Legal decisions remain open. | [x] | [x] |
| WP0.4 Change control and dossier validation | WP0.3 | Dossier schemas, manifest and register, `scripts/pro-compliance/validate-dossier.mjs`, `tests/tooling/pro-compliance-dossier.test.mjs`, root scripts | Validator, all 75 integration tests and both independent reviews passed for the pinned candidate. Alvin Lo’s dated project-owner acceptance completed Gate 3. | [x] | [x] |
| WP0.5 Gate G0 | WP0.4 complete; owner authorization recorded | Owner authorized synthetic WP1.1 only | Technical preflight and risk input reviewed. Five unresolved blockers remain tracked for dependent work. | [x] | [x] |

## Implementation checklist after G0

Open items below follow the packet approvals. Paths, interfaces, test commands and reviewers for each packet are governed by the linked plan and must be pinned before editing. Verify real consumer paths against synthetic fixtures and disposable PostgreSQL where applicable. Preserve tenant isolation, audit history, finalized clinical records and legal holds during rollback.

### G1 · Isolated Pro foundation

- [x] WP1.1 Add boundary tests for Standard/Pro imports and Pro web/API separation.
- [x] WP1.2 Build isolated provider web, patient web and API shells and validate origins, sessions and environment separation.
- [x] WP1.3 Create Pro-only Prisma schema, composite tenant integrity and RLS. Verify fresh and upgrade migrations and tenant-scoped transactions.
- [ ] WP1.4 Add synthetic fixture and artifact controls. Verify PHI-free outputs and separation from production.
- [ ] WP1.5 Provision the approved US non-production topology with repeatable IaC and regional, IAM, storage, backup, log and key read-back.
- [ ] WP1.6 Close G1 with exact-candidate architecture, CI, origin and database isolation evidence.

### G2 · Identity and control plane

- [ ] WP2.1 Integrate approved identity, invitations, MFA, recovery and sessions, including Flowstate workforce and JIT support.
- [ ] WP2.2 Verify organizations and enforce versioned, fail-closed profile and module activation.
- [ ] WP2.3 Resolve approved policy centrally and enforce tenant, actor, purpose, authority and patient scope.
- [ ] WP2.4 Persist append-only audit and durable correlated operation intent and outcome. Verify audit outage behavior and PHI-free logs.
- [ ] WP2.5 Implement transactional outbox and destination gating. Verify agreement, regional, retry, lease and reconciliation behavior.
- [ ] WP2.6 Implement versioned file storage, scan, quarantine, encryption and controlled downloads.
- [ ] WP2.7 Establish workforce, access review, sanctions, training, support, evidence and incident procedures.
- [ ] WP2.8 Close G2 using negative control and failure tests plus accountable-owner evidence.

### G3 · Virginia clinical and patient journey

- [ ] WP3.1 Implement patient demographics, contacts and scoped, revocable representative authority.
- [ ] WP3.2 Implement scheduling, intake, versioned consent and forms.
- [ ] WP3.3 Implement longitudinal chart and encounter timeline with provenance.
- [ ] WP3.4 Implement drafts, immutable final notes, linked amendments and late entries.
- [ ] WP3.5 Implement controlled clinical-file journeys, versioning, release and revocation.
- [ ] WP3.6 Implement the approved minimum medication, allergy and clinical history workflows.
- [ ] WP3.7 Implement approved direct pay, separate Pro Stripe and eligibility boundaries.
- [ ] WP3.8 Implement patient self-service, release controls and secure sharing.
- [ ] WP3.9 Implement rights, disclosure accounting, retention, holds and report-only disposition, and offboarding/export.
- [ ] WP3.10 Implement audit review and human-led incident workflow and operational dashboards.
- [ ] WP3.11 Close G3 by exercising the full synthetic provider/patient journey, including migration if required for the first profile, negative cases and accessibility.

### P1–P7 · Virginia assurance, pilot and expansion

- [ ] P1 Approve the exact customer, legal applicability, data flows, responsibility matrix, vendors, signed agreements and operating envelope.
- [ ] P2 Freeze source, image, schema, configurations, SBOM and promotion evidence. Run regression, security, accessibility, migration and capacity checks.
- [ ] P3 Read back infrastructure boundaries. Exercise synthetic backup/restore, failover, key recovery and rollback.
- [ ] P4 Obtain security risk analysis, independent assessment, remediation acceptance, and exact legal/privacy, transfer and policy review.
- [ ] P5 Name and train accountable personnel. Exercise access, workforce, support, continuity, incident and outage procedures. Close findings and insurance review.
- [ ] P6 Verify organization/admin activation, staging, support and continuity for the named profile.
- [ ] P7 Record named sign-offs, exact claims wording and separate production authorization.
- [ ] Conduct the separately authorized Virginia pilot and verify operating evidence, rollback and suspension.
- [ ] Repeat profile gates for each specialty/customer expansion.

### G4 · British Columbia private-clinic lane

- [ ] WP4.1 Provision Canada non-production/staging only through its approved packet and verify regional read-back.
- [ ] WP4.2 Implement the separately approved BC private-clinic profile with counsel-owned policy inputs.
- [ ] WP4.3 Validate Canadian identity, support, vendor, residency and transfer paths.
- [ ] WP4.4 Exercise Canada restore/failover, rights and incident workflows.
- [ ] WP4.5 Close G4 and repeat P1–P7 for the exact BC profile before separately authorized activation.

### Later modules · Individually gated

- [ ] Secure messaging and notifications.
- [ ] Telehealth.
- [ ] E-prescribing and pharmacy integration.
- [ ] Labs and referrals.
- [ ] Imaging, PACS/RIS and DICOM.
- [ ] Claims, clearinghouse and broader payer workflows.
- [ ] Standards APIs and gateway.
- [ ] Governed external clinical-system migration.
- [ ] Multi-location organizations.
- [ ] Native mobile apps.
- [ ] Clinical AI.
- [ ] Additional specialty, public-sector, health-authority, insurer, government-contract and dedicated-tenant profiles.

## Outstanding human inputs

| Register | Accountable owners | Required evidence |
| --- | --- | --- |
| WP03-B01 · Customer and profile | Product, Privacy, qualified counsel | Verified applicant facts, customer classification, specialty, scope, use case, responsibility and operating envelope |
| WP03-B02 · Legal and policy | Applicable Virginia/BC counsel, Privacy, customer record authority | Versioned applicability, purpose/authority, consent/authorization, representative authority, rights, retention, holds, disclosure, transfer, custody and breach/notification determinations |
| WP03-B03 · Vendors and agreements | Procurement, Privacy/Security | Approved CIAM and data-touching services, exact service configuration and region, support and subprocessors, transfer review, retention/deletion and executed customer/cloud/subprocessor agreements |
| WP03-B04 · Commercial, risk and claims | Executive risk, Product/Commercial, Legal/Security/Operations | Pricing, support/SLA/credits, insurance, signed risk decisions, release authority and exact approved claims |
| WP03-B05 · People and operating evidence | Executive risk, Security/Privacy, Operations, QA/Assurance | Named Security Official, Privacy, incident, on-call and independent approvers, protected evidence system, training and exercises, assessor and remediation records |

## Execution record

- [x] Reconciled checked-out PR identity with the published commits and identified the retained work packets.
- [x] Mapped each plan packet, production gate and deferred module into the checklist.
- [x] Recounted 65 Standard Prisma models, 48 enums and 16 migrations. Standard bootstrap tooling reproduced the pre-existing Playwright orchestration assertion failure (8 passed, 1 failed in the installed worktree). The PR checkout also lacks installed dependencies.
- [x] Independently reviewed the recovered WP0.4 candidate. Specification review failed because the schema and CLI allowed unrelated Markdown to enter the Pro dossier.
- [x] Repaired WP0.4 in the existing isolated worktree. Updated the dossier document schema, validator, integration test, decision register, primary implementation plan and WP0.4 packet. The allowed scope is the Pro dossier subtree and the existing implementation plan. The CLI applies the same rule to the resolved Markdown path before reading it.
- [x] Observed the new synthetic registration regression fail before the fix. After the fix, all four focused path/containment tests passed on Node 22 and direct dossier validation reported 18 documents, one record and 22 files.
- [x] Moved an existing unreadable-path fixture into the Pro dossier after the scope fix so it still reaches the tooling-error and redaction assertions. The two affected focused tests passed.
- [x] Full WP0.4 suite passed on the pinned candidate. Node 22.23.1 ran `node --test tests/tooling/pro-compliance-dossier.test.mjs` with 75 passed and zero failures. Direct validator and `git diff --check` exited 0. All 35 input hashes matched before and after execution.
- [x] Fresh independent specification review passed on the pinned candidate. All 35 input hashes matched, and the packet scope, local links, JSON, whitespace and diff checks passed.
- [x] Independent quality/security/evidence review approved the pinned candidate subject to a green full Node 22 suite. The 75/75 run satisfied that condition.
- [x] Consolidated the roadmap and WP0.4 candidate on `feat/flowstate-pro-implementation`. Candidate hashes matched before moving the ledger.
- [x] Record Alvin Lo’s project-owner acceptance of the exact WP0.4 candidate and separate authorization to open WP0.5.

**Repaired candidate:** `feat/flowstate-pro-implementation` at base `5b1b84b103a0cea9a521d5857c0b49fdeb710473`. The 35-input manifest SHA-256 is `b9798e3307214ba4e46eaba42ad9284793208145ec6e0e46481f71566023a541`. The manifest is retained below. Governed inputs were frozen for the exact-candidate checks. The independent review outcomes are recorded here to preserve the reviewed candidate bytes.

## Branch publication

- [x] Created separate local commits and pushed the Standard baseline evidence (`76f33ea`), Product and Architecture specifications (`65ddfb2`), and legal, data, control and operations specifications (`076ea34`) to `origin/feat/flowstate-pro-implementation`.
- [x] Revalidated the WP0.4 publication inputs against the 35-file reviewed manifest. Direct validation and the three focused integration checks passed. The earlier 75/75 run applies to the identical governed bytes.

The validator and this ledger are grouped in the WP0.4 technical checkpoint commit. The manifest records the source candidate's base and file bytes. The owner decision is recorded below. The G0 exit decision remains open.

## Current approval checklist

- [x] Prepare unsigned reviewer forms for WP0.1, WP0.4 and the separate WP0.5 authorization.
- [x] Record project-owner and HIPAA compliance approval of the WP0.1 baseline evidence.
- [x] Record the project owner’s full WP0.1 disposition for use in the synthetic packet. The retained Playwright tooling result is a failure.
- [x] Record dated project-owner acceptance of the pinned WP0.4 candidate.
- [x] Reconcile WP0.4 Gate 3 with the packet. The recorded unqualified project-owner acceptance covers the packet’s six review functions. Legal/counsel scope is limited to validator approval metadata.
- [x] Record explicit project-owner authorization to open WP0.5 for G0 review.
- [x] Record the project owner’s G0 authorization for the narrowed synthetic WP1.1 scope.

### Named owner decisions · 2026-11-20

| Decision | Approver and function | Scope and evidence |
| --- | --- | --- |
| WP0.4 candidate accepted | Alvin Lo, project owner and HIPAA compliance officer | Explicit, unqualified project-owner acceptance in the project conversation. Gate 3 assigns acceptance of its six functional scopes to the project owner. This follows the [WP0.3 acceptance precedent](../compliance/flowstate-pro/decision-register-and-open-items.md#review-and-authorization-state). Commit `c1fcdddb405c9022115df786021bda07ef6bb51a` and 35-input manifest SHA-256 `b9798e3307214ba4e46eaba42ad9284793208145ec6e0e46481f71566023a541`. |
| WP0.5 review authorized | Alvin Lo, project owner | Explicit authorization in the project conversation to open WP0.5 for G0 review. |
| WP1.1 scope endorsed for G0 review | Alvin Lo, project owner and HIPAA compliance officer | Scope approval in the project conversation. Synthetic import-boundary tests for Standard–Pro and Pro web/API, the boundary record, and minimum manifests for the approved dependency graph. |

### Owner and compliance decisions · 2026-11-21

| Decision | Reviewer | Recorded scope |
| --- | --- | --- |
| WP0.1 baseline evidence accepted | Alvin Lo, project owner and HIPAA compliance officer | Approved the baseline decisions in the project conversation. The baseline remains usable as evidence with the known Standard Playwright tooling failure disclosed. |
| G0 scope approved within stated remits | Alvin Lo, project owner and HIPAA compliance officer | Approved G0 scope in the project conversation. The scope is the synthetic WP1.1 packet recorded above. |
| Draft GOV-04 risk analysis reviewed and approved within stated remits | Alvin Lo, project owner and HIPAA compliance officer | Approved the draft technical risk analysis below. Treatment verification and the separate residual-risk decision remain open. |

For the remaining decisions, the [role register requirements](../compliance/flowstate-pro/operations-and-governance.md#2-accountability-authority-and-coverage) permit compatible functions to share a reviewer when their authority and conflict controls are recorded. The remaining review items below track functions and evidence.

### WP0.5 · G0 review intake

**Status** — Owner decision recorded for synthetic WP1.1 only. All later packets require their own authorization.

| Review item | Decision or evidence still needed |
| --- | --- |
| WP0.1 evidence | Owner accepted the baseline with its documented Playwright tooling failure for this synthetic packet. |
| Narrow WP1.1 scope | Owner resolved the scope review and authorized the packet under his stated approval and appointment authority. |
| WP03-B01–B05 timing | The [decision register](../compliance/flowstate-pro/decision-register-and-open-items.md#mandatory-blockers) lists review timing before G0 for five blockers. The [G0 plan](2026-08-10-hipaa-canada-compliance-implementation-plan.md#wp05--g0-review) retains unresolved dependencies as blockers and authorizes only Milestone 1 packets whose dependencies are satisfied. The owner authorized synthetic WP1.1 on the basis of the technical mapping below. All five blockers remain open for dependent work. |
| G0 exit | Decision and authorized WP1.1 scope are recorded below. |

#### WP0.5 technical review results

- [x] Map each open WP03 blocker to the proposed synthetic WP1.1 scope and to dependent work.
- [x] Check the workspace layout, test entry points, and proposed file scope for WP1.1.
- [x] Recheck the existing Standard tooling failure. The focused test still fails at the assertion requiring the old Turbo wrapper. The Playwright configuration starts individual workspaces. Standard owner disposition remains open.

The two technical reviews below are inputs to G0. The implementation plan and decision register retain their earlier candidate status as reviewed evidence. The dated decisions in this ledger record subsequent progress.

| Open blocker | WP1.1 technical review | Dependent work or G0 decision |
| --- | --- | --- |
| WP03-B01 · Customer and profile | Synthetic import fixtures require no applicant or customer profile. | Profile activation and P1 need verified applicant and scope information. |
| WP03-B02 · Legal and policy | Import checks require no legal values, policy registration, or authority defaults. | Record applicable counsel review for G0. Activation and policy resolution require approved policy and authority inputs. |
| WP03-B03 · Vendors and agreements | Synthetic prohibited-import cases require no SDK installation, vendor choice, or live account. | US non-production provisioning and external patient identity integration require their approved services, configurations, and agreements. |
| WP03-B04 · Commercial, risk and claims | Import checks require no pricing, claims, insurance, or production inputs. | Customer activation needs the operating envelope. Operational, release, and claims gates carry the remaining decisions. |
| WP03-B05 · People and operating evidence | The import checks require no production exercise. Named decision-makers and exact-candidate evidence remain G0 dependencies. | Record the required risk analysis under GOV-04 and the applicability of appointment, protected-evidence, and operational controls. |

All five blockers remain open for dependent work. The owner’s narrow decision applies to the synthetic dependency check described below.

#### WP1.1 engineering readiness

- The repository currently has four Standard app manifests and seven shared or Standard package manifests. It has no Pro workspace manifests or tracked CI workflow. The workspace already discovers `apps/*` and `packages/*`.
- The plan names `tests/tooling/pro-product-boundaries.test.mjs` and `docs/compliance/flowstate-pro/architecture-boundaries.md`. The direct verification entry point would be `node --test tests/tooling/pro-product-boundaries.test.mjs`. The current root test commands do not target that file.
- The proposed minimal graph has private manifests for `apps/pro-provider-web`, `apps/pro-patient-web`, `apps/pro-api`, and `packages/pro-db`. The API may declare a Pro DB workspace dependency. Provider and patient web reach the API over HTTP. The packet needs no shared runtime allowlist.
- Record whether the approved packet should add the root test script and workspace lockfile importers. Registering real workspace manifests requires lockfile entries to keep frozen installation reproducible. A fixture-only packet can use the direct Node test until a later packet registers real workspaces.

#### GOV-04 · Draft risk analysis for synthetic WP1.1

- [x] Prepare technical risk input for the owner-endorsed synthetic WP1.1 scope at preflight commit `b82038a`.
- [x] Record Alvin Lo’s owner and HIPAA compliance approval of the draft risk analysis.
- [ ] Complete named GOV-04 review coverage, confirm treatment owners, and record the residual-risk decision and evidence reference.

The scope is import-boundary tooling, the boundary record, and minimal private manifests. Ratings are provisional estimates before treatment. The review covers repository tooling with synthetic inputs. It does not assess a deployed service or a Virginia or BC profile. [GOV-04 control](../compliance/flowstate-pro/control-and-evidence-matrix.md)

| Risk | Likelihood / impact | Proposed treatment and evidence | Proposed owner |
| --- | --- | --- | --- |
| A dependency crosses the Standard–Pro boundary or introduces data-bearing shared runtime code. | Possible / high | Verify allow and deny fixtures against the approved graph. Check manifest dependencies and the supported source import forms. | Architecture/Backend with Database and QA review |
| Provider or patient web reaches persistence, policy internals, or a vendor SDK directly. | Possible / high | Verify both web apps with synthetic fixtures. Confirm the API-to-Pro-DB graph and HTTP boundary in the architecture record. | Architecture/Backend with Security and QA review |
| Workspace registration breaks frozen installation or the test command fails to exercise the checker. | Possible / moderate | Verify the direct Node command and its focused root script if approved. Run frozen installation if real manifests are registered. Record Standard baseline results separately. | Engineering with Operations and QA review |
| Fixtures or outputs contain live data or require credentials or an external service. | Possible / high | Inspect fixture and output contents. Run with installed tooling and without application credentials or live services. | Engineering with Privacy, Security and QA review |
| Stale candidate evidence is relied on for deployment or release decisions. | Possible / high | Pin the exact candidate, scope, and commands. Record named review and protected evidence references. Recheck when scope or evidence changes. | Security Official with QA and executive risk review |

The Security Official coordinates review with Privacy, Operations, Engineering, Database, the vendor owner, QA and the executive risk owner as applicable. Named operational appointments, treatment evidence and any residual-risk acceptance for dependent work remain open under WP03-B05.

#### G0 decision for WP1.1 · 2026-11-21

Alvin Lo, project owner and HIPAA compliance officer, confirmed in the project conversation that he holds approval, appointment and executive decision authority, directed sign-off and expressly authorized the next phase of work. His earlier named decisions cover the WP0.1 baseline, narrowed scope, and draft GOV-04 technical analysis. This entry records the owner decision and its stated basis. Reviewer appointments, counsel determinations and operational or release approvals require their own evidence when applicable.

The authorized packet is WP1.1 only, on `feat/flowstate-pro-implementation`. It allows the Node boundary integration test, architecture boundary record, four private manifests at the agreed Pro roots, the focused root script, and reproducibility changes to the lockfile importers. Use existing TypeScript tooling and synthetic fixtures. The only cross-package Pro edge is Pro API to Pro DB. The web shells' future API access is HTTP only. There is no cross-product runtime sharing. Tests verify the four forbidden-edge categories and the actual workspace graph. Review the locked workspace installation and run the existing dossier validator. Roll back by reverting the WP1.1 changes. The decision grants no authority for subsequent packets, runtime scaffolding, vendor use, regulated data, deployment or profile activation.

#### WP1.1 implementation result · 2026-11-22

- [x] Add the four private manifests, the isolated Pro API-to-DB workspace edge, and importer-only frozen lockfile changes.
- [x] Add [the architecture boundary record](../compliance/flowstate-pro/architecture-boundaries.md), ARC-01 evidence linkage, and the root `test:pro-product-boundaries` command.
- [x] Verify the current workspace, the synthetic forbidden-edge cases, and the passing control graph. The initial negative assertions failed before implementation. The final focused suite passed 9/9 on Node 22.23.1.
- [x] Verify the 16-project frozen offline install using the exact manifests and lockfile in a disposable directory. Lifecycle scripts were disabled for this dependency check. The dossier validator passed with 18 documents, one record and 22 files.

The WP0.4 verification inventory below is historical and remains reproducible against published WP0.4 commit `c1fcddd`. WP1.1 subsequently updates the root script, lockfile and ARC-01 evidence entry. The static suite does not exercise computed import strings or deployed runtime boundaries. WP1.2 and G1 remain open. The known Standard Playwright orchestration assertion remains a failing baseline result.

#### WP1.2 implementation result · 2026-11-22

The project owner authorized WP1.2 in the project conversation. The packet adds three local synthetic application shells using Node HTTP and existing tooling, with independent artifacts from the Pro-only build tool and validated US and CA environment manifests. This implementation choice keeps the shells dependency-free. It verifies the configuration and HTTP boundaries before later framework-specific application work. See the [boundary and run records](../compliance/flowstate-pro/architecture-boundaries.md).

| Checked item | Paths and verification |
| --- | --- |
| [x] Build provider, patient and API independently | Three Pro workspace manifests, `infra/pro/build.mjs` and `turbo.json`. Pro-only Turbo build passed 3/3. All three CA shell processes also passed a direct local readiness check. |
| [x] Validate plane configuration, exact origin and health/readiness | `infra/pro/{us.json,ca.json,config.mjs,entry.mjs,shell.mjs}`. The local integration test exercises the actual built services and rejects unknown hosts, origins and invalid configurations. |
| [x] Verify browser cookie isolation | `tests/tooling/pro-application-shells.test.mjs` passes using pinned Chromium and inert session-cookie fixtures across Standard, provider and patient hosts. |
| [x] Recheck dependency boundaries and locked workspace | 9/9 boundary checks passed. Frozen offline lockfile validation passed for 16 projects. ARC-01 evidence and dossier validation updated. |
| [x] Check Standard regression evidence | Workspace test command completed all 11 cached Turbo tasks. Their retained output includes 20 skipped DB integration tests. Standard Playwright discovery still lists 23 tests in seven files. The previously disclosed Standard tooling assertion remains open. |

WP1.3 is the next open packet. This record authorizes no database schema changes, live services, deployment, credential use or production data.

#### WP1.3 implementation result · 2026-11-22

The project owner authorized WP1.3. The separate Pro package now owns 13 foundation tables, composite tenant keys and relationships, and two ordered migrations. The runtime role is a non-owner with no RLS bypass, and patient lookups use the scoped repository export and parameterized transaction-local settings. Standard schema, migrations and application paths retain their prior contents.

| Checked item | Evidence |
| --- | --- |
| [x] Pro schema and generated client | Prisma schema validation and separate generation passed. Frozen offline pnpm installation passed with a Pro-only importer update. |
| [x] Fresh and upgrade deployments | The dedicated PostgreSQL 15 integration passed on a disposable socket-only cluster. The upgrade preserved rows seeded at the first migration. |
| [x] Tenant isolation and repository boundary | The integration verifies absent/malformed context, non-owner forced RLS on all 13 tables, context clearing, guessed/swapped tenant IDs, cross-tenant foreign keys and audit delete denial. The static boundary suite passed 10/10. |
| [x] Evidence and rollback | [Database boundary record](../compliance/flowstate-pro/architecture-boundaries.md#wp13-local-database-baseline), TEN-01 matrix and dossier validator. The migration history is additive. Local verification tears down disposable databases. Deployed migrations require reviewed forward fixes. |

WP1.4 is the next packet. WP1.3 evidence covers a synthetic local database baseline. Cloud roles, identity providers, policy engines, and operational safeguards remain separately gated.

#### WP1.4 synthetic data and artifact controls · 2026-11-22

- [x] Generate the canonical multi-tenant fixture and verify all scalar/enum fields in the 13 Pro baseline models. Include inert adult, minor, representative, provider, clinical status, files, billing, rights, hold and cross-region cases without adding clinical tables.
- [x] Reject noncanonical exports and known credential settings in the fixture lane. Run fixture admission in Docker with networking disabled and a read-only fixture mount.
- [x] Verify artifact canary detection against generated build text, logs, structured reports, a ZIP trace and a Chromium screenshot. Check scanner exit codes and payload-free output.
- [x] Configure the hosted test to drop inherited environment settings and execute under a loopback-only Linux network namespace after dependency setup.
- [x] Confirm [the hosted run](https://github.com/SnoogleBunny/Project-HitLink/actions/runs/44931620942) for code commit `92e9343`. Both dependency preparation and the test step in the loopback-only namespace succeeded.
- [ ] Obtain managed preview isolation read-back before closing WP1.4. No managed preview has been provisioned.

See [the DEV-01 verification record](../compliance/flowstate-pro/architecture-boundaries.md#wp14-synthetic-fixtures-and-artifact-controls). The local integration passed. The scanner’s supported formats and OCR limits are documented.

#### WP1.5 platform prerequisites

The US non-production provisioning packet requires the owner-approved IaC tool, authorized GCP organization/billing and workload/recovery project scope, and sufficiently scoped access for provisioning and read-back. The current plan leaves the tool as an owner decision. The implementation worktree has no approved tool or managed project configuration. WP1.5 and G1 remain open.

#### Software-only continuation · 2026-11-22

The project owner requested continuing independent software tasks and skipping infrastructure immediately. WP1.5 provisioning is deferred. Managed preview evidence under WP1.4 and the infrastructure-dependent G1 exit under WP1.6 stay open. The implementation plan permits provider-independent interfaces and tests while CIAM is blocked. This continuation uses synthetic evidence and leaves account activation, managed services and release gates closed.

| Local slice | Evidence and remaining gate |
| --- | --- |
| [x] Verify the existing WP1.3 baseline | Re-ran `test:pro-database-baseline` on disposable PostgreSQL 15. Fresh and upgrade deployments, RLS and composite repository access passed again. |
| [x] WP2.1 provider-independent session acceptance contract | `apps/pro-api/src/modules/auth/session.mjs` and `test:pro-session-contract`. Both adapter-contract scenarios pass, covering all eight Pro roles, surface and tenant binding, MFA, revocation, idle/absolute expiry and step-up. All 10 static workspace boundary checks passed. |
| [ ] WP2.1 full identity lifecycle | Requires approved CIAM, required agreements, authoritative persistence and credential/session wiring. Invitation issuance, recovery, rate limits, workforce JIT and account activation remain open. |

## Approval forms for reviewer completion

**Unsigned drafts.** Reviewers can copy the applicable form into their approved review channel. Return the completed decisions with the approver’s name, decision date, and evidence reference. Keep credentials, customer data, contracts, and legal advice out of the ledger.

### WP0.1 · Standard baseline review

Review the baseline evidence published in `76f33ea`, including the [original candidate manifest](../compliance/flowstate-pro/evidence/wp0.1-standard-baseline/candidate-manifest.txt) and the [November refresh](../compliance/flowstate-pro/evidence/wp0.1-standard-baseline/2026-11-19-pr3-refresh.md). For each function, record **accept**, **request changes**, or **defer**.

| Review function | Reviewer name | Decision and date | Evidence reference or outstanding issue |
| --- | --- | --- | --- |
| Database | ___ | ___ | ___ |
| Backend | ___ | ___ | ___ |
| Security/Privacy | ___ | ___ | ___ |
| QA/Assurance | ___ | ___ | ___ |
| CEO/Product owner | ___ | ___ | ___ |

**Standard owner disposition of the existing Playwright orchestration failure** — owner name ___ · date ___ · disposition and evidence reference ___.

### WP0.4 · Project-owner acceptance

**Candidate** — published commit `c1fcdddb405c9022115df786021bda07ef6bb51a`, 35-input manifest SHA-256 `b9798e3307214ba4e46eaba42ad9284793208145ec6e0e46481f71566023a541`.

**Project owner** — name ___ · decision date ___ · decision reference ___.

Record the project-owner decision for the candidate. List individual functions when the decision limits its scope or requests changes. Use the [WP0.4 packet](../compliance/flowstate-pro/work-packets/WP0.4-establish-change-control-and-dossier-validators.md#gate-3--required-human-acceptance) for review scope.

| Review function | Decision | Reviewer, date, and evidence reference |
| --- | --- | --- |
| Product | ___ | ___ |
| Architecture/Backend | ___ | ___ |
| Database | ___ | ___ |
| Security/Privacy | ___ | ___ |
| Operations/QA-Assurance | ___ | ___ |
| Legal/counsel · approval metadata only | ___ | ___ |

### WP0.5 · Separate owner authorization

Complete after WP0.4 acceptance. This authorization opens the G0 review packet. Phase 1 requires its own G0 scope decision.

**Project owner** — name ___ · decision date ___ · WP0.4 acceptance reference ___.

**Decision** — authorize WP0.5 review / defer ___ · decision reference ___.

## WP0.4 verification inputs

<details>
<summary>SHA-256 manifest for the reviewed candidate</summary>

```text
336bac1b2273acdd0ccf605d94a7012496d9f3bac6e8870a642e9a3ff53aff70  docs/HIPAA_Canada_Compliance_Agent_Directive.md
6c66b74ce14ab01c98840ba0971356a5a3f0d55efb389ae970fe0863a8f7431d  docs/compliance/flowstate-pro/README.md
d63a5c51c2b21cdb86d06326318c88f02076d4bf3d1222d22f4bdf1e832a1a61  docs/compliance/flowstate-pro/change-control-register.json
fb5816d180d8595f1012ddea30b4aa5d5d8c5848d135d624b30391a29c5649e2  docs/compliance/flowstate-pro/competitor-parity-matrix.md
397aade176447b3783e36169d9fd0944b8cdc9f52dcc3e0f49b43e792b2724ae  docs/compliance/flowstate-pro/control-and-evidence-matrix.md
2d5cc1e5a2f092b39601885b1e3f25d100e34894648b912ea7cb80eb89497bab  docs/compliance/flowstate-pro/current-standard-baseline.md
35aea0e7da9c67abe39bb96374cd77ec6cad395824673e43f39179550538ea37  docs/compliance/flowstate-pro/data-classification-and-flows.md
b154a0ec5fd2ed20b2aec739203369063f763d4b36d75cdb2e54bd23ab12b37f  docs/compliance/flowstate-pro/decision-register-and-open-items.md
ee3a10c15ad9edb0fe89d50111161d17ecc3c98035f31ff05dbc7c417fa3ef32  docs/compliance/flowstate-pro/dossier-manifest.json
d76dee09203d52a62b76cfd95465c315289c23299df95a279c99bfb55c2160a4  docs/compliance/flowstate-pro/evidence/README.md
a597a9cc570d6326b1bd50df213a33a89a507b633f4d6473ca6bfefe0ea09fec  docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/2026-11-19-pr3-refresh.md
bcc7aae1c21d36bb41a9e9f0481353be9e321770334d7ea9dd5a1b5791b29568  docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/candidate-manifest.txt
ecc37f046fc56a9609df6f18ee38dfaf957f5969d8c75d867f7cbe38e2c798ee  docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/prisma-inventory.txt
7c77a60afdef3547bf7d6093d845ef18676ca81ba300c92e72efb3830bc7d431  docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/root-command-results.txt
e451ef6cdd0868b155d0995d39ca9f658a72ca794dcf8f2f7896ec3fe78f383e  docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/snapshot-and-toolchain.txt
3745edd3c5e396e5b22b422239bed8b31228518a4cd33451b9b0d813b25c3d6e  docs/compliance/flowstate-pro/example.md
ba9915dd4db1a8527d108bd06600dbeba9bb9437c30790b4c88c67139d873747  docs/compliance/flowstate-pro/legal-applicability-matrix.md
591774b3889fb09c0139ee3ce65c8886b49645b26ef6cd65896a2662a18cb453  docs/compliance/flowstate-pro/operations-and-governance.md
67363f693d10bc4351664245e3fa9dcc703207b4627bcb946afcd7d18786e8b1  docs/compliance/flowstate-pro/product-requirements-document.md
052e636fb5559cf5a853d9db8cca88c238913b006db364d1176410225618f3b9  docs/compliance/flowstate-pro/product-spec.md
bca12a78c2c19a04305f92932f1698c9ff602130c439b1f5e4075b7c52e38b79  docs/compliance/flowstate-pro/roadmap.md
98349079dc2f232498eed22ed4c66e58f6f6b8894b70bd451e4236c3f9637b42  docs/compliance/flowstate-pro/schemas/change-control-record.schema.json
3a13110f5eb99725d22e84427bd7307e91fd51e18f316274c7c70f577703ba5a  docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json
4118a63e6a27a4037a45ad2331fbdeef8bacd0c912a20c0734d76c8f152fba59  docs/compliance/flowstate-pro/security-privacy-architecture.md
752e8715aeb99444acc8a7185418fa0e9467ae505bcd339b0ec940394f7ebac9  docs/compliance/flowstate-pro/system-design.md
3517e9f0eb37cbb1d0e2e98eb1241c39e774dadc3d8ddeac80fda2b3ec0a9537  docs/compliance/flowstate-pro/work-packets/WP0.1-freeze-evidence-and-boundaries.md
5d91399f7d99e2ec29019ae3a4dd16eaaea08b04e2a85c85b01f4e2011a3cac0  docs/compliance/flowstate-pro/work-packets/WP0.2-author-product-and-architecture-specifications.md
ed3b4f4f58db98c6ccd929e3c8d1bc1591340effa026d6989b4768ac365e6f66  docs/compliance/flowstate-pro/work-packets/WP0.3-author-legal-data-control-and-operations-specifications.md
7c7fe28198afbdeacae2610ed4f80e077205efab3844129e20979f9ef865dbcd  docs/compliance/flowstate-pro/work-packets/WP0.4-establish-change-control-and-dossier-validators.md
0c883815934bfc169dfe42b9ade0f1747cb1a65dd8a20d8a00dfe28bb82be11a  docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md
78e5689a2c97278abe09c38d28a45d9231ddcdc627be5faff2bfa5949acc116c  package.json
0253aee20785f40a6b0aa7d13488a1f0eebf2e26526fe82e66058e386e30cb9d  pnpm-lock.yaml
08d75840c97ab0e72d1d9b5b84a17e47a2e06cb159a5fbec5ee0a6a56682dad7  pnpm-workspace.yaml
788e1f86c3584fc15d313fa61e83a8ca1ff2ec489f6517b0a89a169a93eff722  scripts/pro-compliance/validate-dossier.mjs
80364c0ff286730106b1db298a60e28cacfbaffd4e1db4722a9adf9ae14b0042  tests/tooling/pro-compliance-dossier.test.mjs
```

</details>
