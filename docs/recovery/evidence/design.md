# Flowstate Design Recovery Evidence

Task: `t_d8c56236`
Board: `hitlink`
Recovered on: 2026-07-20
Scope: design-continuity evidence only; no implementation, schema, manifest, lockfile, migration, credential, deployment, or destructive-data changes.

## Design risk, user/business impact, choice needed, and recommendation

### Design risk

Flowstate has three credible but separately maintained visual systems: a dense green admin system, a simpler amber member system, and a premium editorial public system. Each works in isolation, but they do not yet share an implemented token/component contract. The most consequential current gaps are not cosmetic:

1. The owner-visible migration route still exposes an internal import workbench and launch controls despite the onboarding design review marking this as a must-fix separation issue.
2. The public site publishes a specific commercial promise—15% off monthly pricing, grandfathered—without a matching approved pricing decision in the inspected decision records.
3. Member UI lacks the explicit focus/reduced-motion treatment present in the other surfaces.
4. Archive/revoke/import/launch actions do not consistently communicate consequence or require deliberate confirmation.
5. Current authenticated responsive verification could not be re-established because the dev runtime had no `DATABASE_URL`; historical screenshots therefore cannot be treated as current runtime proof.

### User and business impact

- Owners can see operator-only concepts and controls that weaken the white-glove migration promise and make accountability unclear.
- A visitor can reasonably interpret the landing-page discount as an approved commercial commitment.
- Keyboard, motion-sensitive, and narrow-screen users receive uneven quality across role boundaries.
- One-click operational mutations can create avoidable mistakes and support burden.
- Continued app-local styling will make every new feature slower to align and harder to regression-test.

### Choice needed

Jacky should choose one of these bounded directions before a broad visual refactor:

- **Option A — Stabilize first (recommended):** remove owner/operator boundary violations, resolve the public commercial claim, add member accessibility parity, and establish a small cross-app token contract. Preserve role-specific shells and palettes. Lowest disruption; fastest risk reduction.
- **Option B — Full cross-app unification now:** redesign admin, member, auth, and public surfaces around one component library immediately. Highest continuity upside, but broadest implementation/test cost and greatest risk to working product slices.
- **Option C — Keep systems independent:** address only P0 defects and let each app evolve separately. Fastest short-term delivery, but compounds CSS/component divergence and makes future redesign more expensive.

### Recommendation

Approve **Option A**. Preserve the product principle already documented in `docs/engineering_rules.md:43-48`: operational admin, simpler consumer member UI, visually consistent but role-appropriate. Treat a shared semantic token/accessibility/interaction layer—not identical page styling—as the first design-system boundary.

## 1. Evidence scope and method

### Sources inspected

- Project guardrails and recovery context: `.hermes.md`, `README.md`, `CLAUDE.md`.
- Decisions and product state: `docs/product_decisions_ledger.md`, `docs/01-decisions/Business Decision Log.md`, `docs/mvp_ticket_board.md`, `docs/domain_model.md`, `docs/engineering_rules.md`, `docs/04-demo/Working Demo State.md`.
- Agent operating context: `docs/Agents/Agent Operating Model.md`, `docs/Agents/Design Continuity.md`.
- Local design methods: `.agents/skills/design-review/SKILL.md`, `design-tokens/SKILL.md`, `frontend-design/SKILL.md`, `information-architecture/SKILL.md`, `design-flow/SKILL.md`, `design-brief/SKILL.md`, `brief-to-tasks/SKILL.md`, and `grill-me/SKILL.md`.
- Existing design artifacts:
  - `.design/admin-daily-command-center/{DESIGN_BRIEF.md,INFORMATION_ARCHITECTURE.md,DESIGN_TOKENS.css,DESIGN_REVIEW.md,TASKS.md}`
  - `.design/onboarding-flow/DESIGN_REVIEW.md`
  - `.design/flowstate-landing-page/{DESIGN_BRIEF.md,INFORMATION_ARCHITECTURE.md,DESIGN_TOKENS.css,TASKS.md}`
