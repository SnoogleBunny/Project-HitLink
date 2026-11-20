# WP0.1 — Freeze evidence and boundaries

## Status

`TECHNICALLY_VERIFIED`

## Goal

Create a reproducible, redacted snapshot of the implemented Flowstate Standard repository boundary so later Flowstate Pro work cannot mistake planned Pro behavior, roadmap concepts, or stale counts for implemented facts.

## Human outcome

Reviewers can reproduce the exact Standard baseline from the named Git revision, see all pre-existing workspace limitations and failing gates without concealment, distinguish implemented/schema-only/historical/unknown claims, and confirm that no Flowstate Pro clinical model or control is represented as implemented.

## Assigned profile

Hermes implementation subagent operating as a scoped documentation and read-only verification worker.

## Required consultations and review routing

- Database review for schema/model/enum/migration counts and database-access inventory.
- Backend review for production call-site classification.
- Security/Privacy review for sensitive-store and trust-boundary wording.
- QA/Assurance review for reproducibility, redaction, command output, and hidden-failure checks.
- CEO/Product owner review remains required before Gate G0; the implementer cannot approve Gate G0.

## Required skills and dependency permissions

- Follow `software-development:privacy-security-code-audit` principles: observed facts, gaps, and external unknowns remain separate.
- Follow `software-development:audit-remediation-workflow`: no checked completion without evidence.
- Follow `software-development:minimal-change-development` and Ponytail full mode below.
- No UI skill is required. Do not add dependencies.

## Project root and branch/worktree

- Project root: `/Users/alvinlo/Desktop/Project-HitLink-wp0-1`
- Branch: `hermes/pro-wp0-1-baseline`
- Base revision: `d4f2098`
- This is an isolated worktree. Preserve the unrelated `.DS_Store` modification in the original worktree; do not copy or modify it here.

## Objective and safety outcome

Freeze only evidence about the existing Standard product. The packet must reduce the risk of Pro work reusing Standard identities, roles, schema, stores, billing, sessions, files, migrations, or direct database-access patterns as clinical foundations.

## Context

Flowstate Standard is the implemented one-location MMA/fitness product. Flowstate Pro is a planned, separate clinical-record product with separate applications, identity, sessions, database, infrastructure, vendors, billing configuration, keys, logs, backups, and production access. Phase 0 permits documentation and deterministic read-only/non-production verification only. Gate G0 has not been granted.

The detailed plan previously recorded historical counts of 65 Prisma models, 48 enums, 16 migration SQL files, 363 Prisma delegate calls across 39 production files, and 299 calls in 36 production files outside `packages/db`. These are historical claims to regenerate, not values to copy.

## Controlling decisions and source documents

Read and obey the complete current contents of:

- `docs/HIPAA_Canada_Compliance_Agent_Directive.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`
- every Markdown file under `docs/compliance/flowstate-pro/`
- `README.md`
- `docs/product_decisions_ledger.md`
- `docs/mvp_ticket_board.md`
- `docs/domain_model.md`
- `docs/engineering_rules.md`
- `docs/04-demo/Working Demo State.md`
- `docs/Agents/Agent Operating Model.md`
- `docs/Agents/Agent Permission Matrix.md`
- `docs/Agents/Work Packet Template.md`
- `docs/Agents/Kanban Orchestrator.md`
- `packages/db/prisma/schema.prisma`
- root and workspace package manifests relevant to commands and toolchain

Precedence is the directive and Pro package precedence. Current code and the Standard Prisma schema control claims about implemented Standard behavior.

## Allowed paths

- `docs/compliance/flowstate-pro/work-packets/WP0.1-freeze-evidence-and-boundaries.md`
- `docs/compliance/flowstate-pro/current-standard-baseline.md`
- `docs/compliance/flowstate-pro/evidence/README.md`
- `docs/compliance/flowstate-pro/evidence/wp0.1-standard-baseline/`
- `docs/compliance/flowstate-pro/decision-register-and-open-items.md`
- `docs/compliance/flowstate-pro/control-and-evidence-matrix.md`
- `docs/compliance/flowstate-pro/data-classification-and-flows.md`
- `docs/plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md`

## Forbidden paths

- All application and package source code.
- `packages/db/prisma/schema.prisma` and all migrations.
- Standard product behavior, schemas, tests, fixtures, runtime configuration, and customer data.
- Pro application/schema/infrastructure scaffolding.
- `.env*`, credentials, secrets, live vendor resources, production systems, or external systems.
- Any file not listed under Allowed paths.

## Data classes, actors, profiles, regions, destinations, and vendors affected

- Product: Standard evidence only; no Pro runtime behavior.
- Data classes observed: Standard identity/contact, member/guardian notes, attendance, forms/PDF bytes, signing evidence, billing/Stripe references, migration raw/mapped content, messages/notification bodies, sessions/tokens, and filesystem waitlist/application content where verified.
- Actors: repository reviewers only.
- Profiles/regions/destinations/vendors: inventory facts and unknowns only. No selection, approval, activation, or legal conclusion.
- Use synthetic or repository metadata only. Do not inspect local databases for customer/demo content and do not print secret values.

