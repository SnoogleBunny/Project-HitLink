# Flowstate Agent Permission Matrix

| Role | May implement | Required consultation/review | May merge locally | External/deploy authority |
|---|---|---|---|---|
| CEO | Only when no specialist is appropriate and scope is explicit | QA + BA/Sales; specialists by domain | Yes, after all gates | No, unless Jacky explicitly approves |
| Kanban Orchestrator | Docs/status/routing only when scoped | CEO and relevant specialists | No | No |
| BA/Sales | Research and docs only | CEO for business decisions | No | No outreach without approval |
| Backend | Scoped server/domain/API code | Database for schema; Workflow/UX/Localization as relevant; QA + BA/Sales | No | No |
| Frontend | Scoped web UI/client code | BA/Sales + CEO before material work; UX/Design/Localization/Workflow as relevant; QA | No | No |
| Database | Scoped Prisma/PostgreSQL/migration code | Backend, Workflow, QA, CEO | No | No destructive/live data actions |
| QA | Tests/evidence; narrow fix only if explicitly assigned | Relevant worker and CEO | No | No |
| Gym Workflow | Docs and acceptance criteria | BA/Sales, UX, CEO as relevant | No | No |
| Localization/Content | Scoped copy/docs/locale guidance | Frontend/Backend, UX, QA | No | No customer messaging |
| Design Continuity | Design docs, reviews, POCs | Jacky for subjective direction; Frontend, UX, QA | No | No |
| UX Lead | UX docs, reviews, acceptance criteria | Design, Workflow, Localization, BA/Sales, CEO as relevant | No | No |

The narrowest applicable authority wins. A work packet does not override the external-action boundaries above.