- Implementation: the full route inventory under `apps/admin-web/app`, `apps/member-web/app`, and `apps/landing-web/app`; each app's `globals.css`; representative shells, navigation, auth, dashboard, migration, onboarding, access-product, member, and public-page components.
- Shared UI package: `packages/ui/src/button.tsx`, `card.tsx`, and `index.ts`, plus repository-wide import search.
- Database source of truth: all 1,884 lines of `packages/db/prisma/schema.prisma` and every migration file under `packages/db/prisma/migrations`.
- Tests: app unit/integration test inventory plus `playwright.config.ts`, `tests/e2e/flowstate-demo.spec.ts`, and `tests/e2e/migration-first-onboarding.spec.ts`.
- Recovery timeline: `git status`, tracked diff names/stat, and `git log --oneline -20`.
- Coordination: current `hitlink` Kanban task inventory and task `t_d8c56236`.

### Evidence labels

- **Verified fact:** directly observed in source, Git, runtime output, screenshot, or board data.
- **Inference:** a reasoned interpretation that requires user validation.
- **Risk:** a plausible user/business failure mode; not a claim that harm has already occurred.
- **Contradiction:** two inspected sources describe materially incompatible current states.

### Review limitations

- This was a recovery audit, not an implementation pass.
- No third-party identity or asset was copied.
- Existing recovery reports from other agents were not used as evidence.
- Authenticated screenshots could not be refreshed because direct admin/member login attempts returned Prisma initialization errors: `DATABASE_URL` was not present. No `.env` content was read or reported.
- Existing `.design/**/screenshots` are useful historical artifacts, not proof that the present working tree renders identically.

## 2. Recovered product and interface intent

### Verified facts

- MVP is one-location, web-only, with owner, coach, and customer roles (`.hermes.md`; `docs/product_decisions_ledger.md`; `docs/01-decisions/Business Decision Log.md:25-48`).
- Admin should be operational and efficient; member UI should be simpler and consumer-like; the apps should remain consistent but role-appropriate (`docs/engineering_rules.md:43-48`).
- Migration-first onboarding is implemented as a gate: `Workspace.status` defaults to `SETUP_INCOMPLETE`, while migration stages run from intake to complete (`packages/db/prisma/schema.prisma:16-29,387-468`).
- The current repo exposes 25 admin pages, 9 member pages, and 4 landing-app pages. The surface is already too broad for ad hoc per-page styling to remain low-risk.
- Current board state includes completed design-review work for the admin command center and migration-first onboarding, plus multiple completed implementation/review cards; there is no active shared-design-system delivery card in the inspected task inventory.

### Recovered visual principles

The existing artifacts consistently support these principles:

1. **Operational calm:** admin hierarchy should prioritize readiness, exceptions, queue, and next action rather than decoration (`.design/admin-daily-command-center/DESIGN_BRIEF.md`; `INFORMATION_ARCHITECTURE.md`).
2. **Progressive disclosure:** first-run owners should provide only what is necessary to start the migration handoff; technical staging/reconciliation stays internal (`.design/onboarding-flow/DESIGN_REVIEW.md:28-33`).
3. **Role-appropriate continuity:** shared typography rhythm, control behavior, semantic statuses, focus treatment, and spacing; denser admin information and simpler member actions.
4. **Calm public confidence:** editorial, atmospheric public presentation, restrained motion, visible trust and reliability themes (`.design/flowstate-landing-page/DESIGN_BRIEF.md:5-16`).
5. **Honest evidence:** mark design previews as previews, historical screenshots as historical, and runtime captures as current only when re-executed.

### Inference

The green admin/public palette and amber member accent appear intentionally differentiated rather than accidentally inconsistent. The continuity problem is therefore best solved at the semantic-token and interaction level, not by forcing every role into the same accent color.

## 3. Current visual-system inventory

### Admin

**Verified facts**