## Dependencies and blockers

- No human/legal/vendor decision is needed to perform read-only repository discovery.
- Gate G0 remains blocked after this packet pending the full dossier, conflict resolution, and named human approvals.
- Current command failures caused by environment prerequisites must be reported as failures or blocked checks, never hidden or converted to passes.

## Detailed instructions

1. Reconfirm the isolated worktree branch, commit, tree status, remotes, Node, pnpm, Corepack, Git, and platform/toolchain versions. Record commands and redacted outputs.
2. Count Prisma `model` and `enum` declarations directly from `packages/db/prisma/schema.prisma` with a deterministic command.
3. Count committed migration SQL files under `packages/db/prisma/migrations/` with a deterministic command.
4. Regenerate direct Prisma delegate-call inventory from production source only. Define the included extensions and excluded directories explicitly. Separate:
   - total production delegate calls and production files;
   - production calls/files outside `packages/db`;
   - tests/fixtures/scripts excluded from the production count;
   - raw SQL call sites, if any.
   Count call expressions robustly enough to include multiline calls and record limitations.
5. Inventory implemented Standard applications, packages, route/server-action/API boundaries, session/auth paths, database client import sites, uploads/file storage, webhooks/providers, jobs/queues, logging/console surfaces, browser storage/URL risks, and filesystem stores. Record exact paths and classify each claim as `IMPLEMENTED`, `SCHEMA_ONLY`, `HISTORICAL`, or `UNKNOWN`.
6. Identify sensitivity hotspots without copying sensitive payloads. Include at minimum member/guardian identity and notes, attendance, database-stored PDF bytes, signing evidence, migration raw/mapped content and access instructions, Stripe metadata and provider error fields, notification bodies, plaintext staff invite token storage if still present, URL/query/host-derived return risks if verified, console/error logging, and filesystem waitlist/application storage if still present.
7. Run the exact current root baseline commands where prerequisites permit:
   - `pnpm db:generate`
   - `pnpm db:validate`
   - `pnpm test`
   - `pnpm lint`
   - `pnpm check-types`
   - `pnpm build`
   - `pnpm exec playwright test --list`
   Record exit code, concise result, duration if available, and any prerequisite blocker. Do not create or use production credentials. Do not start or mutate a database unless the existing command is demonstrably non-mutating and requires no live/customer data.
8. Create `current-standard-baseline.md` with:
   - snapshot identity and limitations;
   - reproducible inventory commands;
   - regenerated counts;
   - implemented/schema-only/historical/unknown boundary table;
   - Standard apps/packages and data-access summary;
   - sensitive-store/flow inventory;
   - test/build state;
   - explicit non-claims and Pro separation implications;
   - gaps and next authorized packet.
9. Create `evidence/README.md` describing evidence rules, redaction, statuses, exact-candidate requirement, and the WP0.1 evidence directory.
10. Store concise redacted command outputs/manifests under `evidence/wp0.1-standard-baseline/`. Do not commit giant generated logs, caches, binaries, credentials, environment files, browser traces, or database content. Prefer a small Markdown manifest plus stable text outputs needed to reproduce claims.
11. Update the four mandatory packet artifacts:
   - decision register: record the WP0.1 evidence snapshot and any conflicts/blockers without self-approving a decision;
   - control/evidence matrix: update only affected discovery/evidence rows with exact evidence references and honest status;
   - data classification/flows: add or refresh only the current Standard evidence references/limitations;
   - implementation plan: convert WP0.1 into a checklist and check only criteria proven complete; record actual paths, commands, results, deviations, blockers, and the next authorized packet.
12. Update this work packet status and acceptance checklist only after verification.
13. Run Markdown/content checks suitable for documentation changes, `git diff --check`, inspect `git status --short`, and review the complete diff. Do not commit, push, merge, deploy, or contact anyone.

## Migration, backfill, concurrency, audit, rollback, and production impact

- Migration/backfill: none.
- Concurrency: not applicable; repository snapshot only.
- Audit behavior: evidence files contain repository/tool metadata only and no PHI payload.
- Rollback: revert this packet's documentation/evidence files. Do not rewrite approved history; supersede factual errors explicitly if found after review.
- Production impact: none.

## Acceptance requirements

- [x] The exact commit, branch/worktree, dirty state, toolchain, and limitations are recorded.
- [x] Prisma model, enum, and migration counts are regenerated from current files with reproducible commands.
- [x] Production Prisma delegate calls/files and outside-`packages/db` counts are regenerated with explicit inclusion/exclusion rules and limitations.
- [x] Raw SQL usage is searched and reported.
- [x] Standard application/package/data-boundary inventory is evidence-backed with exact paths.
- [x] Sensitive stores and flows are documented without payloads or secrets.
- [x] Every required root command is run or explicitly recorded as blocked/failed with its real result.
- [x] Implemented, schema-only, historical, and unknown claims are separated.
- [x] No Pro model/control is described as implemented.
- [x] Required evidence artifacts and all four mandatory dossier/plan updates exist.
- [x] The plan marks only WP0.1 complete; WP0.2 remains the next authorized packet and G0 remains blocked.
- [x] `git diff --check` passes; a candidate-wide content/path/link check covers tracked and untracked files; final status contains no application/schema/migration changes, secrets, production data, or unrelated files.

