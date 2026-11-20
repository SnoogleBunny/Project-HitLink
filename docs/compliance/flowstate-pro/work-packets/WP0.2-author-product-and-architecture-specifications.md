# WP0.2 — Author the product and architecture specifications

## Status

`COMPLETED 2026-09-22 — TECHNICALLY VERIFIED; PROJECT OWNER ACCEPTED ALL FIVE REQUIRED WP0.2 REVIEW ROLES; G0 BLOCKED; PRE-EXISTING WP0.1 STATUS PATHS PRESENT`

## Goal

Turn the approved Flowstate Pro product and architecture decisions into one internally consistent, testable specification set without inventing blocked legal, vendor, policy, commercial, or production values.

## Human outcome

A reviewer can trace every Flowstate Pro product or architecture requirement from an approved decision source to its required acceptance evidence, understand the exact Pro-US v1 and later British Columbia boundaries, and identify every unresolved input as a blocker rather than an implementation default.

## Why this packet exists

WP0.1 froze the implemented Flowstate Standard boundary. WP0.2 now specifies the separate Flowstate Pro product and architecture contract that later work packets may implement only after G0 authorization.

The five target documents already contain substantial material. This packet is a reconciliation and traceability task, not permission to redesign the product, select vendors, make legal conclusions, or create Pro code.

## Authority and precedence

Use this order when sources conflict:

1. Approved entries in `decision-register-and-open-items.md` for product and architecture decisions.
2. `README.md` in this dossier for status vocabulary and document precedence.
3. `current-standard-baseline.md` and the current repository/schema for claims about implemented Standard behavior.
4. `product-spec.md` for product identity, market, modules, exclusions, and commercial boundaries after this packet.
5. `product-requirements-document.md` for numbered testable requirements after this packet.
6. `system-design.md` and `security-privacy-architecture.md` for planned architecture and security contracts after this packet.
7. `roadmap.md` for sequencing, dependency gates, evidence packages, and rollback after this packet.
8. Legal, vendor, policy, pricing, SLA, production, and customer-profile values remain blocked unless the decision register contains the required named approval.

Roadmap prose never overrides the implemented Standard baseline or an unresolved decision-register blocker.

## Required context

Read before editing:

- `docs/HIPAA_Canada_Compliance_Agent_Directive.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- every Markdown file under `docs/compliance/flowstate-pro/`
- `README.md`
- `CLAUDE.md`
- `docs/product_decisions_ledger.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/Work Packet Template.md`
- `docs/Agents/Agent Permission Matrix.md`
- `packages/db/prisma/schema.prisma` only as the implemented Standard schema source of truth

## Approved baseline that must remain stable

The specification set must preserve these approved boundaries unless the decision register explicitly says otherwise:

- Flowstate Standard and Flowstate Pro are separate products.
- Pro has separate applications, identity/session boundary, database/schema, infrastructure, storage, backups, keys, logs, monitoring, vendors, billing configuration, credentials, and production access.
- Standard roles and domain models are not Pro roles or clinical models.
- No Standard-to-Pro migration, upgrade, downgrade, shared account linking, or automatic conversion exists.
- Pro is a modular monolith, not a microservice program.
- Pro-US is the first launch lane; British Columbia private clinics are a separately gated later lane.
- One reviewed Pro codebase may deploy into isolated regional planes, but data, credentials, configuration, keys, logs, vendors, and recovery resources remain plane-specific.
- Broad clinic/provider targeting does not grant broad activation. Each customer/profile is fail-closed and individually reviewed.
- Patient self-service, a minimum safe clinical journey, and operational safeguards precede optional parity expansion.
- Jane.app and clinic-relevant Epic journeys are versioned parity benchmarks, not an unconditional launch-wide parity promise.
- G0 remains blocked. This packet cannot authorize application, schema, infrastructure, vendor, legal, production, or PHI-capable implementation.

## Blocked values that must not be filled

Keep these as explicit blockers, references, or parameterized policy/profile inputs:

- exact first Virginia or British Columbia specialty and customer/entity classifications;
- legal applicability, consent/authorization text, rights deadlines, retention schedules, breach rules, representative-authority rules, disclosure rules, and legal-hold values;
- patient CIAM vendor and residency/passkey/recovery/support commitments;
- production email, malware scanning, eligibility, clearinghouse, laboratory, pharmacy, PACS/RIS, telehealth, calendar, and later integration vendors;
- executed cloud, customer, subprocessor, BAA/DPA, transfer, and other agreements;
- precise production vendor configurations and covered services;
- British Columbia public-sector, health-authority, E-Health Act, insurer, or government-contracting applicability;
- pricing, commercial packaging, operating-envelope defaults, support promises, SLA/credit terms, public claims, and insurance limits;
- named accountable humans, qualified counsel, independent assessor, and executive approvals not already recorded.

Do not replace a blocker with a plausible default. Use `BLOCKED`, `COUNSEL_REVIEW_REQUIRED`, `OWNER_APPROVAL_REQUIRED`, or the dossier's existing status vocabulary.

## Allowed edits

Edit only:

- `docs/compliance/flowstate-pro/product-spec.md`
- `docs/compliance/flowstate-pro/product-requirements-document.md`
- `docs/compliance/flowstate-pro/roadmap.md`
- `docs/compliance/flowstate-pro/system-design.md`
- `docs/compliance/flowstate-pro/security-privacy-architecture.md`
- `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- this work packet