- `apps/admin-web/app/globals.css` is 1,832 lines with approximately 120 custom-property definitions, 106 unique hex values, 4 responsive/reduced-motion media blocks, and explicit `:focus-visible` treatment.
- `AdminShell` provides a sidebar, topbar, page header, action slot, and content region (`apps/admin-web/app/_components/admin-shell.tsx:20-65`).
- `AdminNav` contains 15 persistent destinations (`apps/admin-web/app/_components/admin-nav.tsx:4-34`).
- The command-center implementation has named sections, non-color-only status text, and a coherent operational hierarchy (`apps/admin-web/app/dashboard/page.tsx`).
- Admin auth screenshots show a narrow, clear single-card hierarchy and remain free of horizontal overflow at 390 px.

**Risk**

A 15-item persistent navigation is high-density on desktop and becomes a long stacked navigation at narrow widths. The current responsive CSS changes layout, but no current authenticated mobile run verified reachability, scroll position, or task completion across that shell.

### Member

**Verified facts**

- `apps/member-web/app/globals.css` is 718 lines with approximately 19 custom-property definitions, 40 unique hex values, and 2 width media blocks.
- `MemberShell` mirrors the admin shell concept but uses an amber accent and simpler four-link navigation (`apps/member-web/app/_components/member-shell.tsx:17-61`; `member-nav.tsx:3-15`).
- Member login is visually role-appropriate: warm cream background, orange primary action, simpler card, and no horizontal overflow at 390 px.
- Member implementation uses card/list layouts rather than data tables for bookings, membership, billing, and forms.

**Risk**

The member stylesheet has no project-defined `:focus-visible` rule and no `prefers-reduced-motion` rule, while admin and landing do. Browser defaults may still display focus, but interaction quality is not intentionally equivalent across roles.

### Public landing

**Verified facts**

- `apps/landing-web/app/globals.css` is 847 lines with approximately 131 custom-property definitions, 58 unique hex values, dark-mode overrides, explicit focus treatment, and reduced-motion handling.
- The current landing page renders at 1440, 834, and 390 px without document-level horizontal overflow.
- The mobile header hides the full nav and keeps a single waitlist CTA; primary visible controls are at least approximately 44 px high (`apps/landing-web/app/globals.css:218-252`).
- The public page is visually polished and clearly differentiated: oversized brand typography, atmospheric hero, editorial content bands, and a large waitlist section.
- The landing design directory has a brief, IA, tokens, and tasks, but no `DESIGN_REVIEW.md`; the implemented page is therefore not formally reviewed by its own artifact set.

**Risk**

The page is very long and typographically dominant on mobile. The oversized `Flowstate` wordmark and large form treatment create confidence but push core proof and conversion detail far down-page. This is a conversion hypothesis, not a verified usability defect; validate with analytics or moderated sessions before reducing the visual presence.

### Shared UI package

**Verified fact**

`packages/ui` exports only a basic `Button` and `Card`, and repository-wide searches found no application imports from the shared package. The real systems are implemented independently in three app-local stylesheets and app-local components.

**Risk**

The current package provides neither a shared semantic contract nor practical continuity. New work will continue to duplicate focus, status, spacing, form, button, and card behavior unless the package is either deliberately adopted or replaced by another documented shared layer.

## 4. Priority findings