## Verification record — 2026-09-22

- Base snapshot commit: `d4f2098b4940cae61b9f36345cb480bda33d990d`; branch/worktree match the packet. The exact uncommitted WP0.1 documentation candidate is identified by `evidence/wp0.1-standard-baseline/candidate-manifest.txt`.
- Counts: 65 models, 48 enums, 16 migrations; 363 production delegate calls/39 files; 299 outside-`packages/db` calls/36 files; 181 excluded calls/6 files; 0 raw-SQL call sites under the documented rules.
- Required root commands: all seven ran exactly and returned exit 127 because `pnpm` was unavailable on `PATH`; `node_modules` was absent. No gate is represented as passed.
- Final validation: `git diff --check`, the candidate-wide content/path/link check, the complete `git status --short -uall`, and the candidate-manifest reproduction pass; see `snapshot-and-toolchain.txt` and `candidate-manifest.txt`.
- Evidence: `../current-standard-baseline.md`, `../evidence/README.md`, and `../evidence/wp0.1-standard-baseline/`.
- Production impact: none. Migration/backfill: none. Rollback: revert/supersede only this packet's allowed documentation/evidence paths.
- Review still required: Database, Backend, Security/Privacy, QA/Assurance, and CEO/Product owner. Gate G0 remains `BLOCKED`; next authorized packet is WP0.2.

## Constraints

- Do not modify Standard code, tests, schema, migrations, runtime configuration, or behavior.
- Do not create Pro application, schema, infrastructure, vendor, identity, or clinical code.
- Do not select legal values, vendors, agreements, regions beyond recording approved planning facts, or production settings.
- Do not claim compliance, operational readiness, legal review, evidence completeness, or profile approval.
- Do not use production/customer data, local database content, live credentials, vendor consoles, network provisioning, deployment, remote push, or external communication.
- Preserve exact identifiers and report uncertainty plainly.
- Keep the change as small as the evidence requirement allows.

## Required tests and runtime proof

- Deterministic count/inventory commands documented and rerunnable.
- Root command outcomes recorded from the exact worktree revision.
- Markdown link/path consistency checked for added references.
- `git diff --check` passes.
- `git status --short` shows only allowed paths.

## Screenshot requirements

None. This packet changes no user-visible UI.

## Handoff format

- Human outcome and why it matters.
- Exact changed files.
- Exact commands/checks with real outcomes and durations where captured.
- Regenerated counts and the counting rules.
- Evidence references and honest status transitions.
- Risks, limitations, unresolved blockers, and required reviewers.
- Rollback/forward-fix state and production impact (`none`).
- Next authorized packet: WP0.2, unless a conflict makes it `BLOCKED`.

## External boundaries

No deploy, remote push, merge, outreach, production credentials, customer/vendor contact, live Stripe action, cloud provisioning, destructive data operation, pricing/market commitment, legal conclusion, public claim, or production/profile activation.

## Ponytail mode

PONYTAIL MODE ACTIVE — level: full

You are a lazy senior developer. Lazy means efficient, not careless. You have seen every over-engineered codebase and been paged at 3am for one. The best code is the code never written.

### Persistence

ACTIVE EVERY RESPONSE. No drift back to over-building. Still active if unsure. Off only: "stop ponytail" / "normal mode". Default: **full**.

### The ladder

Stop at the first rung that holds:

1. Does this need to exist at all? Speculative need = skip it, say so in one line. (YAGNI)
2. Already in this codebase? Reuse an existing helper, utility, type, pattern, or document structure after tracing it.
3. Standard library does it? Use it.
4. Native platform feature covers it? Use it.
5. Already-installed dependency solves it? Use it. Never add a dependency for a few lines.
6. Can it be one line? One line.
7. Only then: the minimum new code or documentation that works.

The ladder runs after understanding the problem. Read the task and the affected flow first. Fix shared root causes rather than one symptom. For this documentation packet, prefer reproducible native shell/Node/Git commands and small evidence files over a new framework or validator.

### Rules

- No unrequested abstractions, boilerplate, scaffolding, or speculative future modules.
- Deletion/reuse over addition. Boring over clever.
- Fewest files and shortest correct diff after full comprehension.
- Never simplify away validation, security, privacy, evidence integrity, error reporting, accessibility, or an explicit requirement.
- A deliberate simplification with a real ceiling must be labeled `ponytail:` with the ceiling and upgrade condition.
- Non-trivial verification logic must leave one runnable check. Do not add a test framework for documentation-only work.

### Output

Perform the work first. Handoff should be concise and evidence-led. Do not write an essay or feature tour.