Do not edit application code, packages, tests, Prisma schema, migrations, configuration, infrastructure, legal/control/data/operations dossier documents, WP0.1 evidence, or any Standard product documentation.

## Deliverables

### 1. Product specification

Reconcile `product-spec.md` so it defines, without contradiction:

- product identity and Standard separation;
- target profiles, Virginia-first and BC-second lanes, and fail-closed customer activation;
- user roles and provider/patient/operator surfaces;
- Pro-US v1 modules and complete minimum safe journey;
- deferred modules and their entry conditions;
- patient self-service and provider-controlled release boundaries;
- commercial dimensions without inventing prices, promises, or universal caps;
- suspension, custody, rights, offboarding, and no-record-deletion boundaries;
- versioned Jane/Epic parity benchmark semantics;
- explicit exclusions and prohibited claims;
- owner-approval conditions and unresolved blockers.

Every normative product claim must cite one or more decision IDs/ranges from the decision register or be clearly marked as unresolved.

### 2. Product requirements document

Reconcile `product-requirements-document.md` into the authoritative numbered requirement registry.

For every `FR-*` and `NFR-*` requirement, require these explicit fields:

- `Scope`
- `Decision source`
- `Owner / approving role`
- `Requirement`
- `Acceptance evidence`
- `Failure / rollback behavior`
- `Blocked dependencies` when applicable

Requirements may share global rules, but each individual entry must still identify its decision source and acceptance evidence. Do not rely only on a document-level Q1–Q206 statement.

Preserve stable requirement IDs unless a duplicate or contradiction makes a change necessary. If an ID changes, record the mapping and reason in the decision register rather than silently renumbering.

Acceptance evidence must be concrete and later-runnable: tests, negative tests, database constraints/RLS checks, configuration/IAM read-back, browser/accessibility evidence, provider reconciliation, restore/failover exercise, audit evidence, approval metadata, or another named artifact. Do not use vague phrases such as “works correctly,” “is compliant,” or “is secure.”

### 3. System design

Reconcile `system-design.md` so planned architecture has explicit contracts for:

- three Pro applications and the modular-monolith boundary;
- provider/patient web-to-API contract and prohibition on direct Prisma/domain-policy access from web applications;
- aggregate and repository boundaries;
- tenant context, composite integrity, trusted transaction scope, PostgreSQL RLS, and connection-pool safety;
- Pro identity references, patient/representative authority, and role assignment;
- clinical note finalization/amendment/late-entry state machine;
- operation/idempotency, transactional outbox, worker lease, uncertain-provider outcome, and reconciliation states;
- append-only audit intent/outcome behavior and audit-outage mode;
- controlled file quarantine/scan/release/version state machine;
- destination gateway and fail-closed vendor/region/agreement/transfer checks;
- versioned profile/module activation state machine;
- US and Canadian regional-plane boundaries and manual same-country DR;
- failure behavior and rollback/disable paths.

Use the smallest architecture that satisfies the approved constraints. Do not add microservices, event buses, global active-active, GKE, HSM, speculative connectors, or generic framework layers.

### 4. Security and privacy architecture

Reconcile `security-privacy-architecture.md` so it contains:

- explicit trust boundaries and data-bearing crossings;
- customer, patient, representative, Flowstate workforce, support, vendor, CI/CD, and recovery identities;
- deny-by-default access context and policy inputs;
- repository/RLS and field/projection safeguards;
- MFA/session/recovery/step-up/JIT support boundaries without selecting blocked CIAM values;
- clinical break-glass versus Flowstate support separation;
- audit, logging, redaction, alerting, and emergency-audit behavior;
- encryption/key/secret boundaries and no-plaintext-fallback behavior;
- file and object-storage safeguards;
- lifecycle, retention, hold, rights, disclosure, and offboarding integration points without selecting legal values;
- US/Canada isolation and cross-border/vendor review boundaries;
- a threat model with required control response and evidence;
- a fail-closed matrix consistent with `system-design.md`;
- activation evidence and non-claims.

Do not state that HIPAA, PIPEDA, PIPA, or another legal regime is satisfied. Technical safeguards are specifications, not legal conclusions or operational proof.

### 5. Roadmap

Reconcile `roadmap.md` so milestone and gate sequencing matches the implementation plan:

- M0/G0 dossier approval before implementation;
- isolated Pro foundation before clinical modules;
- complete minimum safe patient/clinical journey before US synthetic staging assurance;
- US operational evidence before a Virginia pilot;
- BC as a separate legal/vendor/regional evidence lane;
- later competitor-parity waves after stable core evidence;
- exact entry dependencies, exit gates, evidence, rollback/stop criteria, and approving roles;
- blocked expert/procurement inputs and critical path;
- no calendar-date or production-readiness promise unsupported by approved inputs.

Map roadmap milestones to the implementation-plan work packets without silently changing the work-packet order or G0–G4 gates.

### 6. Decision register and implementation plan

Update `decision-register-and-open-items.md` only to:

- record reconciled product/architecture decisions and document mappings;
- expose contradictions or unresolved inputs discovered during reconciliation;
- preserve legal/vendor/production blockers and required human approvals;
- record any requirement-ID mapping or superseded wording with reason.

Update the implementation plan's WP0.2 section into a checklist. Check an item only after its evidence exists. Record:

- exact files changed;
- validation commands and outcomes;
- unresolved blockers and contradictions;
- required reviewers;
- next authorized packet (`WP0.3`) only if WP0.2 passes its reviews;
- G0 remains `BLOCKED`.

## Required working method

1. Read every required context file before editing.
2. Inventory all existing `FR-*` and `NFR-*` IDs and every normative `MUST`, `MUST NOT`, and release/gate claim in the five target documents.
3. Build a temporary reconciliation table in memory or scratch space: claim/requirement, decision source, owning document, acceptance evidence, blocked dependency, and conflicting references.
4. Resolve only editorial/architectural contradictions supported by approved decisions.
5. When approved sources do not resolve a contradiction, record it as a blocker; do not choose a side.
6. Reuse existing document structure and terminology. Prefer targeted edits over rewrites.
7. Keep requirements testable and avoid duplicating the same normative contract across multiple documents. Put the authoritative rule in the designated document and link/summarize elsewhere.
8. Update the decision register and implementation-plan checklist after the five target documents are internally consistent.
9. Run all required validation and independently review the complete diff.
10. Update this packet's status and acceptance checklist only after validation.

## Required validation

Run from the repository root and preserve real outputs:

1. `git diff --check`
2. `git status --short -uall`
3. A deterministic requirement-registry check that:
   - enumerates every `FR-*` and `NFR-*` heading;
   - rejects duplicate IDs;
   - rejects a requirement missing `Scope`, `Decision source`, `Owner / approving role`, `Requirement`, `Acceptance evidence`, or `Failure / rollback behavior`;
   - reports requirement counts by prefix.
4. A deterministic cross-document check that:
   - confirms all five target documents exist;
   - confirms Standard/Pro separation, G0 blocked state, Virginia-first/BC-second sequencing, and no Standard migration are represented consistently;
   - confirms blocked values are not represented as approved selections;
   - confirms relative Markdown links added or changed resolve.
5. A bounded status-vocabulary scan for unsupported claims such as `COMPLIANT`, `PRODUCTION_READY`, or `APPROVED_FOR_PROFILE` without the required explicit blocker/non-claim context.
6. A bounded secret/regulated-data pattern scan over changed files. Do not print matched secret values; fail with path and pattern category only.
7. Complete diff review for scope, contradictions, duplicated authority, permissive defaults, and legal/production overclaims.

Do not report unavailable root build/test commands as passing. This documentation packet does not require installing dependencies or modifying the environment merely to run application gates.

## Acceptance requirements

- [x] All five target documents are reconciled against approved decision-register entries.
- [x] Every `FR-*` and `NFR-*` entry has the required traceability and evidence fields; the semantic audit records an exact 50-requirement blocked-dependency set, including FR-029 and FR-031, without treating exact-set validation as proof of audit correctness.
- [x] Requirement IDs are unique and stable; no mapping was required.
- [x] Product identity, roles, surfaces, modules, v1 journey, deferred scope, exclusions, and commercial boundaries are consistent.
- [x] Aggregate, API, tenancy/RLS, identity-reference, clinical-integrity, outbox/job, audit, file, destination, activation, regional, and failure contracts are explicit and consistent; `LEASED` reauthorization can block before submission, lease ownership is CAS-enforced, and expiry/reclaim is persisted and reconciled.
- [x] Threat-model and fail-closed behavior match the system design.
- [x] Roadmap milestones and gates map consistently to the implementation plan.
- [x] Standard/Pro separation and no-Standard-migration boundaries remain explicit everywhere.
- [x] Virginia-first and BC-private-clinic-second sequencing remains explicit; BC does not inherit Virginia approval.
- [x] Blocked legal, vendor, policy, commercial, production, customer-profile, and accountable-human values remain blocked.
- [x] No document claims legal compliance, operational exercise, evidence completeness, production readiness, or profile approval.
- [x] The decision register records reconciled wording, document mappings, the absence of ID remapping, and unresolved blockers.
- [x] The implementation plan checks only technically proven WP0.2 criteria and identifies WP0.3 as the next packet after required human review acceptance.
- [x] G0 remains `BLOCKED`; no Milestone 1 implementation is authorized.
- [x] Root `git status --short -uall` contains inherited WP0.1 paths outside WP0.2's allowed edit list; the validator proves those nine paths are byte-identical to the WP0.1 handoff and the WP0.2 edit set contains only the eight allowed paths.
- [x] No application, schema, migration, test, runtime, infrastructure, legal/control/data/operations dossier, or WP0.1 evidence file was changed by WP0.2.

### Validation record — 2026-09-22

Run this durable validator from the repository root. It uses repository-relative paths, checks the eight WP0.2 paths, and proves the nine inherited WP0.1 paths remain byte-identical to the recorded handoff without printing secret values:

