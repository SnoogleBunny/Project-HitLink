# HitLink workflow mockups

The interactive mockup reviewed with Jacky, captured from the final local design files on 25 October 2026. The design files were last edited on 14 October 2026. This folder includes the original screens, editable source, browser preview and screenshots so another Codex session can work from the same design.

## Start here

- [Open the browser preview](preview.html) after cloning or downloading the repository. GitHub displays HTML source; it does not run this preview in the file viewer.
- [Read the complete mockup](hitlink-workflow-mockups.html), or use the smaller files in [src](src).
- See the [owner](previews/owner-desktop.png), [member](previews/member-desktop.png), [coach](previews/coach-desktop.png), [client](previews/client-desktop.png), [visitor](previews/prospect-desktop.png) and [phone](previews/member-phone.png) screenshots.
- Read the [approved workflow specification](../approved-workflows.md) and [implementation status](../implementation-status.md) before changing the application. The mockup demonstrates UX; it is not evidence that the production application implements a feature.

These files are on branch `codex/approved-workflows` in `SnoogleBunny/Project-HitLink`. In a new clone:

```sh
git clone --branch codex/approved-workflows https://github.com/SnoogleBunny/Project-HitLink.git
cd Project-HitLink
```

Open `docs/mockups/preview.html` directly in a current browser. No application server, database, account, API key or dependency installation is needed to view it. The preview loads Google Fonts and pinned Lucide/Floating UI scripts from public CDNs; an internet connection supplies the intended fonts, icons and tooltips. Core screens still use fallback fonts if font loading fails.

## Explore the design

Use **Explore as** at the top to switch roles. **Browse 24 workflows** below the application opens the broader flow index. Member scenarios include weekly/monthly limits, an interrupted connection, a required signature, payment attention, late cancellation and unlimited access. Theme controls switch light/dark appearance.

| Role | Starting screen | Included areas |
| --- | --- | --- |
| Gym owner | Today | Class schedule/editor, dated changes and coach assignments, rosters, members, memberships, billing, waivers, website, settings, migration, exports and support |
| Member / guardian | Classes | Date-based booking, allowance states, household selection, membership, billing, forms and account |
| Life coach | Clients | Client programs, daily notes, appointments, continuity and closure |
| Coaching client | Notes | Shared daily notes, program and appointments |
| New visitor | Memberships | Public pricing, trial, enrollment, draft terms/privacy and not-found page |

The mockup contains 37 screen definitions. Its 24 workflow shortcuts cover trials, class changes, capacity/waitlists, attendance, enrollment, cancellation, freezes, payment recovery, punch cards, refunds, guardian forms, migration/cutover, offboarding/support, coaching delivery and continuity, member allowances, public pricing and legal/social previews.

The sample gym has five daily classes: HIIT Bootcamp 7:15–8:30am; HIIT/Hyrox 4:30–5:30pm; Beginner Padwork 5:30–6:30pm; Beginner Muay Thai and Advanced Muay Thai both 6:30–7:30pm. Schedule examples use 9 October–8 November 2026, with some historical records from 5 October. Dates are deliberately fixed for review.

## Source map for Codex

| Files under `src/` | Responsibility |
| --- | --- |
| `shell.html`, `styles.css`, other CSS files | Page shell, shared styles, spacing, typography, responsive layouts, badges, buttons and state presentation |
| `runtime-head.js`, `runtime-tail.js` | Shared helpers, role/navigation definitions, `views`, `actions`, `flowMap`, rendering and event dispatch |
| `schedule-data.js`, `class-schedule.js` | Demo timetable, recurring series, dated overrides, conflicts and coach assignment model |
| `class-editor.js`, `class-integration.js`, `coach-assignment.js` | Owner class editing and substitute/rotating coach flows |
| `admin.js`, `owner-records.js` | Owner screens and simulated record actions |
| `member.js`, `member-switch.js` | Bookings, allowances, membership, billing and participant selection |
| `coaching.js` | Coach/client programs, notes, sessions and continuity |
| `pricing.js`, `public-pages.js`, `visitor.js`, `workspaces.js` | Website content, public pages, trial/enrollment and workspace settings |
| `cards.js`, `typography.js`, `loading.js`, `mobile.js`, `theme.js`, `motion.js` | Shared presentation and interaction helpers |
| `legal-content.json` | Draft legal copy with explicit business-detail placeholders |
| `preview-template.html` | Generated viewing infrastructure: iframe, host shim and pinned external libraries; edit product UI in the files above |

`assets/social/` contains the seven images embedded by the assembler. The separate historical website-preview package is not required to view or rebuild these workflow mockups.

## Rebuild after a mockup edit

Edit `src/`, then run this from the repository root with Node.js (only built-in modules are used):

```sh
node docs/mockups/assemble.mjs
```

This rebuilds both `hitlink-workflow-mockups.html` and `preview.html` using repository-relative paths. Commit the edited source and regenerated previews together. Screenshots are reference captures, not regenerated by this command; refresh them when the design changes. The original fragment is preserved in content, with Git normalizing text line endings to LF.

## What the preview does and does not prove

People, records, transactions and results are fictional. Booking, attendance, payment, signature, access-control, migration, notification and coaching actions run in browser memory. They do not contact the HitLink backend, process payments or send messages. There is no authentication boundary or automatic waitlist worker here. Some actions create illustrative export data; downloads can be blocked by the preview iframe sandbox.

The wrapper can remember the selected screen, scenario, theme, person and website content in local browser storage. Most simulated operational changes reset on reload. Clear this preview's site storage or open a private browser window to start with fresh review state. Optional `Tweak` controls for spacing, navigation, font pairing and corner radius are only available when a host provides that library; they are not bundled in the standalone preview.

Legal copy, sample prices and social metadata remain design examples. Use the specification and actual application code to resolve behavior before implementing changes. This handoff does not publish a website or alter the running application.
