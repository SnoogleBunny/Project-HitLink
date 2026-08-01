# Flowstate UI Skill Toolkit

## Purpose

This document is the committed source of truth for Flowstate's approved UI-reasoning, data-visualization, and motion skill bundle. It records the exact installed names, ownership, security boundaries, and merge gates. A skill being available does not authorize a dependency, product feature, visual direction, or production action.

## Approved bundle

| Skill | Source | Approved use |
|---|---|---|
| `impeccable` | `skills-sh/pbakaus/impeccable/impeccable` | Logic-only UI design reasoning and critique |
| `bklit-data-visualization` | `.agents/skills/bklit-data-visualization/SKILL.md` | Truthful, accessible React infographics and data graphs using Bklit UI's MIT chart registry |
| `motion-scroll-animations` | `.agents/skills/motion-scroll-animations/SKILL.md` | Accessible React scroll-linked and scroll-triggered animation using Motion from `motion.dev` |

The project-local skills are committed in this repository. Compatible agent harnesses may discover them from `.agents/skills/`; the Hermes role profiles use profile-local mirrors whose LF-normalized content must match the committed Git blobs. Impeccable remains a profile-level registry installation because only its scanned single-file artifact is approved.

## Impeccable security boundary

The approved logic-only Impeccable scope is the registry-provided `SKILL.md` only:

- Registry identifier: `skills-sh/pbakaus/impeccable/impeccable`
- Registry install-scan hash: `sha256:c16916be900b1add16edad189f86ffcbba9ceb81f965d21c1bb2ab9bdc550878`
- Exact installed `SKILL.md` hash: `sha256:ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b`
- Required verdict: `SAFE`

The registry identifier is mutable. No immutable mapping from the registry artifact to a particular upstream Git path or commit is claimed; approval is anchored to the post-install file-set assertion and exact installed-file hash below.

Recorded commands and outputs: `docs/Agents/evidence/UI Toolkit Audit 2026-08-01.md`.

A separately acquired 147-file Impeccable bundle was classified `DANGEROUS` during exploratory audit because it contained persistence-capable hooks and localhost browser/server behavior. Its immutable source mapping was not retained, so the result is not used as provenance for the approved artifact. Do not vendor, reconstruct, or run any larger bundle: only the verified single-file artifact is approved.

Prohibited Impeccable behavior:

- hooks or persistent harness configuration;
- live mode or local browser/server helpers;
- `npx impeccable`;
- bundled scripts or generated provider artifacts;
- treating a scan of the single-file artifact as certification of the full repository.

Impeccable is a reasoning layer only. If a referenced local playbook or script is absent, do not fetch or recreate it implicitly.

## Bklit boundary

Bklit UI is an independent open-source project and a Vercel OSS Program member; it is not a Vercel-owned product. Use its MIT component registry as the default chart source when a scoped Flowstate packet calls for a data graph or infographic.

- Official repository: `https://github.com/bklit/bklit-ui`
- Documentation: `https://bklit.com/docs`
- Registry item pattern: `https://ui.bklit.com/r/{name}.json` (not a browsable index; verify the exact name in the documentation, for example `line-chart.json`)

Bklit Studio may be used only for non-code visual exploration. Do not export or incorporate Studio-generated code; all chart code incorporated into Flowstate must come from the verified MIT registry. Do not invent metrics, alter axes, hide missing values, or animate numbers in ways that misrepresent gym data. Every chart requires visible context, units, timezone where relevant, source/demo labeling, and an exact-value text or table fallback.

## Motion boundary

“MotionAI” is resolved for Flowstate as Motion from `motion.dev`, formerly Framer Motion. Use the `motion` package and React API (`motion/react`) only when the target workspace and scoped packet permit the dependency.

- React documentation: `https://motion.dev/docs/react`
- Scroll animation documentation: `https://motion.dev/docs/react-scroll-animations`

Prefer native scrolling and static comprehension. Motion must have a communication purpose and must not be required to discover, understand, or operate critical content. Respect `prefers-reduced-motion`, keep keyboard/focus order stable, and prefer transforms/opacity over layout-triggering animation.

## Profile distribution

The bundle is required for these UI-facing profiles:

| Profile | Responsibility |
|---|---|
| `hitlink-ceo` | Enforce scope, safety boundary, reviews, and final gates |
| `hitlink-orchestrator` | Name required skills and route Design, UX, Frontend, QA, and BA/Sales |
| `hitlink-design` | Set visual hierarchy and motion intent; do not implement unless assigned |
| `hitlink-ux` | Set comprehension, accessibility, exact-value, and reduced-motion acceptance criteria |
| `hitlink-frontend-dev` | Implement the approved bounded packet in the smallest practical client boundary |
| `hitlink-qa` | Verify exact-candidate truth, accessibility, responsiveness, performance, and diagnostics |

Backend, Database, Workflow, Localization/Content, and BA/Sales do not need the implementation skills by default. They remain required reviewers when their domains are affected.

## Legacy exclusions

Do not reintroduce the superseded frontend-design set into the listed profiles unless Jacky explicitly changes this decision:

- `dashboard`
- `design-taste-frontend`
- `imagegen-frontend-mobile`
- `redesign-existing-projects`
- `shadcn-ui`
- `ui-ux-pro-max`
- `claude-design`
- `popular-web-designs`
- `sketch`
- `design-md`
- `p5js`
- `pretext`
- `awesome-design-md` and its injected style-skill bundle

This does not remove unrelated diagram, document, media-generation, or presentation skills.

## Work-packet requirements

A packet involving UI, charts, infographics, or motion must state:

1. Which of the three approved skills must be loaded.
2. The exact user outcome and data source.
3. Allowed and forbidden files.
4. Whether dependency installation is allowed.
5. Static, loading, empty, error, and reduced-motion behavior.
6. Required desktop, tablet, and 390px mobile evidence.
7. Accessibility and exact-value fallback acceptance criteria.
8. Required QA, BA/Sales, Design, UX, and other domain reviews.

Installing the toolkit does not add Bklit or Motion to any application package. Dependency changes remain separate, reviewable implementation decisions.

## Required verification

Before a Bklit or Motion candidate can be committed or merged:

- relevant unit/integration tests pass;
- lint, typecheck, and production build pass for affected workspaces;
- screenshots cover desktop, tablet, and 390px mobile;
- keyboard, focus, screen-reader semantics, and color-independent meaning are checked;
- chart transformation logic, units, timezone, source/demo labels, zero-vs-missing handling, and exact-value fallback are verified;
- motion is tested with reduced motion, restored navigation, and no-JavaScript/static comprehension;
- browser console, hydration, clipping/overflow, sticky release, and scroll performance are checked;
- QA and BA/Sales review the exact candidate;
- Design and UX review every material visual, chart, infographic, or motion candidate;
- CEO inspects the exact candidate and final evidence before the local commit or merge.

## Runtime installation and verification

For each approved profile, install and verify the Impeccable artifact with the fail-closed sequence below. The registry identifier is mutable: installation is not approval until the exact file set and SHA-256 check pass.

```bash
profile='<profile>'
expected='ff53019edf235f3a229b6369806f2ea3baa98f755338b214c064c8c639ae526b'
artifact="$LOCALAPPDATA/hermes/profiles/$profile/skills/impeccable/SKILL.md"

hermes -p "$profile" skills install skills-sh/pbakaus/impeccable/impeccable --yes --force
python -c 'import hashlib,pathlib,sys; p=pathlib.Path(sys.argv[1]); root=p.parent; files=sorted(str(x.relative_to(root)).replace("\\", "/") for x in root.rglob("*") if x.is_file()); actual=hashlib.sha256(p.read_bytes()).hexdigest(); assert files == ["SKILL.md"], f"unexpected files: {files}"; assert actual == sys.argv[2], f"hash mismatch: {actual}"; print(f"verified {actual}")' "$artifact" "$expected" || { printf 'Impeccable verification failed; do not load this artifact.\n' >&2; exit 1; }
hermes -p "$profile" skills audit impeccable --deep
```

A valid installation passes the file/hash assertion and reports `SAFE`. On any mismatch, do not load the artifact; remove or replace it with the approved bytes before continuing. Compatible project-local agent harnesses may load the custom skills from `.agents/skills/`; Hermes profile-local mirrors must match the committed Git blobs after normalizing CRLF to LF.

After profile changes, start a fresh session so Hermes reloads the profile prompt and skill index.