```bash
python3 - <<'PY'
from collections import Counter
from hashlib import sha256
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path.cwd()
DOSSIER = Path("docs/compliance/flowstate-pro")
PLAN = Path("docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md")
PACKET = DOSSIER / "work-packets/WP0.2-author-product-and-architecture-specifications.md"
PRODUCT = DOSSIER / "product-spec.md"
PRD = DOSSIER / "product-requirements-document.md"
ROADMAP = DOSSIER / "roadmap.md"
SYSTEM = DOSSIER / "system-design.md"
SECURITY = DOSSIER / "security-privacy-architecture.md"
TARGETS = [PRODUCT, PRD, ROADMAP, SYSTEM, SECURITY]
WP02 = set(TARGETS + [DOSSIER / "decision-register-and-open-items.md", PLAN, PACKET])
INHERITED = {
    DOSSIER / "control-and-evidence-matrix.md": "b044346082945c38e33c3466da25dfaebc30e8305439540fc61518f6192be8e0",
    DOSSIER / "data-classification-and-flows.md": "c3d19252d590020561a7a3b97d99f5a3e36906668d832e275639ecbc95ffc598",
    DOSSIER / "current-standard-baseline.md": "2d5cc1e5a2f092b39601885b1e3f25d100e34894648b912ea7cb80eb89497bab",
    DOSSIER / "evidence/README.md": "d76dee09203d52a62b76cfd95465c315289c23299df95a279c99bfb55c2160a4",
    DOSSIER / "evidence/wp0.1-standard-baseline/candidate-manifest.txt": "bcc7aae1c21d36bb41a9e9f0481353be9e321770334d7ea9dd5a1b5791b29568",
    DOSSIER / "evidence/wp0.1-standard-baseline/prisma-inventory.txt": "ecc37f046fc56a9609df6f18ee38dfaf957f5969d8c75d867f7cbe38e2c798ee",
    DOSSIER / "evidence/wp0.1-standard-baseline/root-command-results.txt": "7c77a60afdef3547bf7d6093d845ef18676ca81ba300c92e72efb3830bc7d431",
    DOSSIER / "evidence/wp0.1-standard-baseline/snapshot-and-toolchain.txt": "e451ef6cdd0868b155d0995d39ca9f658a72ca794dcf8f2f7896ec3fe78f383e",
    DOSSIER / "work-packets/WP0.1-freeze-evidence-and-boundaries.md": "3517e9f0eb37cbb1d0e2e98eb1241c39e774dadc3d8ddeac80fda2b3ec0a9537",
}
EXPECTED_IDS = [*(f"FR-{n:03d}" for n in range(1, 45)), *(f"NFR-{n:03d}" for n in range(1, 21))]
# This is the documented result of the 64-requirement semantic audit; exact-set
# validation detects drift but is not proof that the audit was complete or correct.
# Entries directly depend on unresolved legal, vendor, policy, commercial,
# production, profile, evidence-system, or accountable-human inputs.
EXPECTED_BLOCKED_DEPENDENCIES = {
    "FR-003", "FR-004", "FR-005", "FR-007", "FR-009", "FR-010", "FR-012", "FR-013",
    "FR-014", "FR-015", "FR-016", "FR-017", "FR-018", "FR-019", "FR-020", "FR-021",
    "FR-022", "FR-024", "FR-025", "FR-026", "FR-027", "FR-028", "FR-029", "FR-030",
    "FR-031", "FR-032", "FR-033", "FR-034", "FR-035", "FR-036", "FR-037", "FR-038",
    "FR-039", "FR-040", "FR-041", "FR-042", "FR-044", "NFR-004", "NFR-005", "NFR-006",
    "NFR-007", "NFR-008", "NFR-010", "NFR-012", "NFR-015", "NFR-016", "NFR-017", "NFR-018",
    "NFR-019", "NFR-020",
}
REQUIRED_FIELDS = [
    "Scope", "Decision source", "Owner / approving role", "Requirement",
    "Acceptance evidence", "Failure / rollback behavior",
]
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

def require(path, label, pattern):
    if not re.search(pattern, prose(path), re.I | re.S):
        fail("document-contract", f"{path}: missing {label}")

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

# Exact requirement registry, non-empty fields, decision references, and blockers.
prd = text(PRD)
heads = list(re.finditer(r"^####\s+((?:FR|NFR)-\d{3})\b", prd, re.M))
ids = [match.group(1) for match in heads]
duplicates = sorted(identifier for identifier, count in Counter(ids).items() if count > 1)
if duplicates:
    fail("duplicate-requirement", ", ".join(duplicates))
if ids != EXPECTED_IDS:
    fail(
        "requirement-id-set",
        f"missing={sorted(set(EXPECTED_IDS) - set(ids))} unexpected={sorted(set(ids) - set(EXPECTED_IDS))} order_exact={ids == EXPECTED_IDS}",
    )
blocked_ids = set()
for index, match in enumerate(heads):
    identifier = match.group(1)
    section = prd[match.end() : heads[index + 1].start() if index + 1 < len(heads) else len(prd)]
    labels = list(re.finditer(r"^\*\*([^*\n]+):\*\*[ \t]*", section, re.M))
    values = {}
    for label_index, label_match in enumerate(labels):
        name = label_match.group(1)
        end = labels[label_index + 1].start() if label_index + 1 < len(labels) else len(section)
        value = section[label_match.end() : end].strip()
        if name in values:
            fail("duplicate-requirement-field", f"{identifier} {name}")
        values[name] = value
    for field in REQUIRED_FIELDS:
        if field not in values or not re.search(r"\w", values[field], re.UNICODE):
            fail("requirement-field", f"{identifier} missing/empty {field}")
    source = values.get("Decision source", "")
    tokens = [token.strip() for token in source.split(",") if token.strip()]
    if not tokens:
        fail("decision-reference", f"{identifier} has no decision reference")
    for token in tokens:
        if token == "UNRESOLVED":
            continue
        reference = re.fullmatch(r"Q(\d{1,3})(?:[–-]Q?(\d{1,3}))?", token)
        if not reference:
            fail("decision-reference", f"{identifier} invalid syntax")
            continue
        start = int(reference.group(1))
        end = int(reference.group(2) or start)
        if not (1 <= start <= end <= 206):
            fail("decision-reference", f"{identifier} out of range")
    if "Blocked dependencies" in values:
        blocked_ids.add(identifier)
        if not re.search(r"\w", values["Blocked dependencies"], re.UNICODE):
            fail("requirement-field", f"{identifier} empty Blocked dependencies")
if blocked_ids != EXPECTED_BLOCKED_DEPENDENCIES:
    fail(
        "blocked-dependency-set",
        f"missing={sorted(EXPECTED_BLOCKED_DEPENDENCIES - blocked_ids)} unexpected={sorted(blocked_ids - EXPECTED_BLOCKED_DEPENDENCIES)}",
    )
counts = Counter(identifier.split("-")[0] for identifier in ids)

# Document-specific contracts; broad combined phrases cannot satisfy these checks.
for path in TARGETS:
    first_lines = "\n".join(text(path).splitlines()[:14])
    if not re.search(r"^\*\*Status:\*\*.*\bSPECIFIED\b.*G0.*`BLOCKED`", first_lines, re.I | re.M):
        fail("status", f"{path}: top status must be SPECIFIED with G0 BLOCKED")

# Rendering is part of the contract across all eight WP0.2 documents, not just
# the five target headers. Adjacent bold metadata fields require a blank line.
for path in WP02:
    if re.search(r"^\*\*[^\n]+:\*\*[^\n]*\n\*\*[^\n]+:\*\*", text(path), re.M):
        fail("metadata-rendering", f"{path}: adjacent metadata lines need blank separation")

require(PRODUCT, "separate-product boundary", r"not an edition, upgrade, feature flag, or data mode of Flowstate Standard")
require(PRODUCT, "no Standard migration", r"no Standard-to-Pro migration")
require(PRODUCT, "Virginia-first/BC-second", r"Virginia-first and BC-private-clinic-second")
require(PRODUCT, "narrow activation", r"individually gated activation")
require(PRODUCT, "product blockers", r"Unresolved product inputs.*patient CIAM.*production vendors.*pric(?:e|ing).*named accountable humans")

require(PRD, "exact release lanes", r"Release target:.*Virginia.*Canadian lane:.*British Columbia")
require(PRD, "blocked-status mapping", r"`BLOCKED` is the dossier.*not a runtime activation state.*`REVIEW_BLOCKED` is the runtime activation state")
require(PRD, "no Standard migration", r"MUST NOT offer Standard-to-Pro migration")
require(PRD, "Virginia then BC acceptance", r"Pro-US v1 release acceptance.*BC private-clinic release acceptance.*BC does not inherit Virginia approval")
require(PRD, "open blocked inputs", r"Open owner/expert inputs.*first activated Virginia and BC.*patient CIAM.*production email.*exact public")

require(ROADMAP, "G0 before implementation", r"G0 must be approved by named humans before any Milestone 1 implementation.*Current state: `BLOCKED`")
require(ROADMAP, "complete journey before US assurance", r"M2 complete clinical/patient journey` → `M3 US operational evidence` → `M4 Virginia pilot")
require(ROADMAP, "BC separate lane", r"BC requires M1/M2 reusable code plus its own legal/vendor/regional M3-equivalent evidence")
require(ROADMAP, "no Standard migration", r"No Standard migration, downgrade, shared identity/session/data/billing")
require(ROADMAP, "blocked-status mapping", r"`BLOCKED` is the dossier/work-packet/requirement-dependency/release-gate status.*`REVIEW_BLOCKED` is the corresponding runtime activation state")
require(ROADMAP, "critical blockers", r"Blocking expert/procurement inputs.*Exact Virginia and BC applicant classifications.*Patient CIAM.*Pricing.*Named accountable humans")

require(SYSTEM, "three-app boundary", r"Pro Provider Web.*Pro Patient Web.*Pro API")
require(SYSTEM, "modular monolith", r"one regional \*\*modular monolith\*\*.*No microservice split")
require(SYSTEM, "web-to-API boundary", r"presentation clients.*calls the Pro API")
require(SYSTEM, "repository boundary", r"Repositories are the only Prisma boundary")
require(SYSTEM, "RLS boundary", r"PostgreSQL RLS")
require(SYSTEM, "retryable/exhaustion state", r"`FAILED_RETRYABLE`.*retry budget.*exhaustion moves to `FAILED_TERMINAL`")
require(SYSTEM, "leased reauthorization block", r"lease owner MUST reauthorize.*immediately before provider submission.*CAS the current `LEASED` version to `BLOCKED`.*no provider call")
require(SYSTEM, "lease ownership CAS", r"compare-and-set matching the current operation version, lease owner, and an unexpired lease.*stale or replaced owner cannot submit")
require(SYSTEM, "persisted lease-expiry recovery", r"Lease expiry itself is a persisted recovery event.*recovery worker.*CAS the matching `LEASED` version and expired owner to `UNCERTAIN`.*`FAILED_RETRYABLE` only when durable evidence proves.*Reclaim occurs only through the persisted `FAILED_RETRYABLE` backoff transition to `PENDING`")
require(SYSTEM, "cancellation state", r"`CANCELLED`.*authorized cancellation.*Cancellation is allowed only from `PENDING` or `BLOCKED`")
require(SYSTEM, "uncertain reconciliation", r"`UNCERTAIN` never blind-retries.*Uncertain-provider reconciliation.*provider reference")
require(SYSTEM, "operation audit/idempotency", r"Duplicate deliveries, workers, or callbacks reuse the same idempotency record.*cannot create a second effect or terminal outcome")
require(SYSTEM, "activation status mapping", r"`BLOCKED` in the dossier.*not a second runtime activation state.*runtime state is `REVIEW_BLOCKED`")
require(SYSTEM, "no Standard migration", r"No Standard-to-Pro migration exists")

require(SECURITY, "trust boundaries", r"## 2\. Trust boundaries.*Every crossing is data-bearing")
require(SECURITY, "deny-by-default", r"### Deny-by-default policy.*Unknown action.*denies")
require(SECURITY, "repository/RLS safeguards", r"### Repositories and RLS.*forced RLS.*Connection-pool tests")
require(SECURITY, "fail-closed matrix", r"## 12\. Fail-closed matrix.*Provider response.*Mark uncertain and reconcile")
require(SECURITY, "no Standard migration", r"No Standard-to-Pro migration, shared account linking, or automatic conversion exists")
require(SECURITY, "activation blockers", r"Missing human roles, policies, training.*contracts, vendor approval.*are blockers")

# Contradictory sequencing/approval/linking and unsupported claims across all
# bounded changed-file prose. Fenced validator examples are intentionally excluded.
semantic_patterns = {
    "bc-before-virginia": re.compile(r"(?:British Columbia|\bBC\b).{0,50}(?:launches?|comes?|is)\s+(?:first|before Virginia)", re.I),
    "virginia-after-bc": re.compile(r"Virginia.{0,50}(?:launches?|comes?|is)\s+(?:second|after (?:BC|British Columbia))", re.I),
    "bc-inherits-virginia": re.compile(r"(?:BC|British Columbia).{0,80}(?:inherits?|reuses?|uses)\s+Virginia approval", re.I),
    "g0-approved": re.compile(r"\bG0\b.{0,40}\b(?:is|remains|has been)\s+(?:approved|passed|open)\b", re.I),
    "standard-migration-allowed": re.compile(r"\b(?:supports?|allows?|offers?|provides?|has)\s+(?:a\s+)?Standard-to-Pro\s+(?:migration|upgrade|conversion|link)", re.I),
    "standard-linking-allowed": re.compile(r"\bStandard and Pro\b.{0,80}\bshare(?:d|s)?\b.{0,30}\b(?:account|identity|session|database|billing)\b", re.I),
    "compliance-claim": re.compile(
        r"\b(?:Flowstate(?: Pro)?|the (?:platform|product|service|system)|we)(?:'s)?\s+"
        r"(?:(?:is|are)\s+(?:fully\s+)?(?:(?:HIPAA|PIPEDA|PIPA)[ -]?)?compliant"
        r"|(?:is|are)\s+compliant\s+with\s+(?:HIPAA|PIPEDA|PIPA)"
        r"|(?:satisf(?:y|ies|ied)|meet(?:s)?|met|fulfills?|(?:has|have)\s+satisfied)\s+"
        r"(?:(?:HIPAA|PIPEDA|PIPA)\s+)?(?:compliance\s+)?requirements"
        r"|(?:HIPAA|PIPEDA|PIPA)?\s*compliance\s+(?:is|has been)\s+satisfied)\b",
        re.I,
    ),
    "production-ready-claim": re.compile(
        r"\b(?:Flowstate(?: Pro)?|the (?:platform|product|service|system)|we)\s+"
        r"(?:is|are|has been)\s+(?:production[- ]ready|ready for production)\b",
        re.I,
    ),
    "production-approval-claim": re.compile(
        r"\b(?:Flowstate(?: Pro)?|the (?:platform|product|service|system)|we)\s+"
        r"(?:(?:is|are|has been)\s+(?:production[- ]approved|approved for production|approved for profile activation)"
        r"|(?:has|have)\s+(?:been\s+granted\s+)?(?:production approval|approval for production))\b",
        re.I,
    ),
}
negation = re.compile(r"\b(?:no|not|never|without|cannot|can't|does not|doesn't|must not|mustn't|prohibit(?:s|ed)?|blocked)\b", re.I)

def semantic_findings(body):
    findings = []
    for line_number, line in enumerate(body.splitlines(), 1):
        for category, pattern in semantic_patterns.items():
            for match in pattern.finditer(line):
                if negation.search(line[max(0, match.start() - 90) : match.end()]):
                    continue
                findings.append((category, line_number))
    return findings

unsupported_status = re.compile(
    r"^\*\*Status:\*\*\s*(?P<tick>`?)(?:COMPLIANT|PRODUCTION_READY|APPROVED_FOR_PROFILE)\b(?P=tick)",
    re.I | re.M,
)

