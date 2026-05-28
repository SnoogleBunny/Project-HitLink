# Design Brief: Admin Daily Command Center

## Problem

Gym owners start the day needing to know whether the business is under control. The current admin dashboard confirms setup status, but it does not quickly answer the operational questions that matter before classes begin: what is happening today, what needs attention, which members or payments are at risk, and where should the owner click next.

The friction is not lack of data. The friction is that the owner has to mentally assemble the day from separate pages.

## Solution

Redesign the admin dashboard into an owner-first daily command center for the first five minutes of the workday. The screen should summarize today's readiness, show a color-coded attention queue, list today's classes chronologically, and provide compact shortcuts into the real workflows already present in Flowstate.

The experience should make the owner feel: "I know what needs handling, and I can act without hunting."

## Experience Principles

1. Visibility over volume -- Make each operational state easy to see at a glance without turning the dashboard into a noisy inbox.
2. Action over analysis -- Prioritize concrete next steps and links into existing workflows instead of charts, broad reporting, or vanity metrics.
3. Calm urgency over alarm -- Use semantic color consistently so urgent items are obvious, while the overall screen still feels composed and boutique.

## Aesthetic Direction

- **Philosophy**: Quiet boutique command center with a hospitality operations palette.
- **Tone**: Calm, precise, premium, grounded, and ready for a real front desk at 7:45am.
- **Reference points**: Boutique studio front-desk software, hospitality check-in desks, premium scheduling tools, and operational boards that use white space and status color with restraint.
- **Anti-references**: SaaS confetti dashboards, dark analytics cockpits, oversized hero cards, heavy gradients, rustic brown dashboards, playful community feeds, and broad KPI/reporting pages.

## Existing Patterns

The redesign should extend the existing admin app rather than introducing a separate UI framework.

- Typography: Admin uses local Geist Sans and Geist Mono via `next/font/local` in `apps/admin-web/app/layout.tsx`.
- Colors: Admin currently defines CSS custom properties in `apps/admin-web/app/globals.css`, including cream background, dark green sidebar, rust accent, success green, muted text, borders, and shadows. The redesign should shift the dashboard toward warm white as the foundation while preserving compatible semantic tokens.
- Spacing: Existing pages use CSS classes such as `shell`, `shell-main`, `dashboard-grid`, `management-grid`, `management-card`, `stack-list`, `stack-item`, `inline-meta`, and `dashboard-actions`.
- Components: Current reusable app vocabulary lives mostly in route CSS/classes and admin components: `AdminShell`, `AdminNav`, `SubmitButton`, and form/page-specific components. `packages/ui` exists but only contains starter `Button`, `Card`, and `Code` components and should not drive this dashboard.
- Framework: Next.js App Router, React 19, TypeScript, Prisma. No Tailwind config, shadcn config, Storybook, or documented token JSON files were found.
- Data available now: today's class summaries, roster counts, trial counts, attendance record counts, failed payment queue, pending staff invite count, member creation page, booking flow, schedule roster routes, and form status utilities. Member-level outstanding form queue is intentionally out of scope for dashboard v1 unless a proper query is added.

## Component Inventory

| Component | Status | Notes |
| --------- | ------ | ----- |
| AdminShell | Modify | Keep the shell pattern but tune dashboard presentation inside it. |
| Readiness header | New | Compact greeting/status sentence plus color-coded metric tiles. |
| Readiness metric tile | New | White tile with semantic rail/dot, strong number, plain label, and optional subtext. |
| Attention summary chips | New | Category totals for billing, attendance, trials, capacity, and invites. |
| Attention item row | New | Prioritized row with severity marker, title, context, and one primary action. |
| Today schedule row | New | Chronological class row with time, class, coach, room, roster/capacity, trials, attendance, and roster action. |
| Quick actions toolbar | New | Compact links for create booking, add member, open today roster, and manage schedule. |
| Status pill | Modify | Preserve concept, refine semantic variants for neutral, success, warning, danger, and info. |
| Dashboard cards/panels | Modify | Reduce oversized card feel; prefer white panels, subtle borders, smaller radii, and tighter rows. |

## Key Interactions

- The owner lands on `/dashboard` and immediately sees whether today is clear or has attention items.
- Color-coded readiness metrics use the same semantic meaning across the header, attention queue, and schedule rows:
  - Neutral/slate: informational and healthy.
  - Green: positive opportunity or completed state.
  - Amber: watch or incomplete.
  - Rust/red: action required.
- The attention section first shows category summaries, then the top five action items sorted by urgency:
  1. Failed payments.
  2. Attendance gaps.
  3. Trial bookings today.
  4. Capacity pressure.
  5. Pending staff invites or setup reminders.
- Each attention row offers one obvious primary action such as `Open billing`, `Open roster`, `Open member`, or `Manage invite`.
- Today's schedule appears as a chronological list. Each row links to the dated roster for that class.
- Quick actions remain compact and practical: `Create booking`, `Add member`, `Open today roster`, and `Manage schedule`.

## Responsive Behavior

- Desktop: Two-column command layout is acceptable, with the attention queue as the visual center and today's schedule nearby. The readiness metrics should scan in one row where space allows.
- Tablet: Metrics wrap into two columns; attention and schedule stack vertically while preserving the attention queue before the schedule.
- Mobile: Use a single-column layout. Metrics become compact stacked tiles or a two-column grid. Attention rows should keep title, context, severity marker, and action visible without horizontal scrolling. The schedule list should remain chronological and avoid dense table layouts.
- The sidebar already collapses into a top section through existing responsive CSS. The dashboard should not depend on a wide sidebar to remain understandable.

## Accessibility Requirements

- Semantic status must not rely on color alone. Include text labels, status words, visible counts, and/or icons/dots with accessible names.
- Maintain WCAG AA contrast for text and interactive controls, especially amber and rust states on white backgrounds.
- Keyboard users must be able to tab through quick actions, attention actions, and schedule roster links in a logical order.
- Focus states must be visible against white panels and the dark sidebar.
- Use landmarks and headings so screen reader users can jump between readiness, attention, schedule, and quick actions.
- Dynamic counts should be plain text rendered on the server for the initial dashboard load; avoid hiding critical information behind hover-only UI.

## Out of Scope

- Redesigning every admin page.
- Building a reporting or analytics dashboard.
- Coach-first dashboard redesign; coaches continue to use the roster-first `Today roster` surface.
- New charts, trend lines, or revenue analytics.
- Form exception queue on the dashboard unless a proper outstanding-forms query is intentionally added.
- New notification delivery, messaging, or automated reminders.
- New member, booking, billing, or roster flows beyond linking to existing routes.
- Replacing the project with Tailwind, shadcn, Storybook, or a new component framework.