| Priority | Label | Finding | Evidence | Impact | Recommendation |
| --- | --- | --- | --- | --- | --- |
| P0 | Contradiction | Owner migration route still exposes internal upload, import, stage, and activation controls after design review marked separation as must-fix. | `.design/onboarding-flow/DESIGN_REVIEW.md:28-33`; `apps/admin-web/app/dashboard/migration/page.tsx:78-90,158-214,216-323,325-375` | Owners can misread internal state, trigger operator work, or lose trust in a white-glove service boundary. | Split owner status from an explicitly operator-authorized route before polishing either surface. |
| P0 | Risk | Public page makes a specific discount/price-lock promise with no matching approved pricing decision found in the inspected decision records. | `apps/landing-web/app/page.tsx:93-107,156-161`; `.design/flowstate-landing-page/DESIGN_BRIEF.md:7-10,43-48`; decision records inspected in full | Creates a customer-facing commercial commitment and SEO-visible structured-data promise. | Jacky/CEO and BA/Sales must approve, revise, or remove the promise; Localization/Content must update visible copy and JSON-LD together. |
| P1 | Contradiction | Admin design review states dark status/background tokens and `prefers-color-scheme: dark` exist, but current admin CSS has no dark-mode media block. | `.design/admin-daily-command-center/DESIGN_REVIEW.md:74-80`; `apps/admin-web/app/globals.css` media inventory | Review record overstates implemented capability; future reviewers may assume dark mode is covered. | Correct the review or restore tested dark tokens; do not label dark mode implemented without a current screenshot/check. |
| P1 | Risk | Member interaction accessibility is less intentional than admin/public. | `apps/member-web/app/globals.css` contains no `:focus-visible` or `prefers-reduced-motion`; admin and landing do | Keyboard and motion-sensitive users experience role-dependent quality. | Add shared focus/motion tokens and verify keyboard order and visible focus on every primary member route. |
| P1 | Risk | Destructive or consequential actions are visually inconsistent and frequently submit without confirmation. | Access-product Archive uses `button-secondary` and a direct form submit (`apps/admin-web/app/dashboard/access-products/page.tsx:75-100,142-167`); staff Revoke is red but direct-submit (`staff-invites/page.tsx:78-92`); migration Run import/Complete handoff are direct submits (`migration/page.tsx:301-317,344-374`) | Accidental state changes, unclear reversibility, and higher support burden. | Define consequences by tier: reversible toggle, archive, revoke, import, activate. Require confirmation and outcome feedback for high-impact tiers. |
| P1 | Risk | No implemented shared design-system contract despite explicit consistency guidance. | `docs/engineering_rules.md:43-48`; `packages/ui/src/*`; zero app imports from `@flowstate/ui`; app-local CSS metrics | Visual drift, duplicated fixes, inconsistent a11y, and increasing implementation cost. | Establish a minimal semantic foundation before a broad component rewrite. |
| P1 | Evidence gap | Current authenticated desktop/tablet/mobile behavior was not re-demonstrated. | Admin/member login POSTs failed with Prisma `DATABASE_URL` initialization error; historical `.design` screenshots were not substituted as current proof | Responsive regressions on the broadest operational surfaces may go unnoticed. | Make seeded visual smoke checks reproducible and non-destructive in QA/CI. |
| P2 | Risk | Landing-page content is visually coherent but exceptionally long and high-presence on mobile. | Current 390 px screenshot; `apps/landing-web/app/globals.css:254-307,417-427,504-539` | Important trust proof and conversion details may be delayed; the effect is unmeasured. | Preserve the brand direction, then validate first-screen comprehension and CTA discovery before changing layout. |

## 5. Onboarding and migration continuity

### Verified facts

- The current onboarding form now makes only gym name, current software, access/export instructions, and timezone required; detailed pricing/scope and address fields are under nested disclosure (`apps/admin-web/app/onboarding/onboarding-form.tsx:27-114,116-205`). This partially addresses the previous long-form burden.
- The owner route still describes itself as a shared view of owner handoff **and internal workbench** (`apps/admin-web/app/dashboard/migration/page.tsx:79-85`).
- The same owner-authorized route renders CSV upload, validation issues, `Run import`, migration-stage editing, and `Complete handoff and notify owner` (`migration/page.tsx:209-214,216-323,325-375`).
- Prisma models the workflow as a persistent operational system, not a mockup: `WorkspaceMigration`, staging records, import jobs, validation issues, reconciliation reports, and imported records exist in the source schema; the final two migrations create the migration-first gate and execution foundation.

### Inference

The UI boundary problem grew because the data model correctly added internal migration operations before a separate operator role/surface was defined. The design fix should not hide the underlying status model; it should change authorization, IA, labels, and action placement.

### Recommended separation

