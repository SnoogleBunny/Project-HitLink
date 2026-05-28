# Information Architecture: Admin Daily Command Center

## Site Map

- Admin entry `/`
  - Login `/login`
  - Signup `/signup`
  - Onboarding `/onboarding`
  - Dashboard `/dashboard`
    - Programs `/dashboard/programs`
      - Edit program `/dashboard/programs/[programId]/edit`
    - Rooms `/dashboard/rooms`
      - Edit room `/dashboard/rooms/[roomId]/edit`
    - Schedule `/dashboard/schedule`
      - New class template `/dashboard/schedule/new`
      - Edit class template `/dashboard/schedule/[templateId]/edit`
      - Dated roster `/dashboard/schedule/[templateId]/roster?date=YYYY-MM-DD`
    - Bookings `/dashboard/bookings`
    - Today roster `/dashboard/coach/today`
    - Members `/dashboard/members`
      - Member profile `/dashboard/members/[memberId]`
      - Member billing `/dashboard/members/[memberId]/billing`
    - Forms `/dashboard/forms`
      - Form detail `/dashboard/forms/[formId]`
    - Membership plans `/dashboard/membership-plans`
      - Edit membership plan `/dashboard/membership-plans/[membershipPlanId]/edit`
    - Access products `/dashboard/access-products`
      - Edit drop-in `/dashboard/access-products/drop-ins/[dropInProductId]/edit`
      - Edit punch card `/dashboard/access-products/punch-cards/[punchCardProductId]/edit`
    - Billing `/dashboard/billing`
    - Billing settings `/dashboard/settings/billing`
      - Stripe return `/dashboard/settings/billing/return`
      - Stripe refresh `/dashboard/settings/billing/refresh`
    - Staff invites `/dashboard/staff-invites`
  - Unauthorized `/unauthorized`

The redesign changes the content structure of `/dashboard`; it does not add new top-level routes.

## Navigation Model

- **Primary navigation**: Keep the existing owner sidebar. `Dashboard` remains first and becomes the daily command center. Existing owner nav items stay available: Programs, Rooms, Schedule, Bookings, Today roster, Members, Forms, Membership plans, Access products, Billing, Billing settings, Staff invites.
- **Coach navigation**: Coaches keep the existing single-item navigation to `Today roster`. The command center is owner-first and should not become the coach landing surface in this phase.
- **Secondary navigation**: The dashboard uses in-page structural sections rather than tabs: Readiness, Needs Attention, Today's Schedule, Quick Actions, and Setup Snapshot. These are content sections, not route changes.
- **Utility navigation**: Account identity and logout remain in `AdminShell`. Billing settings remains a nav item and should not be promoted into the command center except as a contextual link from billing issues when useful.
- **Mobile navigation**: Preserve the current responsive shell behavior where the sidebar stacks above content. Dashboard sections stack in priority order: Readiness, Needs Attention, Today's Schedule, Quick Actions, Setup Snapshot.

## Content Hierarchy

### Dashboard `/dashboard`

1. **Readiness header** -- Comes first because the owner needs a fast answer to "is today under control?" Include a concise status sentence and color-coded metrics.
2. **Needs Attention** -- The main work queue. Summarize categories first, then show the top five action items by urgency.
3. **Today's Schedule** -- Chronological classes provide the owner with the shape of the day and quick access to rosters.
4. **Quick Actions** -- Compact links for common actions that do not necessarily appear in the queue.
5. **Setup Snapshot** -- Lower-priority operational inventory such as programs, rooms, templates, memberships, and pending invites. This preserves useful current dashboard content without letting setup counts dominate the day.

### Readiness Header

1. **Greeting/status sentence** -- Example: "Good morning, Jacky. Today has 6 classes, 48 bookings, 3 trials, and 2 items needing attention."
2. **Metric row** -- Classes today, booked spots, trials, attendance left, failed payments.
3. **Semantic state** -- Each metric must show neutral, success, warning, or danger through color and text.

### Needs Attention

1. **Category summary chips** -- Billing, Attendance, Trials, Capacity, Invites.
2. **Top five action items** -- Ordered by urgency, each with severity, title, context, and one primary action.
3. **Empty state** -- If no items need action, show a compact "Today is clear" state and keep the schedule visible below.

### Today's Schedule

1. **Chronological class rows** -- Time, title/program, coach, room, roster count, capacity, trial count, and attendance status.
2. **Class state chips** -- Trials, full/nearly full, attendance incomplete, attendance complete.
3. **Roster action** -- Each row links to `/dashboard/schedule/[templateId]/roster?date=YYYY-MM-DD`.

### Quick Actions

