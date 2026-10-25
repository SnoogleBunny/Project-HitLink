# Flowstate Pro documentation index

**Status:** APPROVED PLANNING BASELINE — implementation and production approval remain separate
**Decision baseline:** Q1–Q206, confirmed by the product owner on 2026-08-24
**Scope:** Flowstate Pro only. Flowstate Standard remains the existing gym-management product.

## Purpose

This directory is the living source-of-truth package for Flowstate Pro, a separate white-label clinical-record product intended to support approved healthcare organizations in Virginia first and British Columbia second. The package defines product requirements, architecture, legal-policy inputs, control evidence, operations, and competitor-parity planning. It is not legal advice, a certification, an executed agreement, or evidence that Flowstate currently operates a compliant production service.

## Entry points

1. `../../HIPAA_Canada_Compliance_Agent_Directive.md` — concise AI implementor mandate and execution prohibitions.
2. `../../plans/2026-08-10-hipaa-canada-compliance-implementation-plan.md` — detailed gated implementation plan and work packets.
3. `decision-register-and-open-items.md` — approved decisions, supersessions, blockers, and expert determinations.

## Package

- `product-spec.md` — product identity, users, modules, exclusions, commercial boundaries, differentiation.
- `product-requirements-document.md` — functional and non-functional requirements with acceptance criteria.
- `roadmap.md` — gated releases from documentation through Virginia, BC, and parity expansion.
- `system-design.md` — application, data, identity, API, integration, job, deployment, and failure design.
- `security-privacy-architecture.md` — trust boundaries, authorization, audit, encryption, threats, and fail-closed behavior.
- `legal-applicability-matrix.md` — factual jurisdiction branches and counsel-owned determinations.
- `data-classification-and-flows.md` — allowed data, high-risk classes, stores, destinations, residency, and lifecycle.
- `control-and-evidence-matrix.md` — requirement-to-control-to-test-to-owner-to-evidence mapping.
- `operations-and-governance.md` — human roles, policies, training, access, incident, vendor, and review operations.
- `competitor-parity-matrix.md` — dated Jane.app and Epic benchmarks, scope, gaps, and roadmap treatment.
- `decision-register-and-open-items.md` — decisions Q1–Q206, superseded assumptions, blockers, and next actions.

## Precedence

When documents disagree, stop and record the conflict. Do not silently select the easiest source.

1. Approved entries in `decision-register-and-open-items.md` for product decisions.
2. Qualified-counsel-approved entries in `legal-applicability-matrix.md` and approved policy catalogs for legal values.
3. Current code and `packages/db/prisma/schema.prisma` for claims about the implemented Standard system.
4. `product-requirements-document.md` for required Pro behavior.
5. `system-design.md` and `security-privacy-architecture.md` for approved Pro architecture.
6. `roadmap.md` and the detailed implementation plan for sequencing.
7. `competitor-parity-matrix.md` for benchmark evidence only.
8. The agent directive for execution protocol; it cannot invent product or legal decisions.

## Status vocabulary

Every control and artifact uses one of these states:

- `DRAFT`
- `PROPOSED`
- `COUNSEL_REVIEW_REQUIRED`
- `OWNER_APPROVAL_REQUIRED`
- `APPROVED`
- `SPECIFIED`
- `IMPLEMENTED`
- `TECHNICALLY_VERIFIED`
- `OPERATIONALLY_EXERCISED`
- `EVIDENCE_COMPLETE`
- `LEGALLY_REVIEWED`
- `APPROVED_FOR_PROFILE`
- `BLOCKED`
- `NOT_APPLICABLE`
- `SUPERSEDED`

Code or tests alone never establish legal review, operating evidence, production approval, or compliance.

## Standard versus Pro

- Standard remains the current MMA/fitness-gym application governed by the existing product ledger and implemented Prisma schema.
- Pro is a new product with separate applications, database schema, identity, sessions, infrastructure, vendors, billing configuration, keys, logs, backups, and production access.
- No Standard-to-Pro migration exists.
- Shared code is limited to reviewed data-free UI/configuration primitives and pure utilities.
- This package does not rewrite Standard’s roadmap or represent planned Pro models as implemented.

## Change control

Each update must record owner, reason, source, affected profiles, effective date, superseded text, and required review. Legal values, consent text, retention periods, breach decisions, agreement status, vendor approval, and compliance claims require named human approval. Confidential contracts, personnel files, incident evidence, legal advice, and production secrets stay outside the repository; this package stores only templates, metadata, and evidence references.

## Immediate review gates

Before implementation starts, reviewers must confirm:

- product and architecture decisions remain approved;
- unresolved legal/vendor inputs are represented as blockers;
- no document claims current HIPAA/PIPEDA compliance;
- Standard and Pro boundaries are consistent;
- work packets use synthetic data and isolated worktrees;
- production activation remains prohibited until the complete launch gate is satisfied.