- **Owner page:** current stage, next owner action, what Flowstate owns, target go-live, last update, request-help/contact path, and owner-provided documents/notes.
- **Operator page:** uploads, canonical mapping, validation issues, dry-run/import, reconciliation, stage controls, activation, and audit history.
- **Shared semantics:** stage names and outcome statuses may be shared, but operator verbs and raw technical details must not leak into owner navigation.

## 6. Database and migration evidence with UI implications

Every migration file was inspected. The chronological set is:

1. `20260404043358_init_phase2_slice1`
2. `20260406131403_phase2_core_ops`
3. `20260407134824_phase3_class_delivery`
4. `20260407144408_phase4_billing_communications`
5. `20260407151322_phase5_operations`
6. `20260408123000_announcements`
7. `20260416100000_guardians_forms`
8. `20260416140000_guardian_invites`
9. `20260416190000_owner_dashboard_attendance_exports`
10. `20260422171500_access_products`
11. `20260425120000_reliability_foundation`
12. `20260425183000_membership_template_billing_anchor`
13. `20260427083000_migration_first_onboarding`
14. `20260427114500_migration_execution_foundation`

### Verified UI-state implications

- `WorkspaceStatus` (`SETUP_INCOMPLETE`, `ACTIVE`, `DISABLED`) requires clear gating and non-color-only state labels (`schema.prisma:16-20,387-457`).
- Migration stages (`INTAKE_RECEIVED` through `COMPLETE`) require timeline semantics, next action, ownership, and stale/error handling (`schema.prisma:22-29,460-489`).
- Membership, billing, checkout, payment-method, and webhook states require member copy that distinguishes not-connected, failed, pending, action-required, and settled conditions; these cannot collapse into a single generic error.
- Guardian, form, signature, and trial models imply adult/minor, consent, expiry/version, and relationship states; the member system must avoid assuming one account equals one participant.
- Drop-ins, punch cards, restrictions, balances, and grants imply enabled/disabled/archived/available/exhausted states. Current cards expose the model, but mutation consequence and recovery remain under-designed.
- Reliability models add audit/event/outbox/import states. These should generally surface as calm human outcomes, with diagnostic detail reserved for operators.

### Risk

The database expresses more state nuance than the current app-local visual vocabulary reliably communicates. A semantic status contract should map model states to human label, icon, tone, urgency, next action, and role visibility; color alone is insufficient.

## 7. Responsive and accessibility evidence

### Current screenshots

The following fresh screenshots were captured from a Webpack dev server on 2026-07-20. They are runtime evidence only for the public page and unauthenticated auth surfaces:

- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/landing-desktop-1440.png` — SHA-256 `3620d47ed8701dda1bd3f277902ab465d1e81070861dffae5120dfcaa14f6abb`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/landing-tablet-834.png` — `dae3ceb7573193b659bc8218ecc5c407d6ffac811a5261291c115c382bf483a6`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/landing-mobile-390.png` — `6eef90f4831e9b01025c98f2f084a694fe74d838ecf4d29220a19cbf795411e5`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/admin-login-desktop-1440.png` — `5998b349b0da7d20b5263d342c4b004254b804ec70c99b006c4485e54c4952c8`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/admin-login-mobile-390.png` — `ee415809270b01b139b6a49a6b4d89741e2543ce9d9197e2c0dd4856d277eb9e`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/admin-signup-desktop-1440.png` — `7d8557e845371ea1ec2a29986afc851c67831f2ac93444d76823fad6a1f9001e`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/member-login-desktop-1440.png` — `1b5c9f301e8e696e0efb683f0ed5db0f0b028536df71ad1ad45a7846f35f3d5f`
- `C:/Users/Jacky/AppData/Local/Temp/flowstate-recovery-design/member-login-mobile-390.png` — `cc0681eea1256e42dfa555b049373c155f0d071ed07c470ebbefde9ed8f46868`

### Runtime observations

- Landing at 1440, 834, and 390 px: HTTP 200, `lang="en"`, one main landmark, no duplicate IDs, and no document-level horizontal overflow.
- Admin login/signup and member login at 1440/390 px: one main landmark, matched visible labels/controls, no duplicate IDs, and no document-level horizontal overflow.
- Landing desktop/tablet/mobile preserve hierarchy and avoid overlap. Mobile intentionally hides the full navigation and stacks CTAs/content.
- Admin login and signup share the same green auth visual language. Member login uses the same basic composition with warmer consumer styling; role distinction is clear without losing brand recognition.
- No current authenticated dashboard screenshot was captured; attempts stopped after the runtime prerequisite failure rather than fabricating or reusing old proof.

### Accessibility evidence and gaps

- Good: semantic main landmarks on tested public/auth pages, labeled auth controls, non-color-only status text in the command center, explicit focus treatment in admin/public, reduced-motion handling in admin/public, and no tested narrow-width horizontal overflow.
- Gap: member focus and motion behavior is not explicitly normalized.
- Gap: no fresh keyboard-only task walkthrough, screen-reader announcement audit, zoom/reflow check, forced-colors check, or automated axe run was part of this task.
- Gap: historical admin review says contrast spot-checks passed, but those checks were not rerun against this working tree; treat them as historical.

## 8. Implementation, test, and Git recovery evidence

### Safe verification results

- `pnpm run test` — exit 0.
- `pnpm run lint` — exit 0.
- `pnpm run build` — exit 1 before app compilation because the root script attempted to source `.env` and Bash reported a syntax error at line 8. No `.env` content was read.
- Per-app build retry: `api` exited 0; admin, member, and landing scripts exited 1 at the same environment-source prerequisite.
- Direct Next dev with default Turbopack failed with a Windows privilege error (`os error 1314`) while creating a symlink.
- Direct Next dev with `--webpack` successfully served landing/admin/member public routes. Landing returned 200; authenticated logins then failed because `DATABASE_URL` was absent.

These are environment/reproducibility findings, not evidence that application tests failed.

### Test coverage observations

- Unit/integration tests exist across admin, member, landing, API, and shared packages.
- Playwright includes broad owner/member workflow and migration-first onboarding flows.
- The configured Playwright projects are desktop Chromium for admin and member; there is no configured tablet/mobile project, visual-diff baseline, or automated accessibility project (`playwright.config.ts:1-31`).
- Existing e2e flows create/update local demo data. They were inspected but not executed during this non-destructive audit.

### Git recovery timeline

Recent history aligns with the visible systems:

- `4dd5557` — migration-first onboarding operations.
- `11e2620` — migration-first onboarding initiative docs.
- `b84e301` — waitlist form layout refinement.
- `f613b07` / `8bd8a24` — landing-page implementation and redesign.
- `ea18831` — admin command center.
- `d134779` — access products.
- Earlier commits establish admin, member, operations, billing, guardians/forms, and shared UI scaffolding.

The working tree was already dirty before this audit (20 modified paths and 4 untracked paths in the session-start snapshot). This task did not overwrite or normalize those changes. The only repository path created by this task is this report.

## 9. What is mockup, implemented, and demonstrated

| Surface | Design artifact | Implemented in code | Freshly demonstrated in this audit |
| --- | --- | --- | --- |
| Admin command center | Brief, IA, token artifact, historical review, preview/live screenshots | Yes | No authenticated run; auth shell only |
| Migration onboarding/status | Historical design review and screenshots | Yes | Signup/auth shell only; authenticated flow blocked |
| Member portal | No dedicated `.design` brief/review found | Yes | Login only; authenticated flow blocked |
| Public landing | Brief, IA, token artifact, tasks; no formal design review | Yes | Yes at 1440/834/390 |
| Shared UI system | Minimal package components; no cross-app design contract | Scaffold exists, not adopted | Not applicable |

Historical `.design` screenshots remain evidence of what was demonstrated when those reviews ran. They must not be relabeled as current captures without rerunning the same routes against the current tree.

## 10. Proposed follow-up tickets

These are proposals only. They were not created on the board because this task requested evidence and ticket proposals, not cross-team execution.

### D1 — Split owner migration status from operator workbench

- **Priority:** P0
- **Profiles:** `hitlink-ux` (flow/role boundary), `hitlink-design` (brief/review), `hitlink-frontend-dev` and `hitlink-backend` (implementation/authorization), `hitlink-qa` (role and destructive-action checks), `hitlink-workflow` (operator path).
- **Acceptance:** owner route contains no upload/import/stage/activation controls; operator actions require an explicit authorized context; owner sees stage, responsibility, next action, target date, and help path; desktop/tablet/mobile screenshots and role tests supplied.

### D2 — Resolve the Founding Gym commercial promise

- **Priority:** P0
- **Profiles:** `hitlink-ceo`, `hitlink-ba-sales`, `hitlink-localization`; `hitlink-design` reviews hierarchy after approved copy.
- **Acceptance:** Jacky records an explicit decision to approve, revise, or remove the 15%/grandfathered claim; visible section, CTA, waitlist success copy, and JSON-LD remain identical in meaning; no unapproved pricing promise remains.

### D3 — Establish the Flowstate semantic design contract

- **Priority:** P1
- **Profiles:** `hitlink-design`, `hitlink-frontend-dev`, `hitlink-ux`, `hitlink-qa`.
- **Acceptance:** one reviewed source defines semantic color roles, typography roles, spacing scale, radii, focus ring, motion/reduced-motion, control heights, status tones, and destructive-action tiers; admin/member/public may map different accents but share semantics; at least Button, Card/Panel, Status, Field, Alert, Empty State, and Confirm Action are adopted without a whole-app rewrite.

### D4 — Member accessibility and responsive parity

- **Priority:** P1
- **Profiles:** `hitlink-design`, `hitlink-frontend-dev`, `hitlink-qa`.
- **Acceptance:** visible `:focus-visible` treatment, reduced-motion behavior, 200% zoom/reflow, keyboard-only route walkthrough, and automated accessibility checks across member login, overview, schedule, bookings, membership, billing, and forms; no horizontal overflow at 390/768/1440.

### D5 — Consequence-aware action patterns

- **Priority:** P1
- **Profiles:** `hitlink-ux`, `hitlink-design`, `hitlink-frontend-dev`, `hitlink-qa`.
- **Acceptance:** action matrix classifies toggle/archive/revoke/import/activate; archive and revoke communicate reversibility; import and activation require explicit confirmation with scope/result; pending/success/error feedback is visible and announced; keyboard focus returns predictably.

### D6 — Reproducible responsive visual smoke suite

- **Priority:** P1
- **Profiles:** `hitlink-qa`, `hitlink-workflow`, `hitlink-frontend-dev`; `hitlink-design` owns reviewed baselines.
- **Acceptance:** deterministic local seed/auth setup without production credentials; Chromium checks at 1440, 834/768, and 390/375 for admin/member/public; horizontal-overflow, focus, reduced-motion, and key-route screenshots; baseline metadata records commit and viewport; failures do not mutate production data.

### D7 — Correct stale design evidence

- **Priority:** P2
- **Profiles:** `hitlink-design`, `hitlink-qa`.
- **Acceptance:** admin review no longer claims current dark mode unless code and screenshots prove it; landing receives a formal design review; each review records mockup vs implementation vs demonstration and dates/commit references.

## 11. Final continuity judgment

### Verified fact

Flowstate already has a strong visual direction: disciplined green operations, warm member self-service, and a premium calm public identity. The command center and landing page are not generic scaffolds; their hierarchy and typography are intentional.

### Inference

The product does not need a visual reset. It needs design governance at the seams: role visibility, semantic state mapping, action consequence, accessibility parity, commercial-copy approval, and reproducible visual proof.

### Recommended decision

Proceed with Option A (stabilize first). Do not start a full rebrand or component-library migration until the two P0 boundary/commitment issues are resolved and Jacky approves the semantic-contract direction. Then hand the approved contract to Frontend with UX, Workflow, Localization/Content, QA, and BA/Sales participation as specified in tickets D1-D7.
