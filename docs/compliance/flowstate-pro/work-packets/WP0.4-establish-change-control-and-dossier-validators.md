# WP0.4 — Establish change control and dossier validators

## Packet state

The WP0.4 tooling is implemented, including the project-owner-directed clarification recorded in the [decision register](../decision-register-and-open-items.md#wp04-review-disposition--2026-11-19). The November 19, 2026 specification review of the prior candidate did not pass. Fresh specification review, quality review, and human acceptance remain pending; G0 remains blocked.

## Goal

Add the smallest deterministic, repository-relative Node.js tooling needed to validate Flowstate Pro dossier metadata, change-control records, status transitions, named legal approvals, and prohibited plaintext contract/secret material.

## Human outcome

A reviewer can run one focused validator and one focused Node test file to prove that:

- current approved/specification dossier documents are registered and pass the metadata contract;
- incomplete records fail closed;
- legal values cannot appear approved without named approval metadata;
- `SPECIFIED` cannot jump directly to `APPROVED_FOR_PROFILE`;
- plaintext contract bodies and secret-shaped values are rejected without being printed; and
- validation results identify the exact candidate and remain reproducible without installing a new library.

## Why this packet exists

WP0.1 froze the Standard boundary. WP0.2 specified the Pro product and architecture. WP0.3 reconciled legal, data, control, operations, evidence, and benchmark contracts. WP0.4 converts the dossier's existing change-control and status rules into fail-closed tooling before G0 review.

This packet is not permission to implement Flowstate Pro applications, schemas, migrations, infrastructure, vendors, legal values, production configuration, or WP1.x work.

## Authority and precedence

Apply the current repository sources in this order:

1. Approved product/architecture decisions and blocker state in `docs/compliance/flowstate-pro/decision-register-and-open-items.md`.
2. Qualified-counsel-approved legal entries and policy catalogs for legal values. No new legal-value approval is authorized here.
3. `docs/compliance/flowstate-pro/README.md` for dossier precedence, status vocabulary, and change-control fields.
4. `docs/compliance/flowstate-pro/roadmap.md`, especially the status progression and evidence model.
5. `docs/compliance/flowstate-pro/control-and-evidence-matrix.md`, especially status separation and evidence-state transitions.
6. `docs/compliance/flowstate-pro/legal-applicability-matrix.md` for named approval metadata expectations and counsel-owned values.
7. `docs/compliance/flowstate-pro/operations-and-governance.md` for protected-evidence and repository-content boundaries.
8. `docs/compliance/flowstate-pro/product-requirements-document.md`, especially NFR-017 and release-acceptance prerequisites.
9. `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` for WP0.4 acceptance and sequencing.
10. `docs/HIPAA_Canada_Compliance_Agent_Directive.md` for execution prohibitions and handoff requirements.

If these sources conflict, stop the affected implementation, record the conflict in the decision register, and keep the affected record or transition `BLOCKED`. Do not weaken the stricter source or invent a default.

## Required context

Read the complete current contents before editing:

- `README.md`
- `CLAUDE.md`
- `docs/HIPAA_Canada_Compliance_Agent_Directive.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- every Markdown file under `docs/compliance/flowstate-pro/`, including WP0.1–WP0.3 packets and evidence documentation
- `docs/product_decisions_ledger.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/04-demo/Working Demo State.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/Work Packet Template.md`
- relevant Backend and QA role briefs under `docs/Agents/`
- root `package.json`
- `pnpm-workspace.yaml`
- existing `tests/tooling/*.test.mjs`
- installed dependency declarations and lockfile only as needed to prove whether a dependency already exists

Do not browse for new legal, vendor, competitor, or compliance material. WP0.4 validates the approved repository contract; it does not refresh that contract.

## Starting state and environment

- Repository/worktree: `/Users/alvinlo/Desktop/Project-HitLink-wp0-3`
- Branch: `hermes/pro-wp0-3-controls`
- Base commit at packet authoring: `d4f2098b4940cae61b9f36345cb480bda33d990d`
- WP0.3 is complete and WP0.4 is authorized as the next packet.
- G0 remains `BLOCKED`; WP1.x is unauthorized.
- Node observed at packet authoring: `v22.23.0`.
- Global `pnpm` was not available on `PATH` at packet authoring.
- Corepack observed at packet authoring: `0.34.6`.
- `node_modules` was absent at packet authoring.
- Root `package.json` pins `pnpm@10.33.0` and already uses Node's built-in test runner for tooling tests.
- No JSON-schema validation dependency was found in the package manifests inspected for this packet.

These are observations, not future pass claims. Recheck the implementation environment and report actual command results. Do not install dependencies merely to complete WP0.4.

## Required skills and working mode

- Follow `software-development:minimal-change-development`.
- Use RED-GREEN-REFACTOR with Node's built-in `node:test` and `node:assert/strict`.
- PONYTAIL MODE ACTIVE — level: full.
- Reuse existing repository patterns, then Node standard library, then existing dependencies. A new dependency is prohibited unless the stdlib implementation is demonstrably insufficient, the reason is recorded in this packet and the decision register, and the project owner explicitly approves it before installation.

## Product, data, profile, and actor boundary

- Product: Flowstate Pro dossier tooling only.
- Runtime/product behavior: none.
- Data: repository metadata and unmistakably synthetic test fixtures only.
- Profiles: metadata may reference `ALL`, `VIRGINIA`, `BC_PRIVATE_CLINIC`, or exact future profile identifiers; no profile is approved here.
- Actors: implementer and reviewers only. Approval fixtures use synthetic names such as `Example Reviewer`, never real counsel/customer identities unless an authorized human later supplies approved metadata.
- Contracts/evidence: metadata and protected references only. No contract body, legal advice, PHI/PII, production secret, customer export, incident body, personnel record, or assessor workpaper may enter Git, fixtures, diagnostics, or snapshots.

## Exact allowed implementation scope

Create or modify only these paths:

1. `docs/compliance/flowstate-pro/schemas/change-control-record.schema.json`
2. `docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json`
3. `docs/compliance/flowstate-pro/dossier-manifest.json`
4. `docs/compliance/flowstate-pro/change-control-register.json`
5. `scripts/pro-compliance/validate-dossier.mjs`
6. `tests/tooling/pro-compliance-dossier.test.mjs`
7. `package.json`
8. `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
9. `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
10. `docs/compliance/flowstate-pro/work-packets/WP0.4-establish-change-control-and-dossier-validators.md`

Every changed path must be necessary. Prefer fewer paths. In particular:

- Do not edit existing dossier specification documents merely to add repeated metadata if `dossier-manifest.json` can represent it once.
- Do not create a fixture directory unless inline synthetic fixtures in the single test file are demonstrably inadequate.
- Do not add a generic schema engine, parser framework, CLI framework, shared package, or reusable abstraction for hypothetical future validators.

## Forbidden scope

Do not modify or create:

- any application or package source under `apps/**` or `packages/**`;
- Prisma schema, migrations, seeds, database configuration, or data;
- product/runtime/API/browser behavior;
- infrastructure, CI/CD, deployment, cloud, vendor, identity, Stripe, secrets, or environment configuration;
- WP0.1 evidence bodies or inherited WP0.1–WP0.3 specification content outside the exact allowed paths;
- a Standard-to-Pro migration or shared Standard/Pro runtime assumption;
- WP0.5 content beyond identifying it as the next review packet after WP0.4 acceptance;
- any WP1.x application, schema, infrastructure, boundary, fixture, or test work;
- dependencies or lockfile changes without the explicit dependency exception gate above.

Do not commit, push, merge, deploy, provision, contact a customer/vendor/regulator, accept a contract, use production credentials, or use regulated/customer data.

## Minimal implementation architecture

Use four small layers only:

1. Two machine-readable JSON contracts under `schemas/`.
2. One central dossier manifest and one append-only change-control register, both JSON.
3. One Node standard-library validator that reads those files and the registered Markdown documents.
4. One focused `node:test` file that creates temporary synthetic repositories/records and exercises CLI behavior.

Do not implement a general JSON Schema interpreter. The two schema JSON files are the canonical machine-readable contract definitions; `validate-dossier.mjs` enforces exactly those fields and values with explicit small functions. The test must prove the script and schema definitions do not drift on required fields, vocabulary, and transition rules.

## Contract 1 — dossier document metadata

`docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json` must define one manifest-entry contract with these required fields:

| Field | Contract |
|---|---|
| `document_id` | Stable uppercase identifier matching `^[A-Z][A-Z0-9._-]{2,63}$`; unique in the manifest. |
| `path` | Unique repository-relative POSIX path to an existing dossier Markdown file; no absolute path, `..`, backslash, symlink escape, or path outside the repository. |
| `title` | Non-empty human-readable title. |
| `status` | Exactly one approved dossier status from the vocabulary below. |
| `owner` | Non-empty accountable function, not a fabricated natural person. |
| `source` | Non-empty array of repository-relative source paths or stable decision IDs; no URL-only authority. |
| `affected_profiles` | Non-empty sorted unique array; use `ALL`, `VIRGINIA`, `BC_PRIVATE_CLINIC`, or an exact governed profile ID. |
| `effective_date` | ISO calendar date `YYYY-MM-DD`; must parse to the same date. |
| `required_review` | Non-empty sorted unique array of accountable review functions. |
| `evidence_references` | Non-empty sorted unique array of repository-relative paths or protected evidence IDs; references only, never evidence bodies. |
| `latest_change_id` | Existing `change_id` in `change-control-register.json`. For an `APPROVED_FOR_PROFILE` entry, the referenced record must also have that status and explicitly list the document ID and every affected profile token. The validator checks the record's prerequisites and approval metadata separately; human approval evidence is not inferred. |

The manifest root must require:

- `schema_version` equal to `1`;
- `documents` as a non-empty array;
- unique `document_id` and unique normalized `path`;
- deterministic ordering by `path`;
- no unknown top-level or entry fields.

Register the current approved/specification baseline needed for G0 review. At minimum this includes the dossier index, product specification, PRD, roadmap, system design, security/privacy architecture, legal matrix, data/flows, control/evidence matrix, operations/governance, competitor matrix, decision register, current Standard baseline, evidence README, WP0.1–WP0.3 packets, and the implementation plan. Do not register future/nonexistent documents.

A registered document passes only when it exists, remains inside the repository, has a Markdown H1, and its declared top-level status does not contradict the manifest status. Map prose variants only through an explicit small normalization table in the validator; do not use fuzzy status guessing.

## Contract 2 — change-control record

`docs/compliance/flowstate-pro/schemas/change-control-record.schema.json` must define one record with these required fields:

| Field | Contract |
|---|---|
| `change_id` | Stable unique ID matching `^WP[0-9]+\.[0-9]+-CC-[0-9]{3}$`; WP0.4 starts with `WP0.4-CC-001`. |
| `document_ids` | Non-empty sorted unique list of existing manifest `document_id` values affected by the change. |
| `status` | Current record status from the approved vocabulary. |
| `owner` | Accountable function. |
| `reason` | Non-empty concise reason for the change. |
| `source` | Non-empty sorted unique list of decision IDs and/or repository-relative controlling paths. |
| `affected_profiles` | Non-empty sorted unique list using the same profile vocabulary as the manifest. |
| `effective_date` | Valid `YYYY-MM-DD`. |
| `superseded_text` | Required string. Use `NONE — no prior text superseded` when nothing is superseded; otherwise describe the superseded proposition/reference without copying protected text. |
| `required_review` | Non-empty sorted unique list of review functions. |
| `evidence_references` | Non-empty sorted unique list of repository-relative evidence paths, candidate IDs, hashes, or protected evidence IDs. |
| `transition` | Required object described below. |
| `legal_value` | Required boolean. |
| `approval` | Required object when the rule below applies; otherwise must be absent. |

The register root must require:

- `schema_version` equal to `1`;
- `records` as a non-empty array;
- unique `change_id` values;
- deterministic ascending ordering by `change_id`;
- no unknown top-level or record fields.

### Transition object

Require:

- `from_status` — approved status vocabulary;
- `to_status` — approved status vocabulary and equal to record `status`;
- `prerequisite_evidence` — object whose keys are status names and values are non-empty evidence-reference arrays;
- `approval_reference` — non-empty evidence/decision reference only when the transition requires approval; otherwise absent.

### Approved status vocabulary

Use exactly:

`DRAFT`, `PROPOSED`, `COUNSEL_REVIEW_REQUIRED`, `OWNER_APPROVAL_REQUIRED`, `APPROVED`, `SPECIFIED`, `IMPLEMENTED`, `TECHNICALLY_VERIFIED`, `OPERATIONALLY_EXERCISED`, `EVIDENCE_COMPLETE`, `LEGALLY_REVIEWED`, `APPROVED_FOR_PROFILE`, `BLOCKED`, `NOT_APPLICABLE`, `SUPERSEDED`.

No alias, lowercase value, combined value, runtime `REVIEW_BLOCKED`, or new status is allowed.

### Status transition rules

Ground validation in the existing dossier rather than inventing a generalized workflow:

- Main evidence progression is adjacent only:
  - `DRAFT` → `SPECIFIED`
  - `SPECIFIED` → `IMPLEMENTED`
  - `IMPLEMENTED` → `TECHNICALLY_VERIFIED`
  - `TECHNICALLY_VERIFIED` → `OPERATIONALLY_EXERCISED`
  - `OPERATIONALLY_EXERCISED` → `EVIDENCE_COMPLETE`
- Legal review is a separate required dimension:
  - `COUNSEL_REVIEW_REQUIRED` → `LEGALLY_REVIEWED`
- Owner approval is a separate required dimension:
  - `OWNER_APPROVAL_REQUIRED` → `APPROVED`
- A transition to `APPROVED_FOR_PROFILE` is allowed only from `OWNER_APPROVAL_REQUIRED`, and only when `prerequisite_evidence` contains non-empty references for every one of:
  - `SPECIFIED`
  - `IMPLEMENTED`
  - `TECHNICALLY_VERIFIED`
  - `OPERATIONALLY_EXERCISED`
  - `EVIDENCE_COMPLETE`
  - `LEGALLY_REVIEWED`
  - `OWNER_APPROVAL_REQUIRED`
- `SPECIFIED` → `APPROVED_FOR_PROFILE` must fail deterministically even when an approval object exists.
- No state may be inferred from another. Evidence for one prerequisite cannot be silently copied to satisfy another.
- Append `BLOCKED`, `NOT_APPLICABLE`, and `SUPERSEDED` as terminal disposition records with a new `change_id`. They may describe any canonical non-disposition predecessor, with a non-empty `prerequisite_evidence` entry for that predecessor. Each requires reason, owner, effective date, affected profiles, evidence/decision reference, required review, and explicit `superseded_text`. Neither approval metadata nor an approval reference is allowed. If a manifest entry cites the disposition as its latest change, the record must cover that document and the entry must display the same disposition.
- There are no outgoing edges from a disposition. To revisit the subject, append a separate record using the ordinary progression and evidence. Non-disposition records may cite the history as context in `source`, but must not cite a disposition change ID as prerequisite, record evidence, or approval evidence.
- Any unlisted transition fails closed. If implementation discovers a legitimate current-dossier transition not listed here, stop and request a packet correction rather than broadening the graph.

The validator may encode these rules as constants read from the schema files. Do not create a workflow engine.

Draft 2020-12 assertions enforce the graph, required evidence keys, uniqueness within each evidence array, and timestamp syntax. The schema documents the additional mandatory CLI checks: exact calendar and published leap-second validity, and reuse of references across different evidence arrays. A schema-only pass does not satisfy those checks or replace a successful dossier CLI run. Do not depend on an optional format-assertion mode or change the evidence record shape to perform these checks.

## Named approval metadata rule

For every `APPROVED_FOR_PROFILE` record, require `approval` regardless of `legal_value`. For `APPROVED` and `LEGALLY_REVIEWED`, require it when `legal_value` is `true`. The approval contains exactly:

- `approver_name` — non-empty named natural person, without leading or trailing whitespace; the schema and CLI check the raw string without trimming. Placeholders, accountable-function labels, and role-only phrases are invalid regardless of ASCII letter case;
- `approver_role` — non-empty accountable role/function;
- `approved_at` — valid RFC 3339 timestamp;
- `scope` — non-empty exact legal value/profile/version scope;
- `evidence_reference` — non-empty protected evidence or decision reference;
- `candidate_identity` — non-empty exact candidate/manifest/commit identity.

Reject explicit placeholders and accountable-function labels, plus role-only phrases consisting of zero or more recognized title modifiers followed by `counsel`, `officer`, `director`, `owner`, `manager`, `lead`, or `administrator`. The bounded modifier list in the validator covers seniority, employment, and function terms, with case-insensitive words and whitespace between words. Do not reject a real name merely because it contains a title word. A machine pass establishes metadata format only. The accountable human reviewer must match the named person and scope to the protected approval evidence and verify the person's authority before accepting the approval; absence of that verification leaves the approval gate open. No trusted roster or protected evidence bodies are added in this packet.

For records that do not meet the condition above, `approval` must be absent rather than an empty object.

## Plaintext secret and contract rejection

Scan the full bytes/text of governed JSON and registered Markdown files, including fenced code blocks. Use bounded pattern categories derived from the existing WP0.2/WP0.3 scanners:

- private-key headers;
- AWS access-key shape;
- GitHub token shape;
- Stripe live secret shape;
- Google API-key shape;
- JWT shape;
- bearer-token shape;
- quoted credential assignments;
- database URLs containing credentials;
- payment-card values that pass Luhn after separator removal;
- explicit plaintext contract/evidence-body markers: `-----BEGIN CONTRACT-----`, `-----BEGIN AGREEMENT-----`, `-----BEGIN BAA-----`, `-----BEGIN DPA-----`, and matching `END` markers;
- JSON keys named `contract_text`, `contract_body`, `agreement_text`, `agreement_body`, `legal_advice`, `private_key`, `client_secret`, `access_token`, or `refresh_token` when assigned a non-redacted non-empty value.

Do not reject ordinary words such as “contract,” “agreement,” “secret,” or metadata references. Do not attempt natural-language contract classification. The bounded markers and prohibited payload keys are the deliberately narrow trust boundary for WP0.4; expanding it requires evidence of a real bypass.

Tests and repository fixtures must use only unmistakably fake values and explicit sentinels. Never place a structurally valid live-looking credential in Git merely to test detection. Construct dangerous-looking samples in memory from fragments where necessary.

Diagnostics must report only:

- stable diagnostic code;
- repository-relative path or synthetic fixture ID;
- record/document ID when available;
- field name or pattern category;
- line number only when safely derivable.

Diagnostics must never print the matched value, surrounding line, contract text, credential fragment, JSON value, or stack trace on ordinary validation failure.

## Validator CLI and module contract

Implement `scripts/pro-compliance/validate-dossier.mjs` with Node standard library only.

### Repository-relative behavior

- Default root is the current working directory.
- Require the root to contain `.git` or resolve through `git rev-parse --show-toplevel`; reject invocation outside a repository.
- Normalize all governed paths to repository-relative POSIX paths.
- Reject absolute paths, `..`, backslashes, NUL, symlink escape, missing registered files, and paths outside the repository.
- Read UTF-8 only and fail closed on malformed JSON or invalid UTF-8.
- Sort files, records, and diagnostics before output so repeated runs are byte-stable.

### CLI

Support only:

```text
node scripts/pro-compliance/validate-dossier.mjs
node scripts/pro-compliance/validate-dossier.mjs --root <repository-root>
```

Unknown flags, repeated flags, missing values, or extra positional arguments are usage errors. `--root` exists so the Node test can exercise the real CLI against temporary synthetic repositories; it does not permit paths to escape that root.

Export the smallest functions needed by the test. Do not create a second validation implementation inside the test.

### Exit and output semantics

- Exit `0`: validation passed. Print one concise deterministic summary to stdout; stderr empty.
- Exit `1`: dossier/schema/content validation findings. Print only sorted sanitized diagnostics to stderr and one failure count summary; do not print secret/contract values.
- Exit `2`: CLI usage, repository discovery, unreadable file, invalid UTF-8, or unexpected internal/tooling failure. Print a sanitized category/path message; no stack trace or sensitive value.

Malformed governed JSON is a validation finding and exits `1`. Failure to read the file at all exits `2`.

## Dossier manifest and initial change register

Create the smallest baseline records needed for the current dossier to pass:

- `dossier-manifest.json` registers only existing approved/specification/current-evidence documents required for G0 review.
- `change-control-register.json` begins with `WP0.4-CC-001`, documenting adoption of the machine-readable manifest and validator contract. Use `SPECIFIED` as the target status; do not claim implementation, technical verification, legal review, evidence completeness, profile approval, G0 approval, or WP0.4 completion.
- `WP0.4-CC-001` may affect multiple registered documents to avoid fabricating historical per-document records. It must say `NONE — no prior text superseded` unless an allowed dossier/plan/register edit actually supersedes a proposition.
- Existing historical dates and statuses remain unchanged. New WP0.4 records use the actual implementation date.
- Do not backfill fictional approvers or reconstruct approval events that the repository does not record.

## Package scripts

Modify root `package.json` only as needed to add:

```json
{
  "scripts": {
    "validate:pro-compliance-dossier": "node scripts/pro-compliance/validate-dossier.mjs",
    "test:pro-compliance-dossier": "node --test tests/tooling/pro-compliance-dossier.test.mjs"
  }
}
```

Preserve all existing scripts. Do not alter `test`, `lint`, `build`, `check-types`, database, or E2E semantics. Do not add a dependency.

Do not broaden `test:tooling` unless required by a failing test that proves the focused test is otherwise unreachable; the two new explicit scripts are sufficient for WP0.4.

## TDD sequence

Follow this order and retain concise RED/GREEN evidence in the implementation record.

### RED 1 — required metadata

1. Create `tests/tooling/pro-compliance-dossier.test.mjs` first.
2. Add an inline safe fixture missing at least `owner` and `evidence_references`.
3. Run:

```bash
node --test tests/tooling/pro-compliance-dossier.test.mjs
```

4. Confirm failure is caused by missing implementation/contract, not syntax or an unrelated environment issue.

### GREEN 1 — schemas and minimum record validation

Add the two schema files and minimum explicit validation needed for required fields, unknown fields, types, unique IDs/paths, ordering, dates, and vocabulary. Rerun the focused test.

### RED/GREEN 2 — transition safety

Add a fixture for `SPECIFIED` → `APPROVED_FOR_PROFILE`. It must fail even with an approval object. Add adjacent valid-transition coverage and the full prerequisite-evidence case for the only permitted entry to `APPROVED_FOR_PROFILE`.

### RED/GREEN 3 — named legal approval metadata

Add a `legal_value: true` approved fixture with missing or role-only approval metadata. It must fail. Add a valid synthetic named approval fixture that passes without claiming the repository contains a real approval.

### RED/GREEN 4 — secret and contract body safety

Add in-memory fixtures for each required pattern category or a representative table that covers all categories. At minimum include:

- a private-key-header sentinel assembled from fragments;
- a credential assignment assembled from fragments;
- `-----BEGIN CONTRACT-----` assembled from fragments;
- a prohibited `contract_text` JSON field with a synthetic non-redacted value;
- matching safe redacted/reference-only controls.

Assert that diagnostics contain category/path/field only and do not contain the sentinel value or surrounding payload.

### RED/GREEN 5 — current dossier pass

Add an integration test that invokes the real validator against the repository root and proves the current registered dossier passes. Do not mock file reads or maintain a second expected-status implementation.

### REFACTOR

Remove duplication only when the test demonstrates it. Keep validation helpers local to the single script unless a second real consumer exists.

## Required focused tests

The single test file must cover at least:

1. deliberately incomplete dossier metadata fails;
2. unknown fields fail;
3. duplicate document IDs and normalized paths fail;
4. invalid/out-of-root paths fail;
5. invalid status vocabulary fails;
6. invalid date/timestamp fails;
7. `SPECIFIED` → `APPROVED_FOR_PROFILE` fails;
8. missing one intermediate prerequisite for `APPROVED_FOR_PROFILE` fails;
9. complete prerequisite evidence plus `OWNER_APPROVAL_REQUIRED` source state and named approval passes synthetically;
10. approved legal value without `approval` fails;
11. approved legal value with role-only/placeholder approver fails;
12. valid synthetic named approval metadata passes;
13. plaintext secret patterns fail without value disclosure;
14. plaintext contract markers/payload keys fail without body disclosure;
15. `[REDACTED]` and protected-reference-only metadata pass;
16. malformed governed JSON exits `1`;
17. unreadable/missing required file exits `2`;
18. unknown CLI flag exits `2`;
19. diagnostics are sorted and deterministic;
20. current registered dossier documents pass;
21. root package scripts have the exact required commands and no new dependency was added.

Use temporary directories under the OS/Hermes temporary location via `node:fs/promises` and clean them in `finally`. Do not write test artifacts into the repository.

## Acceptance requirements

WP0.4 implementation is eligible for review only when all are true:

- [ ] Only allowed paths changed.
- [ ] No dependency or lockfile changed.
- [ ] Both schema files exist and encode the exact required contracts, status vocabulary, approval fields, and transition rules.
- [ ] Manifest/register JSON is deterministic, sorted, contains no unknown fields, and registers only existing dossier documents.
- [ ] Every current registered approved/specification dossier document passes.
- [ ] A deliberately incomplete fixture fails.
- [ ] `SPECIFIED` → `APPROVED_FOR_PROFILE` fails.
- [ ] `APPROVED_FOR_PROFILE` requires all named intermediate evidence dimensions and named approval metadata.
- [ ] Approved legal values without named approval metadata fail.
- [ ] Secret and plaintext contract-body patterns fail without revealing values.
- [ ] Safe redacted/reference-only fixtures pass.
- [ ] Validator behavior is repository-relative and rejects path escape.
- [ ] Exit `0`, `1`, and `2` semantics are tested.
- [ ] Diagnostics are deterministic and secret-safe.
- [ ] Node focused tests pass from the exact candidate.
- [ ] Direct validator run passes from the exact candidate.
- [ ] Package scripts run where the current environment permits; unavailable `pnpm` is reported as blocked, not passed.
- [ ] Relative Markdown links in all changed Markdown resolve.
- [ ] JSON files parse with Node.
- [ ] `git diff --check` passes.
- [ ] Complete diff review finds no product/runtime/schema/migration/infrastructure change, legal-value approval, contract body, secret, compliance claim, G0 approval, or WP1.x authorization.
- [ ] Independent specification review returns `PASS` for the exact candidate.
- [ ] Independent quality/security/evidence review returns `APPROVED` for the same exact candidate.
- [ ] Required human acceptance is explicitly recorded; it is not inferred from technical checks.
- [ ] G0 remains `BLOCKED`; WP1.x remains unauthorized.
- [ ] WP0.5 is not drafted or started in the same uninterrupted run.

## Required validation commands

Run from the repository root and preserve exact exit codes and concise output.

### Environment and candidate identity

```bash
git branch --show-current
git rev-parse HEAD
git status --short -uall
node --version
command -v pnpm || true
command -v corepack || true
corepack --version
```

### JSON syntax

```bash
node -e "for (const p of process.argv.slice(1)) JSON.parse(require('node:fs').readFileSync(p, 'utf8'));" \
  docs/compliance/flowstate-pro/schemas/change-control-record.schema.json \
  docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json \
  docs/compliance/flowstate-pro/dossier-manifest.json \
  docs/compliance/flowstate-pro/change-control-register.json
```

### Focused RED/GREEN and final checks

```bash
node --test tests/tooling/pro-compliance-dossier.test.mjs
node scripts/pro-compliance/validate-dossier.mjs
node --check scripts/pro-compliance/validate-dossier.mjs
node --check tests/tooling/pro-compliance-dossier.test.mjs
```

Run the package-script equivalents only after the direct Node commands pass:

```bash
corepack pnpm test:pro-compliance-dossier
corepack pnpm validate:pro-compliance-dossier
```

If Corepack/pnpm cannot execute because dependencies/tooling are unavailable, record the exact blocker. Do not substitute that blocked command for the direct Node results, and do not claim it passed.

### Scope, links, hashes, and diff

Run this exact stdlib-only verification after implementation. Update `EXPECTED` only if this packet is explicitly revised before implementation; do not broaden it during implementation.

```bash
python3 - <<'PY'
from hashlib import sha256
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path.cwd().resolve()
EXPECTED = {
    Path("docs/compliance/flowstate-pro/schemas/change-control-record.schema.json"),
    Path("docs/compliance/flowstate-pro/schemas/dossier-document-metadata.schema.json"),
    Path("docs/compliance/flowstate-pro/dossier-manifest.json"),
    Path("docs/compliance/flowstate-pro/change-control-register.json"),
    Path("scripts/pro-compliance/validate-dossier.mjs"),
    Path("tests/tooling/pro-compliance-dossier.test.mjs"),
    Path("package.json"),
    Path("docs/compliance/flowstate-pro/decision-register-and-open-items.md"),
    Path("docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md"),
    Path("docs/compliance/flowstate-pro/work-packets/WP0.4-establish-change-control-and-dossier-validators.md"),
}
errors = []

def fail(category, detail):
    errors.append(f"{category}: {detail}")

repo = Path(subprocess.run(
    ["git", "rev-parse", "--show-toplevel"],
    text=True,
    capture_output=True,
    check=True,
).stdout.strip()).resolve()
if repo != ROOT:
    fail("repository-root", f"run from {repo}")

branch = subprocess.run(
    ["git", "branch", "--show-current"], text=True, capture_output=True, check=True
).stdout.strip()
bases = {
    "hermes/pro-wp0-3-controls": "d4f2098b4940cae61b9f36345cb480bda33d990d",
    "feat/flowstate-pro-implementation": "5b1b84b103a0cea9a521d5857c0b49fdeb710473",
}
head = subprocess.run(
    ["git", "rev-parse", "HEAD"], text=True, capture_output=True, check=True
).stdout.strip()
if bases.get(branch) != head:
    fail("candidate-base", f"{branch} at {head}")

status = subprocess.run(
    ["git", "status", "--porcelain=v1", "-uall"],
    text=True,
    capture_output=True,
    check=True,
).stdout.splitlines()
status_paths = {Path(line[3:]) for line in status if line}
# The worktree contains inherited WP0.1-WP0.3 changes. Current-packet edits are
# the allowed set above; inherited paths must be reconciled by the candidate
# manifest recorded in the implementation handoff, not deleted or rewritten.
unexpected_new = {
    path for path in status_paths
    if path not in EXPECTED
    and path.as_posix().startswith((
        "docs/compliance/flowstate-pro/schemas/",
        "scripts/pro-compliance/",
        "tests/tooling/pro-compliance-dossier",
    ))
}
if unexpected_new:
    fail("scope", f"unexpected WP0.4 path(s): {sorted(map(str, unexpected_new))}")
for path in EXPECTED:
    if path != Path("package.json") and path.suffix in {".json", ".mjs", ".md"} and not path.exists():
        fail("missing-allowed-path", path.as_posix())

for path in [p for p in EXPECTED if p.suffix == ".json"]:
    if path.is_file():
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            fail("json-syntax", path.as_posix())

for path in [p for p in EXPECTED if p.suffix == ".md" and p.is_file()]:
    body = path.read_text(encoding="utf-8")
    for target in re.findall(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", body):
        clean = target.split("#", 1)[0].split("?", 1)[0].strip().strip("<>")
        if not clean or re.match(r"^[a-z][a-z0-9+.-]*:", clean, re.I):
            continue
        if not (path.parent / clean).resolve().exists():
            fail("broken-link", f"{path}: {clean}")

for path in EXPECTED:
    if path.is_file():
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.endswith((" ", "\t")):
                fail("trailing-whitespace", f"{path}:{number}")

manifest = []
for path in sorted(EXPECTED, key=lambda item: item.as_posix()):
    if path.is_file():
        manifest.append(f"{sha256(path.read_bytes()).hexdigest()}  {path.as_posix()}")
print("WP0.4 CANDIDATE MANIFEST")
print("\n".join(manifest))

diff = subprocess.run(["git", "diff", "--check"], text=True, capture_output=True)
if diff.returncode:
    fail("git-diff-check", diff.stdout.strip() or diff.stderr.strip() or f"exit {diff.returncode}")

if errors:
    print("WP0.4 PACKET SCOPE VALIDATION FAIL", file=sys.stderr)
    for error in sorted(errors):
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)
print("WP0.4 PACKET SCOPE VALIDATION PASS: allowed_paths=10 json=valid links=pass whitespace=pass diff_check=pass")
PY
```

The implementation handoff must retain the printed SHA-256 manifest with:

- base commit;
- branch/worktree;
- exact changed/untracked path list;
- every WP0.4 mutable path hash;
- identification of inherited WP0.1–WP0.3 paths as inherited, not WP0.4 edits.

Do not add a self-referential hash to this packet unless one canonical normalization is defined and tested. A sidecar manifest is unnecessary for WP0.4 unless review proves the handoff record cannot identify the candidate reliably.

## Required dossier and plan updates after implementation

Only after tests and direct validation pass:

### Decision register

Record:

- WP0.4 implementation state and exact candidate identity;
- schema/manifest/register/script/test/package paths actually changed;
- validator exit semantics and security boundaries;
- unresolved limitations or false-positive/false-negative ceilings;
- independent review outcomes when they occur;
- required human acceptance state;
- G0 remains `BLOCKED` and WP1.x unauthorized.

Do not approve a legal value, profile, vendor, G0, production, or compliance status.

### Implementation plan

Convert WP0.4 to an evidence-backed checklist recording:

- exact changed files;
- RED/GREEN commands and outcomes;
- current-dossier pass;
- incomplete/illegal-transition/missing-approval/secret/contract failures;
- candidate manifest;
- independent reviews;
- human acceptance state;
- next packet only after acceptance.

WP0.5 may be identified as the next packet, but must not be drafted, injected, or executed in the same uninterrupted run.

### This packet

Complete the implementation-record placeholders below only with real output. Do not mark an unchecked criterion complete from intent or code inspection alone.

## Independent review gates

### Gate 1 — independent specification review

Required outcome: `PASS` for the exact candidate manifest.

The reviewer must verify:

- every packet deliverable and acceptance requirement is implemented;
- schemas and validator encode the same required fields, vocabulary, approval rule, and transitions;
- current approved/specification documents pass for defensible reasons rather than exclusions;
- the deliberately incomplete, illegal transition, missing named approval, secret, and contract fixtures fail through the production validation path;
- `SPECIFIED` cannot reach `APPROVED_FOR_PROFILE` directly;
- G0 remains `BLOCKED`; WP1.x remains unauthorized;
- no forbidden path or dependency changed.

Any miss returns `FAIL` with exact path/test/requirement and keeps WP0.4 open.

### Gate 2 — independent quality/security/evidence review

Run only after specification `PASS`.

Required outcome: `APPROVED` for the same exact candidate manifest.

The reviewer must assess:

- stdlib-first and minimum necessary implementation;
- one validation implementation, no test-only duplicate;
- deterministic output and tested exit semantics;
- path traversal/symlink/repository-root handling;
- malformed input and unreadable-file separation;
- secret/contract detection coverage and secret-safe diagnostics;
- bounded false-positive behavior for ordinary contract/agreement metadata;
- status/approval logic cannot infer legal review, evidence completeness, profile approval, G0 approval, or production readiness;
- candidate identity, evidence, and handoff completeness.

Any critical or important issue returns `REQUEST_CHANGES`. Fix, rerun focused checks, regenerate candidate identity, and repeat both reviews as required.

### Gate 3 — required human acceptance

After both independent reviews pass, obtain explicit project-owner acceptance for these functions:

- Product — dossier scope, manifest coverage, packet sequencing, and no G0/WP1 expansion.
- Architecture/Backend — script boundary, path handling, exit contract, and no runtime architecture change.
- Database — confirmation that no Prisma/schema/migration/database behavior changed.
- Security/Privacy — status/approval rules, secret/contract boundary, fail-closed behavior, and diagnostic redaction.
- Operations/QA-Assurance — test coverage, candidate identity, evidence references, deterministic operation, and review handoff.
- Legal/counsel — only the validator's metadata boundary for legal-value approval; this acceptance does not approve any legal value.

Acceptance must identify the exact candidate and date. Do not infer acceptance from a prior packet, role title, test pass, or project-owner authorization to execute sequential tasks.

## Stop conditions

Stop and report `BLOCKED` if:

- a controlling dossier source conflicts on required fields or transitions;
- current documents cannot pass without changing forbidden dossier content;
- a new dependency appears necessary but is not explicitly approved;
- safe diagnostics cannot avoid printing matched values;
- required current-dossier metadata would require fabricated approval history;
- an expected inherited WP0.1–WP0.3 path changed unexpectedly;
- branch or base candidate identity cannot be reconciled;
- either independent review does not pass;
- required human acceptance is outstanding.

Even after WP0.4 acceptance, stop for project-owner review before WP0.5. G0 remains `BLOCKED`; WP1.x remains unauthorized.

## Migration, rollback, and impact

- Application/schema/data migration: none.
- Backfill: metadata registration only; no historical approval fabrication.
- Runtime concurrency: none.
- Production data/credentials/vendors/infrastructure: none.
- Production impact: none.
- Rollback: revert the allowed WP0.4 files or explicitly supersede records; never delete or rewrite historical change-control records to hide an error.
- Failure behavior: validation failure blocks dossier/gate advancement; it does not mutate documents or external systems.

## Historical implementation record — 2026-09-24

### Outcome

`IMPLEMENTED — TWENTIETH EXACT-CANDIDATE SPECIFICATION RE-REVIEW FAIL REMEDIATED; TWENTY-FIRST SPECIFICATION RE-REVIEW AND HUMAN ACCEPTANCE PENDING`

The recovered dependency-free WP0.4 candidate validates the current 18-document dossier and one initial change-control record. This is repository tooling evidence only; it is not a legal, compliance, profile, production, G0, or WP1.x approval.

### RED evidence

- Historical RED output from the predecessor session is unavailable because that session exited on HTTP 429 before preserving a complete handoff. It is not reconstructed or fabricated.
- Recovery baseline: `node --test tests/tooling/pro-compliance-dossier.test.mjs` exited `0` with `12` tests passed; direct validation exited `0` with `VALIDATION_PASSED documents=18 records=1 files=22`.
- New RED 1 command: `node --test tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; `15` tests, `13` passed, `2` failed. Failing invariants: invalid profile vocabulary was accepted and a governed JSON schema symlink could escape the repository.
- New RED 2 command: `node --test tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; `15` tests, `14` passed, `1` failed. Failing invariant: the bounded scanner missed an alphabetic bearer-token shape and a quoted `client_secret` assignment derived from the existing dossier scanners.
- Specification-remediation RED 1: the focused secret-ID regression exited `1` because `document_id = "Bearer IndependentSecretToken9999"` was printed in `id=`; the test asserted that neither the sentinel nor any token fragment may appear.
- Specification-remediation RED 2: the focused six-test review set exited `1` with all six tests failing before repair: fabricated-person owners passed, some approved top-level statuses were not normalized, missing repository-path references passed, schema `{}` exited `2`, transition metadata drift changed validator behavior instead of producing drift, and the schemas lacked the accountable-function/reference/placeholder constraints asserted by the contract test.
- Exact-candidate re-review remediation RED — schema drift: `node --test --test-name-pattern='every canonical schema contract mutation fails through production' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the first unpinned canonical mutation exited `0` instead of `1`.
- Exact-candidate re-review remediation RED — approved prose: `node --test --test-name-pattern='current approved prose prefixes normalize to APPROVED and expose contradictions' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; a manifest contradiction against `APPROVED PLANNING BASELINE ...` exited `0`.
- Exact-candidate re-review remediation RED — accountable review/approval roles: `node --test --test-name-pattern='required reviews and approval roles must be exact accountable functions' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; arbitrary review functions exited `0`.
- Exact-candidate re-review remediation RED — superseded text: `node --test --test-name-pattern='superseded_text must be explicit and non-empty' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; empty `superseded_text` exited `0`.
- Second exact-candidate re-review remediation RED — declared statuses: `node --test --test-name-pattern='all canonical declared statuses reconcile exactly and invalid prose fails closed' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the table-driven production-path test reached a deliberately contradictory underscored canonical status that exited `0` instead of `1`.
- Second exact-candidate re-review remediation RED — intermediate symlink: `node --test --test-name-pattern='repository-path references reject symlinks in intermediate components' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; an in-repository intermediate directory symlink resolved to a regular in-repository file and exited `0` instead of `1`.
- Third exact-candidate re-review remediation RED: `node --test --test-name-pattern='canonical declared statuses|full document|malformed supported|approved prose declarations|heading-form declarations|inherited evidence README' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; `6` tests ran, `2` passed and `4` failed. The prior parser case-folded/trimmed declarations, ignored declarations after line 14, stopped at the first candidate, treated malformed declaration-like lines as absence, and accepted fuzzy approved-prose prefixes.
- Fourth exact-candidate re-review remediation RED: `node --test --test-name-pattern='malformed supported status declarations fail closed without scanning ordinary prose' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the production-path regression rejected ordinary top-level bold prose beginning `Status quo`, `Status indicators:`, and `Status page:` as `DOCUMENT_STATUS_INVALID`.
- Fifth exact-candidate re-review remediation RED: `node --test --test-name-pattern='every current status prose declaration' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the table-driven production-path regression reached a current exact declaration with an arbitrary boundary mutation that exited `0` instead of `1`.
- Sixth exact-candidate re-review remediation RED: `node --test --test-name-pattern='malformed supported status declarations fail closed without scanning ordinary prose' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the table-driven production-path regression reached the first of eight malformed near-match heading/bold labels and observed exit `0` instead of the required sanitized `DOCUMENT_STATUS_INVALID` exit `1`. Ordinary `Status` prose controls were included in the same regression and remained passing.
- Seventh exact-candidate re-review remediation RED: `node --test --test-name-pattern='declaration-shaped malformed status labels' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent 59-case production-path malformed-label matrix reported exactly `27` bypasses across heading levels 1 and 3–6, tabs/mixed label whitespace, duplicated punctuation, one/three/four emphasis markers, and adjacent mixed variants. The same regression retained `11` exact/no-declaration/ordinary/fenced controls.
- Eighth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 250-case status fuzz corpus' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent corpus reported exactly `15` requirement-relevant bypasses: fullwidth-colon and em-dash heading punctuation, matching emphasis marker counts 5–8, escaped opening markers, escaped marker runs, mismatched marker counts, and mixed Unicode/marker variants. The remaining `235` cases behaved as expected.
- Ninth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 246-case extended status and fence matrix' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent extension reported exactly `40` failures: `18` underscore/mixed emphasis bypasses, `18` ATX bypasses at indentation one through three and levels one through six, `2` declarations ignored after ordinary section headings, and `2` fenced-example false positives.
- Tenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='261-case|CRLF-safe|top-level emphasis|document H1|secret-shaped unknown|canonical schema contract mutation' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; `6` tests ran and all `6` failed before repair. The 261-case extension reported `7` bypasses: three invalid backtick info strings and four indented emphasis declarations. Dedicated failures also proved CRLF fence closure, fenced-H1 rejection, secret-shaped unknown-field nondisclosure, and exact `$schema`/`$id` drift were missing.
- Eleventh exact-candidate re-review remediation RED: `node --test --test-name-pattern='document H1 accepts valid non-fenced ATX and Setext headings only' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the production path rejected the exact valid Setext H1 `Real title\n=`, proving the missing syntax rather than a fixture or tooling error. The stale review-state header was corrected only after the behavior fix and verification.
- Twelfth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 13-case Setext H1 paragraph-content edge matrix' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent matrix reproduced exactly seven false positives among 13 cases: an HTML comment, all three thematic-break marker forms, an HTML tag start, an HTML declaration, and a link-reference definition. The related prior evidence wording was corrected because the earlier H1 matrices did not exercise these non-paragraph candidate exclusions.
- Thirteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 19-case multiline H1 state matrix' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independently recreated adjudicated matrix failed exactly 9 of 19 cases: all six multiline HTML block families, multiline link-reference and footnote-like continuation content, and the valid incomplete raw-HTML paragraph Setext heading. The prior H1 evidence was corrected again because the 15/13/115 matrices did not exercise multiline HTML state, reference-definition continuation state, or incomplete-tag classification.
- Fourteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 27-case extended HTML and reference H1 state matrix' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent matrix reproduced exactly 11 failures: all four type-1 raw blocks terminated incorrectly at blank lines, four type-6/type-7 block starts with attributes/trailing content, nested tags, or complete closing tags were missed, and three complete multiline reference destination/title sequences exposed false Setext H1s. The prior 19-case evidence did not cover type-1 blank-line continuation, the expanded type-6/type-7 starts, or complete destination-plus-title continuations.
- Fifteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 11-case multiline reference and custom-tag H1 matrix' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independently recreated adjacent matrix reproduced exactly eight failures, with 3/11 cases passing: six multiline reference-title/footnote-like cases lost state across additional nonblank lines, and two malformed/incomplete custom opening tags were misclassified as complete type-7 HTML blocks.
- Sixteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='sixteenth-review reference termination and immediate custom-tag content' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent 24-case production-path matrix reproduced exactly 12 failures: four double/single/parenthesized invalid close-suffix cases, four four-space/tab indentation-termination cases, and four complete custom-tag immediate nested/closing/text cases. Escaped delimiters, whitespace-only close suffixes, well-formed definitions, blank/unrelated termination, ordinary Setext headings, valid attributes, malformed attributes, unterminated quotes, and incomplete raw HTML controls already behaved as required.
- Seventeenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='seventeenth-review shared reference indentation boundaries' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independent 41-case production-path matrix passed `27/41` and reproduced exactly 14 failures: nine double/single/parenthesized multiline title continuations with one, two, or three spaces before a tab, plus five footnote-like continuations beginning with four spaces, a bare tab, or one to three spaces before a tab. Bare-tab title termination, valid zero-to-three-space title/footnote continuation, blank termination, completed definitions, and following Setext H1 controls already behaved as required.
- Eighteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='independent 8-case malformed reference-destination corpus' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the independently recreated corpus passed `4/8` and reproduced exactly four failures: `/url(`, `/url)`, incomplete `<https://example.invalid`, and nested `<https://example.invalid<nested>>` destinations entered title continuation and suppressed a real following Setext H1.
- Nineteenth exact-candidate re-review remediation RED: `node --test --test-name-pattern='nineteenth-review 38-case reference-destination character corpus' tests/tooling/pro-compliance-dossier.test.mjs`; exit `1`; the fresh production-CLI corpus passed `30/38` and reproduced exactly eight failures: a same-line dangling bare escape; angle destinations containing ASCII space, tab, NUL, unit separator, or DEL; a next-line angle destination containing a space; and a next-line dangling bare escape. Neighboring percent-encoded, escaped-punctuation/backslash, Unicode, query/fragment, balanced-parenthesis, complete-angle, same-line/next-line, LF/CRLF/mixed, and zero-to-three-space cases already behaved as required.
- Twentieth exact-candidate specification re-review: `FAIL` on 2026-09-24 solely because the implementation-plan packet-status headline still reported the eighteenth failure remediated and nineteenth review pending. Production behavior and all independent technical corpora passed; remediation is limited to reconciling the implementation plan, decision register, and this work packet before the twenty-first exact-candidate review.

### GREEN evidence

- Focused test: `node --test tests/tooling/pro-compliance-dossier.test.mjs`; exit `0`; `51` tests, `51` passed, `0` failed. One shared bounded destination recognizer now gates every reference-destination state entry: complete angle destinations reject ASCII whitespace, C0 controls, DEL, and unmatched/nested angle syntax, while bare destinations require balanced parentheses, bounded nesting, and no dangling escape. Malformed destinations no longer establish title continuation; valid percent-encoded, escaped-punctuation/backslash, Unicode non-control, query/fragment, balanced-parenthesis, complete-angle, same-line, next-line, zero-to-three-space, LF, CRLF, and mixed-ending definitions retain prior suppression behavior.
- Direct validator: `node scripts/pro-compliance/validate-dossier.mjs`; exit `0`; `VALIDATION_PASSED documents=18 records=1 files=22`.
- Package test: `corepack pnpm test:pro-compliance-dossier`; exit `0`; `51` tests passed.
- Package validator: `corepack pnpm validate:pro-compliance-dossier`; exit `0`; `VALIDATION_PASSED documents=18 records=1 files=22`.
- JSON syntax command from this packet: exit `0`; no output.
- Node syntax: `node --check scripts/pro-compliance/validate-dossier.mjs` and `node --check tests/tooling/pro-compliance-dossier.test.mjs`; exit `0`; no output.
- Independent counted production-path harness: exit `0`; `51/51` tests passed with `1,697` validator executions, including the complete prior grammar, reference, schema-contract, trust, error, nondisclosure, current-dossier, 250-case status corpus, 261-case extension, all prior H1 matrices, the independent 8-case malformed-destination corpus, the 109-case indentation/line-ending matrix, the 15-case HTML/angle-neighbor matrix, and the fresh 38-case destination-character corpus.
- H1 matrices: exit `0`; the 15-case exact control passes 15/15, the Setext edge matrix 13/13, multiline state matrix 19/19, extended HTML/reference matrix 27/27, fifteenth-review matrix 11/11, boundary regression 20/20, sixteenth-review matrix 24/24, seventeenth-review matrix 41/41, malformed-destination corpus 8/8, destination indentation matrix 109/109, HTML/angle-neighbor matrix 15/15, fresh destination-character corpus 38/38 after reproducing exactly eight pre-fix failures, and adjacent scanner corpus `115/115` (`64` valid, `51` invalid).
- Transition/reference/diagnostic matrices: exit `0`; `TRANSITION_MATRIX_PASSED total=225 allowed=8 rejected=217`; the six-test reference-path matrix passes 6/6; and the counted diagnostic/trust/error/nondisclosure selection passes 17/17 tests with exactly 44 production-validator executions.
- Independent expanded malformed-label matrix: exit `0`; `MALFORMED_LABEL_MATRIX_PASSED rejected=59 allowed=11 total=70` across heading levels 1–6, emphasis marker counts 1–4, tabs/spaces, duplicated and variant punctuation, explicit zero-width positions, adjacent mixed variants, exact declarations, no-declaration content, ordinary prose/headings, inline examples, and fenced examples.
- Eighth-review mutation proof and restoration: reverting the shared label normalization and emphasis isolator to the prior narrow forms made the focused 250-case regression exit `1` with exactly `15` requirement-relevant bypasses; the validator restored byte-identically (`26ec6e188e089eea54bacca7335d2ee303983751e5db49de9112dbdf382d5532` before and after). Temporary execution-count instrumentation also restored the test file byte-identically (`c1c6aa67d8b0cc97aeca018b5358bbcb772c15dc3d5397833086b378dcb495c9` before and after).
- Ninth-review mutation proof and restoration: independently narrowing fence state, ATX indentation, underscore/mixed emphasis, and full-document scanning made each focused regression exit `1`; the emphasis mutation reproduced exactly `18` failures and the position mutation exactly `2`. The validator restored byte-identically at SHA-256 `e338d44f214bce1960063337711f790995a5f9f762b1b24f3da067578d709da1`; temporary execution-count instrumentation restored the test file byte-identically at SHA-256 `41e953cd8bed83f66e6611bdf0e7fd724ea9acd43b33d459108145ace618e922`.
- Tenth-review mutation proof and restoration: independently regressing CRLF fence closure, invalid backtick-info rejection, indented emphasis parsing, non-fenced H1 detection, diagnostic token sanitization, and schema identity comparison made each focused production-path regression exit `1`. The validator restored byte-identically at SHA-256 `710db945c0c0f0c469fdbc163b0de8a0670e1ebc51d1d8699c091f826721d360`; temporary execution-count instrumentation restored the test file byte-identically at SHA-256 `c5e78c5b3330971507b9407ffb6026ad05de1a1d7728a6c15cab956fbafda678`.
- Eleventh-review mutation proof and restoration: replacing the Setext-aware H1 loop with the prior ATX-only predicate made the focused H1 regression exit `1`; restoring the validator produced byte-identical SHA-256 `6ab1bdd28753127a1cd4044fc0d71fe421390c4abf1d841cc89c46a408e7175b`, after which the focused test exited `0`.
- Twelfth-review mutation proof and restoration: removing the Setext candidate-line exclusions made the 13-case edge matrix exit `1` with the same seven false positives; restoration was byte-identical at validator SHA-256 `64ab0fbe442af723ca722645516cd1382277f5766d0d854af4e88d92e91e500f`, after which the focused H1 set exited `0`.
- Thirteenth-review mutation proof and restoration: independently disabling HTML-block state, reference-definition continuation state, and complete-tag classification made the 19-case matrix exit `1` with exactly `6`, `2`, and `1` failures respectively. The validator restored byte-identically at SHA-256 `2db22e5966cd60146c50a1268f13bd728388681011dbe6bccb704742ff15d85e`; temporary execution-count instrumentation restored the test file byte-identically at SHA-256 `b039f45ffc9371e170a9a4111ba79c36e341a9653a1aa6142cff207cdc2da249`.
- Fourteenth-review mutation proof and restoration: independently restoring blank-line termination for type-1 blocks made the 27-case matrix fail in exactly 4 cases; disabling the expanded type-6/type-7 starts made it fail in exactly 4 cases; and disabling multiline title continuation made it fail in exactly 3 cases. The validator restored byte-identically at SHA-256 `4ac6dc749e70a71813f4e35ff7350b2c2ab3b6812c42c2990bc18f68aeb18aba`; counted-harness instrumentation restored the test file byte-identically at SHA-256 `9df2e153f86c1fe9a1ff37428c23a0ad7e4ca681bbc10aee6b1f26e0eb31f5e8`.
- Fifteenth-review mutation proof and restoration: independently disabling multiline reference-title/footnote continuation made the 11-case matrix fail in exactly six cases; independently restoring the permissive custom-tag fragment made it fail in exactly two malformed-tag cases. The validator restored byte-identically at SHA-256 `50b51a34199e8c30e41bba1123cfaa4b528b413a8afa12c65bae1c9d52a977d8`; counted-harness instrumentation restored the test file byte-identically at SHA-256 `ce0ad8d7a320399032da7ea2b057dbe657bb80e907e47733efb2e527e3184c39`.
- Sixteenth-review mutation proof and restoration: independently removing close-suffix validation, four-space/tab indentation termination, and immediate hyphenated custom-tag trailing-content recognition made the 24-case focused matrix fail in exactly four cases per mutation. The validator restored byte-identically at SHA-256 `828b026c29469dc05dd1955fe5db17ff9a0f9824115f93af9876ccc74bfab711`.
- Seventeenth-review mutation proof and restoration: narrowing the new shared continuation-boundary predicate to bare-tab-only termination disabled mixed space/tab and four-space handling; the 41-case matrix exited `1` with exactly 13 expected failures (`28/41` passed): nine title mixed-tab cases plus four footnote four-space/mixed-tab cases, while bare-tab termination remained active. The validator and test file restored byte-identically at SHA-256 `b534f8493fff04b57848e92341ca37675d8f8daa03451a354252508fdbbb4764` and `763361ebc8eaba35c220ef007ca7a0b100d76fae8bdb49da81e743cef21c27ce`; the restored focused matrix passed 41/41.
- Eighteenth-review mutation proof and restoration: restoring permissive `\S+` destination recognition made the focused malformed corpus fail in exactly four cases (`4/8` passed), the 109-case matrix fail in exactly 96 malformed variants, and the 15-case HTML/angle-neighbor matrix fail in exactly three malformed-angle variants. The validator and temporary counted-harness instrumentation restored byte-identically at SHA-256 `3f6782f541c1863741372f544ffae7d1092588eca0cc65ad519bd44fdfc8baf9` and `018f172bd82c36cfe99e6cb5399fd07d3667d468846f958281c711366921f959`; the restored focused matrices passed 8/8, 109/109, and 15/15.
- Nineteenth-review mutation proof and restoration: independently narrowing the angle-interior rejection to CR/LF made the fresh 38-case corpus exit `1` with exactly six forbidden-angle failures (`32/38` passed); independently removing the final dangling-escape guard made it exit `1` with exactly two bare-destination failures (`36/38` passed). The validator restored byte-identically after each mutation at SHA-256 `a6ae890e267b4216498194df90456c1e49febe6b83c9cb248614ddfdd5be1b2a`; temporary counted-harness instrumentation restored the test file byte-identically at SHA-256 `7653ab2082f465f5129cd97e6f09f5fd204a7a7133e0e49794aab2a9199fbedb`.
- Scope/link/hash validator: exit `0`; `WP0.4 PACKET SCOPE VALIDATION PASS: allowed_paths=10 json=valid links=pass whitespace=pass diff_check=pass`. Its exact final ten-path SHA-256 output is retained in the external handoff because embedding this packet's own ordinary hash would create a self-reference cycle.
- Separate `git diff --check`: exit `0`; no output.

### Candidate identity

- Base commit: `d4f2098b4940cae61b9f36345cb480bda33d990d`.
- Branch/worktree: `hermes/pro-wp0-3-controls`; `/Users/alvinlo/Desktop/Project-HitLink-wp0-3`.
- Exact WP0.4 paths: the ten paths under **Exact allowed implementation scope**; no dependency or lockfile path changed.
- SHA-256 manifest: exact ordinary-byte hashes for all ten WP0.4 paths are in the final external implementation handoff after this packet's bytes are fixed. No self-referential hash is embedded here.
- Inherited reconciliation: before WP0.4 dossier/plan updates, all seven ordinary mutable WP0.3 hashes matched `WP0.3-MUTABLE-MANIFEST-V1`; all WP0.1–WP0.3 paths outside the ten WP0.4 paths remain inherited and were not rewritten as WP0.4 work. The decision register and implementation plan are intentional WP0.4 overlaps with the prior WP0.3 mutable set.

### Acceptance evidence

- Incomplete metadata and unknown fields: production CLI fixture exits `1` with sanitized `MANIFEST_REQUIRED_FIELD` and `MANIFEST_UNKNOWN_FIELD` diagnostics.
- Secret-bearing IDs: invalid document IDs that themselves match a secret pattern exit `1` with `id=INVALID_ID`; the supplied value and token fragments do not appear.
- Declared status: each of all 15 canonical statuses matches itself and contradicts a deliberately different manifest status through the production CLI. Lowercase, mixed-case, leading/trailing ASCII whitespace, NBSP, zero-width, `BANANA`, `APPROVEDLY UNRELATED`, and `APPROVED FOR PROFILE` values fail closed without supplied-value disclosure. The full top-level Markdown scope is scanned; declarations after line 14 are reconciled; same-status duplicates pass; contradictory duplicates and cross-syntax declarations fail. Heading and emphasis boundaries are parsed structurally before detection-only normalization case-folds, explicitly removes format characters, and reduces the isolated label token to ASCII letters only. Heading levels 1–6, Unicode punctuation adjacent to the label, arbitrary positive matching or mismatched emphasis-marker counts, and escaped emphasis markers are recognized as declaration attempts when paired with an inline/next-line value shape; declaration values remain byte-exact. Ordinary `Status quo`, `Status indicators`, `Status page`, `Status history`, headings with semantic words, prose, blockquotes, lists, HTML comments, inline examples, fenced examples, and an H1 title that merely contains `status` remain non-declarations.
- Declaration absence: packet lines 177 and 179 require the inherited evidence README to remain registered and reject only a declared status that contradicts manifest status. Its lack of a top-level declaration therefore passes from schema-valid manifest metadata; a lowercase manifest status still fails, proving absence is not a schema bypass. The inherited evidence README was not edited or removed.
- References: path-shaped sources, evidence references, approval references, and prerequisite evidence must exist as files inside the repository; missing paths, non-files, final symlinks, escaping symlinks, and symlinks in any intermediate component exit `1`, while ordinary nested regular files and bounded stable IDs remain allowed.
- Schema failures and drift: a readable schema replaced by `{}` exits `1`; one table-driven production-path regression independently mutates every contract-bearing leaf in both schemas, including exact `$schema` and `$id`, roots, required arrays, `additionalProperties`, types, formats, patterns, enums, consts, item/ref bindings, conditionals, ordering metadata, and transition metadata; every mutation exits `1`.
- Owners: only the exact current accountable-function vocabulary is accepted; `owner: "Jane Doe"` exits `1` without printing the value.
- Review and approval functions: `required_review` and `approver_role` use the same exact current accountable-function vocabulary in schemas and runtime; `Jane Doe` and `banana` exit `1` without supplied-value disclosure.
- Supersession: empty and whitespace-only `superseded_text` exit `1`; `NONE — no prior text superseded` remains the valid no-prior-text sentinel.
- Duplicate/order/path safety: duplicate document IDs and normalized paths, parent traversal, registered-document symlink escape, and governed-JSON symlink escape all exit `1` through the production CLI.
- Vocabulary/date/timestamp: invalid status/profile vocabulary, impossible dates, and invalid RFC 3339 approval timestamps fail.
- Illegal transition: `SPECIFIED` to `APPROVED_FOR_PROFILE` fails even with an approval object.
- Missing prerequisite: omitting `EVIDENCE_COMPLETE` from the full profile-approval prerequisite set fails.
- Named approval: an approved legal value with no approval or role-only `Counsel` fails; `Example Reviewer` synthetic metadata passes only in a temporary fixture.
- Secret-safe rejection: private-key, AWS, GitHub, Stripe, Google, JWT, bearer, quoted credential, credentialed database URL, and Luhn-valid payment-card fixtures fail without matched-value disclosure.
- Contract-safe rejection: explicit contract marker and non-redacted `contract_text` fixtures fail without body/value disclosure; ordinary contract/agreement metadata, `[REDACTED]`, and protected-reference-only controls pass.
- Exit semantics: malformed governed JSON exits `1`; missing required file, invalid UTF-8, and unknown flag exit `2`; pass exits `0` with stdout summary and empty stderr.
- Diagnostics: repeated runs are byte-stable and diagnostics are sorted.
- Current dossier: passes with `documents=18 records=1 files=22`.
- Package contract: exact two scripts are present; no JSON-schema dependency or lockfile change was added.

### Reviews

- Independent specification review: the first review returned `FAIL` on 2026-09-23 with eight findings; the first through ninth exact-candidate re-reviews returned `FAIL` on the previously recorded gaps; the tenth exact-candidate re-review returned `FAIL` with four Important gaps and one Minor gap; and the eleventh through nineteenth exact-candidate re-reviews returned `FAIL` on 2026-09-24 with the recorded H1, reference-destination, and record-state gaps. The nineteenth review reported one Important finding: angle destinations accepted ASCII whitespace, C0 controls, and DEL, while bare destinations accepted a dangling final escape; malformed definitions could therefore enter continuation/title state and suppress a real following Setext H1. The bounded shared-destination remediation is implemented. The twentieth exact-candidate specification re-review returned `FAIL` on 2026-09-24 solely because the implementation-plan packet-status headline remained stale. That governed-record inconsistency is remediated across the three governed records; the twenty-first exact-candidate specification re-review is `PENDING`. No `PASS` or approval is claimed.
- Independent quality/security/evidence review: `PENDING`; must run only after specification `PASS` and against the same candidate.
- Product acceptance: `PENDING`.
- Architecture/Backend acceptance: `PENDING`.
- Database acceptance: `PENDING`; no Prisma, migration, database, or runtime path changed.
- Security/Privacy acceptance: `PENDING`.
- Operations/QA-Assurance acceptance: `PENDING`.
- Legal/counsel metadata-boundary acceptance: `PENDING`; no legal value is approved.

### Gate state

- WP0.4: `IMPLEMENTED — TWENTIETH EXACT-CANDIDATE SPECIFICATION RE-REVIEW FAIL REMEDIATED; TWENTY-FIRST RE-REVIEW/ACCEPTANCE PENDING`.
- G0: `BLOCKED`.
- WP1.x: unauthorized.
- Counsel-owned values: `COUNSEL_REVIEW_REQUIRED`.
- Existing legal/vendor/profile/commercial/production/accountable-human/evidence blockers: unresolved and `BLOCKED`.
- Next packet: WP0.5 identified only; stop until both independent reviews, required human acceptance, and explicit project-owner review are complete.

## Active review handoff — 2026-11-19

The September record is historical. Use the [active decision-register handoff](../decision-register-and-open-items.md#wp04-active-handoff--2026-11-19) and the current external scope and input manifests for candidate identity. Independent review and human acceptance remain pending; G0 is `BLOCKED` and WP1.x is unauthorized.

**November 20 scope review:** Independent specification review failed on the prior candidate because manifest registration could include unrelated repository Markdown. The schema and CLI now limit registrations to the Pro dossier subtree and the existing implementation plan. The CLI checks resolved paths before reading dossier Markdown, while reference-only paths retain their existing contract. The new synthetic registration test failed before the repair and passed after it. Current-dossier validation also passed. A fresh exact-candidate specification review, subsequent quality/security/evidence review, and named human acceptance are pending. G0 remains blocked.

## Implementation handoff format

Return exactly these sections:

1. **Outcome** — plain-English result and why it matters; no compliance or production claim.
2. **Exact files changed** — all and only allowed WP0.4 paths actually changed.
3. **RED/GREEN evidence** — commands, exits, and concise exact results.
4. **Validator results** — current dossier, incomplete record, illegal transition, missing approval, secret, contract, paths, diagnostics, and exit semantics.
5. **Candidate identity** — base commit, branch/worktree, exact status, hashes, and inherited-path reconciliation.
6. **Blockers/limitations** — dependency state, scanner ceilings, unresolved legal/vendor/profile/human inputs, and any blocked command.
7. **Reviews and acceptance** — exact candidate-bound outcomes; never infer a human decision.
8. **Migration/rollback/production impact** — all `none` except documentation/tooling rollback as applicable.
9. **Gate and next action** — G0 `BLOCKED`; WP1.x unauthorized; stop before WP0.5 until explicit project-owner review.

## External boundaries

No commit, deploy, remote push, merge, production credential, customer/vendor/regulator contact, live vendor action, contract acceptance, cloud provisioning, destructive operation, public claim, profile activation, Gate G0 approval, WP0.5 execution, or WP1.x work.

## Ponytail mode

PONYTAIL MODE ACTIVE — level: full.

Reuse Node standard library and the existing `node:test` pattern. Keep four data/tool layers, one validator, one test file, and no dependency. Do not trade away trust-boundary validation, fail-closed transitions, diagnostic redaction, exact-candidate evidence, or review gates for a smaller diff.