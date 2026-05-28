# Build Tasks: Admin Daily Command Center

Generated from: `.design/admin-daily-command-center/DESIGN_BRIEF.md`  
Date: 2026-05-25

## Foundation

- [x] **Apply command center tokens to admin globals**: Extend `apps/admin-web/app/globals.css` with the white-forward hospitality palette, semantic status tokens, tighter radii, subtle shadows, focus styles, and bridge variables from `DESIGN_TOKENS.css` without redesigning every admin page. _Modifies: existing CSS variables and shared admin classes._

- [x] **Create dashboard data aggregator**: Add a dashboard-focused helper in `apps/admin-web/lib` that gathers today's classes, failed payment count/items, pending invite count, setup counts, readiness metrics, and top attention items in one owner-scoped call. _Reuses: `requireOwnerWorkspaceContext`, `listTodayClasses`, `listFailedPaymentQueue`, staff invite/count patterns, Prisma counts._

- [x] **Test dashboard aggregation rules**: Add focused Vitest coverage for attention sorting, metric counts, capacity pressure, attendance-left calculation, and empty/healthy states. _New test; reuses existing admin lib test style._

## Core UI

- [x] **Build the readiness header slice**: Replace the current setup-first dashboard opening with a compact greeting/status sentence and color-coded readiness metrics for classes today, booked spots, trials, attendance left, and failed payments. _Creates: readiness header and metric tile markup in `/dashboard`; depends on dashboard aggregator._

- [x] **Build semantic status primitives**: Add reusable dashboard CSS classes for status chips, severity rails, metric states, and accessible status text across neutral, success, warning, danger, and info. _Modifies: `.status-pill`; creates dashboard-specific status classes._

- [x] **Build Needs Attention**: Add the category summary chips and top five attention item rows with severity markers, concise context, and one primary action per item. _Creates: attention panel and attention row UI; reuses existing routes for billing, roster, member, and staff invite actions._

- [x] **Build Today's Schedule timeline**: Replace grid-heavy schedule summary with a chronological class list showing time, class, coach, room, roster/capacity, trials, attendance state, and `Open roster` links with `date=YYYY-MM-DD`. _Creates: schedule row UI; reuses `TodayClassSummary` and roster URL pattern._

- [x] **Build compact Quick Actions**: Add a toolbar linking to create booking, add member, today roster, and manage schedule while keeping secondary setup links lower priority. _Creates: quick actions toolbar; reuses existing `.button` classes and routes._

- [x] **Preserve Setup Snapshot below the daily loop**: Move existing setup counts into a compact lower-priority panel so programs, rooms, templates, membership plans, and pending invites remain visible without dominating the page. _Modifies: existing dashboard count cards._

## Interactions & States

- [x] **Implement empty and healthy states**: Show calm states for no classes today, no attention items, no failed payments, no trials, and zero attendance left while keeping sections visible and useful. _Creates: empty-state variants; reuses existing `empty-state` vocabulary._

- [x] **Wire attention actions to real destinations**: Ensure billing items link to `/dashboard/billing`, attendance/capacity/trial items link to dated rosters, member-related items link to profiles when IDs are available, and invites link to `/dashboard/staff-invites`. _Reuses: existing URL strategy; depends on attention items._

- [x] **Keep forms intentionally out of the queue**: Confirm the dashboard does not surface form exceptions until a proper outstanding-forms query exists; keep form management reachable through nav only. _Verification task; protects brief scope._

## Responsive & Polish

- [x] **Responsive dashboard layout pass**: Tune desktop, tablet, and mobile layouts so readiness metrics wrap cleanly, attention stays before schedule, schedule rows avoid horizontal scrolling, and action buttons remain readable. _Breakpoints: 375px, 768px, 1024px, 1280px._

- [x] **Accessibility pass**: Verify heading order, landmarks, keyboard focus, color contrast, status text that does not rely on color alone, and logical tab order through quick actions, attention actions, and schedule roster links. _Reuses: AdminShell landmarks; modifies CSS focus states if needed._

- [x] **Visual QA in browser**: Run the admin app, open `/dashboard`, and inspect screenshots at desktop, tablet, and mobile widths for the quiet boutique command center direction, text fit, color visibility, and no overlapping UI. _Uses: local browser verification._

## Review

- [x] **Design review**: Run `/design-review` after the dashboard is built and save findings/screenshots under `.design/admin-daily-command-center/`.
