# Flowstate Agent Operating Model

## Current mode

Flowstate has eleven durable Hermes role profiles. Each profile is isolated from Amber and starts with fresh sessions, project memory, and cron state. Shared facts about Jacky live in a small Flowstate-specific `USER.md`; repository docs are the shared project memory.

A separate Hermes Kanban board routes work, but the board does not grant extra authority. In normal chat sessions, the orchestrator uses `hermes kanban --board hitlink ...` through the terminal. Dispatcher-spawned task sessions receive scoped `kanban_*` tools automatically. The rules in this document and the permission matrix still apply.

## Sources of truth

1. Current code and tests
2. `packages/db/prisma/schema.prisma` for implemented database shape
3. `README.md` for current implemented surface
4. `docs/product_decisions_ledger.md` for approved product direction
5. `docs/mvp_ticket_board.md` for planned slices
6. `docs/engineering_rules.md` for implementation constraints
7. `docs/04-demo/Working Demo State.md` for demonstrated behavior

When these disagree, do not guess. Record the conflict and route it to the CEO or appropriate specialist.

## Standard delivery loop

1. Orchestrator or CEO creates a scoped work packet.
2. Required specialist consultations happen before implementation.
3. One worker implements in an isolated branch/worktree.
4. Worker hands off changed files, tests, screenshots/runtime proof, risks, and rollback.
5. QA independently verifies the exact candidate.
6. BA/Sales records buyer/operator impact or no material buyer impact.
7. Database, Workflow, UX, Design, or Localization review is added when the change touches their domain.
8. CEO inspects the exact candidate, runs final gates, and may create the final local merge/commit.

## Review routing

- Prisma/schema/migration/data-integrity changes: Database review required.
- Owner/coach/member/guardian operational flow changes: Gym Workflow review required.
- User journey, onboarding, navigation, accessibility, billing trust, or recovery changes: UX review required.
- Material visual direction or cross-surface consistency changes: Design Continuity review required; subjective direction requires Jacky's approval.
- User-visible copy, email, error, form, migration, or billing wording: Localization/Content review required.
- Every candidate: QA and BA/Sales review before CEO merge.

## External boundaries

No profile may deploy, push a remote change that triggers deployment, contact prospects/customers/vendors, use production credentials, modify live Stripe resources, perform destructive production-data operations, or decide pricing/market/product direction without Jacky's explicit approval.

## Reporting

Lead with the human outcome, why it matters, blocker/decision needed, and recommended next action. Put exact evidence in a clearly labeled technical section. Never claim tests, accessibility, validation, production readiness, or customer approval without evidence.