def has_unsupported_status(body):
    first_lines = "\n".join(body.splitlines()[:12])
    return bool(unsupported_status.search(first_lines))

for path in WP02:
    body = prose(path)
    for category, line_number in semantic_findings(body):
        fail(category, f"{path}:{line_number}")
    if has_unsupported_status(body):
        fail("unsupported-status", f"{path}: unsupported top-level status claim")

# Mutation self-tests exercise the same scanner during every normal validation.
BAD_CLAIM_MUTATIONS = {
    "satisfies-hipaa": ("Flowstate Pro satisfies HIPAA requirements.", "compliance-claim"),
    "has-satisfied-hipaa": ("Flowstate Pro has satisfied HIPAA requirements.", "compliance-claim"),
    "hipaa-compliant": ("Flowstate Pro is HIPAA-compliant.", "compliance-claim"),
    "compliance-satisfied": ("Flowstate Pro HIPAA compliance is satisfied.", "compliance-claim"),
    "ready-for-production": ("The platform is ready for production.", "production-ready-claim"),
    "production-ready": ("Flowstate Pro is production-ready.", "production-ready-claim"),
    "has-production-approval": ("Flowstate Pro has production approval.", "production-approval-claim"),
    "granted-production-approval": ("Flowstate Pro has been granted production approval.", "production-approval-claim"),
    "approved-for-production": ("Flowstate Pro is approved for production.", "production-approval-claim"),
    "production-approved": ("Flowstate Pro is production-approved.", "production-approval-claim"),
}
ALLOWED_CLAIM_MUTATIONS = [
    "Flowstate Pro is not HIPAA-compliant.",
    "Flowstate Pro does not satisfy HIPAA requirements.",
    "The platform is not ready for production.",
    "Flowstate Pro has no production approval.",
    "This specification does not establish production approval or compliance.",
    "Production readiness remains blocked pending named approvals.",
]
BAD_STATUS_MUTATIONS = {
    "backticked-compliant": "**Status:** `COMPLIANT`",
    "backticked-production-ready": "**Status:** `PRODUCTION_READY`",
    "backticked-approved-for-profile": "**Status:** `APPROVED_FOR_PROFILE`",
}
for label, (sample, expected_category) in BAD_CLAIM_MUTATIONS.items():
    categories = {category for category, _ in semantic_findings(sample)}
    if expected_category not in categories:
        fail("claim-mutation", f"bad phrase escaped scanner: {label}")