1. **Create booking** -- Link to `/dashboard/bookings`.
2. **Add member** -- Link to `/dashboard/members`, where the create member form already exists.
3. **Open today roster** -- Link to `/dashboard/coach/today`.
4. **Manage schedule** -- Link to `/dashboard/schedule`.

## User Flows

### Start-of-Day Owner Triage

1. Owner lands on `/dashboard`.
2. Owner reads the readiness sentence and metric row.
3. Owner checks `Needs Attention`.
   - If there are urgent billing items -> owner selects `Open billing` and lands on `/dashboard/billing`.
   - If there is an attendance gap -> owner selects `Open roster` and lands on `/dashboard/schedule/[templateId]/roster?date=YYYY-MM-DD`.
   - If there are trial bookings -> owner opens the class roster or member profile depending on the item.
   - If nothing needs attention -> owner scans `Today's Schedule`.
4. Owner returns to `/dashboard` via sidebar when needed.

### Handle Failed Payment

1. Owner sees a red billing item in `Needs Attention`.
2. Owner selects `Open billing`.
3. Owner lands on `/dashboard/billing`.
4. Owner retries payment, marks update requested, or opens the member billing page.

### Review Class Readiness

1. Owner scans `Today's Schedule`.
2. Owner identifies a class with trials, capacity pressure, or incomplete attendance.
3. Owner selects `Open roster`.
4. Owner lands on the dated roster with the `date` query parameter preserved.

### Add or Book a Member

1. Owner uses `Quick Actions`.
2. `Create booking` opens `/dashboard/bookings`.
3. `Add member` opens `/dashboard/members`.
4. Owner completes the existing form in the destination page.

## Naming Conventions

| Concept | Label in UI | Notes |
| ------- | ----------- | ----- |
| Main owner landing page | Dashboard | Keep the existing nav label. The page behavior changes, not the route name. |
| Dashboard concept | Daily command center | Use in design docs, not necessarily as visible UI copy. |
| Operational issues | Needs attention | Plain and calm; avoids panic language. |
| Today's class list | Today's schedule | Owner-facing and broader than coach-only rosters. |
| Coach class surface | Today roster | Preserve existing label and route. |
| Payment failures | Failed payments | Match existing page language. |
| Trial bookings | Trials | Short label for chips and metrics. |
| Attendance remaining | Attendance left | Clear metric label for incomplete attendance. |
| Capacity risk | Capacity pressure | More precise than "full classes" because near-full classes also matter. |
| Staff onboarding | Staff invites | Preserve existing nav label. |

## Component Reuse Map

| Component | Used on | Behavior differences |
| --------- | ------- | -------------------- |
| `AdminShell` | All protected admin pages | Dashboard uses the same shell but may pass more focused header actions. |
| `AdminNav` | Sidebar navigation | Owner nav remains broad; coach nav stays roster-only. |
| `.button` / `.button-secondary` | Dashboard actions and existing pages | Dashboard actions should be compact and grouped; preserve class names where practical. |
| `.status-pill` | Existing pages and dashboard states | Add semantic variants for neutral, success, warning, danger, and info. |
| `management-card` / dashboard panels | Existing management pages and dashboard | Dashboard should introduce tighter white panels while avoiding a wholesale rewrite of management pages. |
| Roster link pattern | Schedule rows and attention items | Always include `date=YYYY-MM-DD` for dated roster destinations. |

## Content Growth Plan

- **Attention items**: Start with top five only. If more than five exist, show a clear count and route users to the relevant full page rather than expanding into an inbox.
- **Today's schedule**: Can grow vertically with class count. It should remain chronological and not require pagination for typical single-location gym volume.
- **Setup snapshot**: Stays compact. If future setup categories grow, keep them as low-priority links or counts below daily operations.
- **Forms**: Do not add to the dashboard queue until there is a proper outstanding-forms query that can produce accurate member-level action items.
- **Reporting**: Future analytics should live in a separate reporting area, not inside the daily command center.

## URL Strategy

- Preserve existing dashboard URL: `/dashboard`.
- Preserve existing action destinations:
  - Booking creation: `/dashboard/bookings`
  - Member creation/search: `/dashboard/members`
  - Today's roster: `/dashboard/coach/today`
  - Schedule management: `/dashboard/schedule`
  - Failed payments: `/dashboard/billing`
  - Staff invites: `/dashboard/staff-invites`
- Use existing dynamic route patterns:
  - Member profile: `/dashboard/members/[memberId]`
  - Member billing: `/dashboard/members/[memberId]/billing`
  - Dated roster: `/dashboard/schedule/[templateId]/roster?date=YYYY-MM-DD`
- Query parameters:
  - `date=YYYY-MM-DD` is required for class roster links from schedule and attention rows.
  - Existing member search may continue using `q`.
- Do not add new dashboard-specific routes for v1. The page should aggregate and link into existing flows.