for index, sample in enumerate(ALLOWED_CLAIM_MUTATIONS, 1):
    if semantic_findings(sample):
        fail("claim-mutation", f"allowed negative/non-claim rejected: {index}")
for label, sample in BAD_STATUS_MUTATIONS.items():
    if not has_unsupported_status(sample):
        fail("status-mutation", f"bad status escaped status check: {label}")

# Relative Markdown links in every bounded changed file.
for path in WP02:
    for destination in re.findall(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", text(path)):
        target = destination.split("#", 1)[0].split("?", 1)[0].strip().strip("<>")
        if not target or re.match(r"^[a-z][a-z0-9+.-]*:", target, re.I):
            continue
        if not (path.parent / target).resolve().exists():
            fail("broken-link", f"{path}: {target}")

# Secret/private-key/value and prohibited regulated/customer payload patterns.
# Scan full content, including fenced blocks; report category/path only.
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
for path in WP02:
    body = text(path)
    for category, pattern in secret_patterns.items():
        if pattern.search(body):
            fail("secret-or-regulated-pattern", f"{path}: {category}")
    for candidate in re.findall(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)", body):
        if luhn(candidate):
            fail("secret-or-regulated-pattern", f"{path}: payment-card-number")
            break

# Scope, inherited byte identity, whitespace, and tracked diff.
status = subprocess.run(
    ["git", "status", "--porcelain=v1", "-uall"], text=True, capture_output=True, check=True
)
status_paths = {Path(line[3:]) for line in status.stdout.splitlines() if line}
expected_paths = WP02 | set(INHERITED)
if status_paths != expected_paths:
    fail(
        "scope",
        f"unexpected={sorted(map(str, status_paths - expected_paths))} missing={sorted(map(str, expected_paths - status_paths))}",
    )
for path, expected_hash in INHERITED.items():
    actual_hash = sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    if actual_hash != expected_hash:
        fail("inherited-wp0.1", path.as_posix())
for path in WP02:
    if path.is_file():
        for number, line in enumerate(text(path).splitlines(), 1):
            if line.endswith((" ", "\t")):
                fail("trailing-whitespace", f"{path}:{number}")
diff = subprocess.run(["git", "diff", "--check"], text=True, capture_output=True)
if diff.returncode:
    fail("git-diff-check", diff.stdout.strip() or diff.stderr.strip() or f"exit {diff.returncode}")

if errors:
    print("WP0.2 VALIDATION FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)
print(f"WP0.2 VALIDATION PASS: FR={counts['FR']} NFR={counts['NFR']} total={len(ids)} exact_ids=pass fields=nonempty decision_refs=valid blocked_dependencies={len(blocked_ids)}-exact")
print(f"targets={len(TARGETS)} wp0.2_paths={len(WP02)} inherited_wp0.1_paths={len(INHERITED)} inherited_hashes=match")
print(f"claim_mutations=pass bad_rejected={len(BAD_CLAIM_MUTATIONS)} allowed_negative_nonclaim={len(ALLOWED_CLAIM_MUTATIONS)} status_mutations=pass backticked_rejected={len(BAD_STATUS_MUTATIONS)} metadata_rendering=pass")
print("document_contracts=pass contradictions=pass links=pass status_vocabulary=pass secret_regulated_patterns=pass scope=pass diff_check=pass")

PY
```

Exact output from the final run:

```text
WP0.2 VALIDATION PASS: FR=44 NFR=20 total=64 exact_ids=pass fields=nonempty decision_refs=valid blocked_dependencies=50-exact
targets=5 wp0.2_paths=8 inherited_wp0.1_paths=9 inherited_hashes=match
claim_mutations=pass bad_rejected=10 allowed_negative_nonclaim=6 status_mutations=pass backticked_rejected=3 metadata_rendering=pass
document_contracts=pass contradictions=pass links=pass status_vocabulary=pass secret_regulated_patterns=pass scope=pass diff_check=pass
```

`git diff --check` exact output from the final separate run: no output; exit 0.

`git status --short -uall` reported the eight WP0.2 paths and nine inherited byte-identical WP0.1 paths expected by the validator. Complete review of the eight WP0.2 paths found no remaining operation-state/lease-ownership gap, `BLOCKED`/`REVIEW_BLOCKED` ambiguity, blocked-dependency omission, metadata-rendering inconsistency, stale dossier status, contradictory lane/gate/linking claim, unsupported production/compliance claim, or fenced-content scan exemption. The expected 50-requirement blocker set is the documented result of the semantic audit and a drift check, not proof by set equality alone.

## Required reviewers

Technical completion does not provide final human approval. Record these reviews as open unless a named human actually performs them:

- Product owner / CEO — product scope, roles, modules, v1 journey, exclusions, parity and commercial boundaries.
- Architecture / Backend — API, aggregate, state-machine, job, destination, and failure contracts.
- Database — tenancy, transaction context, composite integrity, RLS, clinical immutability, audit, and lifecycle implications.
- Security/Privacy — threat model, trust boundaries, fail-closed behavior, identity/support/file/logging/encryption constraints.
- Operations / QA-Assurance — roadmap gates, evidence, exercises, rollback, deterministic validation, and blocked-state accuracy.
- Legal/counsel is not asked to approve values in WP0.2; counsel-owned values remain blocked for WP0.3/G0.

## Migration, backfill, concurrency, audit, rollback, and production impact

- Migration/backfill: none; documentation only.
- Concurrency: specify required future behavior only; no runtime implementation.
- Audit: specify intent/outcome, append-only, outage, reconciliation, and evidence contracts without claiming implementation.
- Rollback: revert or supersede only this packet's allowed documentation changes. Preserve WP0.1 evidence unchanged.
- Production impact: none.

## Constraints

- Do not create or modify Pro or Standard source code, tests, schemas, migrations, configuration, infrastructure, or runtime behavior.
- Do not change WP0.1 evidence or its frozen candidate artifacts.
- Do not modify legal, data-classification, control/evidence, operations/governance, or competitor-parity documents; those belong to WP0.3.
- Do not select vendors, legal values, agreements, production regions beyond already approved architecture facts, pricing, SLA, support promises, or public claims.
- Do not use production/customer data, databases, credentials, vendor consoles, cloud provisioning, deployment, remote push, or external communication.
- Do not commit, push, merge, deploy, or contact a person/vendor.
- Preserve stable identifiers and exact blocked status.
- Keep the diff to the fewest files and shortest wording that make the five specifications complete and consistent.

## External boundaries

No deploy, remote push, merge, outreach, production credential, customer/vendor contact, live Stripe action, cloud provisioning, destructive data operation, pricing/market commitment, legal conclusion, public compliance claim, or production/profile activation.

## Handoff format

Return:

1. plain-English outcome and why it matters;
2. exact changed files;
3. requirement counts and traceability results;
4. contradictions resolved and the approved decision sources used;
5. unresolved blockers and required human reviewers;
6. exact validation commands and real outcomes;
7. production, migration, and rollback impact;
8. final `git status --short -uall`;
9. next authorized packet and gate state.

## Ponytail mode

PONYTAIL MODE ACTIVE — level: full

Apply the ladder after tracing the documents. Reuse the existing specification structure. Do not add frameworks, schemas, generators, or tooling in WP0.2. The smallest correct reconciliation is preferred, but security/privacy boundaries, blocked values, evidence traceability, and required acceptance detail must not be simplified away.
