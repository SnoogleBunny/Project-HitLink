# Onboarding Business/UX Review

Date: 2026-05-30
Reviewer: Codex
App: admin web at `http://localhost:3000`
Lens: business/UX, not technical implementation

## Test Run

Created local owner account: `codex-onboarding-20260530-0110@flowstate.local`

Workspace created: North Star Martial Arts

Followed path:

1. Sign up for owner account
2. Create workspace/location
3. Land on dashboard
4. Try the most prominent first action: Create booking
5. Create prerequisites manually: program, room, class template
6. Recheck booking and member surfaces

Verified local state after the run:

- Programs: 1
- Rooms: 1
- Class templates: 1
- Members: 0

## Screenshots Captured

- `assets/dashboard-after-first-setup.png`
- `assets/booking-dead-end-no-members.png`
- `assets/member-create-surface.png`
- `assets/schedule-create-after-prereqs.png`

## Executive Read

The flow technically gets an owner from account creation to a workspace, but it does not yet feel like onboarding. It feels like account creation followed by an operational dashboard for an already-configured gym.

The biggest business risk is that a new owner lands in a "Today is clear" command center before the business is actually ready to operate. The product says nothing needs attention, while the real next steps are still missing: programs, rooms, schedule, members, plans/access, and billing.

## Priority Findings

### Must Fix

1. Post-onboarding dashboard sends the wrong signal.

After workspace creation, the first screen says "Good morning, Maya. Today has 0 classes..." and "Today is clear." For a new account, this reads as operational success, not incomplete setup. A gym owner needs an activation path, not a daily triage page.

Recommendation: show a first-run setup checklist until the workspace reaches a minimum usable state. Suggested order:

1. Create first program
2. Create first room
3. Create first weekly class
4. Add first member or trial prospect
5. Create membership/access product
6. Review booking/member portal setup

2. "Create booking" is promoted before it can work.

The dashboard's first quick action is "Create booking," but on a new workspace it leads to disabled controls because there are no members yet. Even after program, room, and class template exist, booking is still disabled until a member exists. The booking page shows counts, but does not give a direct "Add member" recovery path.

Recommendation: hide or demote booking until prerequisites exist, or turn it into a guided empty state: "To create a booking, add a member first." Include direct CTAs for missing prerequisites.

3. Internal roadmap language leaks into customer-facing copy.

Examples seen during the flow:

- "Slice 1 onboarding step"
- "current scheduling slice"
- "next schedule slice"
- "later slices"

This breaks trust and makes the product feel unfinished. Owners do not care what slice the feature came from.

Recommendation: replace with owner-facing language like "This creates your gym profile and primary location" or "Recurring class templates power your weekly schedule."

### Should Fix

4. Required vs optional fields are unclear.

Signup requires full name, email, password, and confirm password. Workspace setup requires workspace name and timezone, while business type and address fields appear equally important. No required markers or helper text explain what is actually needed.

Recommendation: mark required fields, explain why optional fields matter, and consider delaying address details unless they are used immediately.

5. "Workspace name" and "Create your gym workspace" are product-centric.

Gym owners think in terms of business, location, and classes. "Workspace" is useful internally, but the first-run screen would feel more natural as "Create your gym profile" or "Set up your first location."

Recommendation: use "Gym name" or "Business name" in the initial setup flow. Introduce "workspace" later only if the product supports multiple workspaces.

6. Timezone is a raw text input.

`America/Vancouver` is accurate, but it feels technical. If this value is important for schedules and bookings, owners should not have to understand IANA timezone names.

Recommendation: use a searchable timezone select with friendly labels and auto-detect copy.

7. Browser save prompts interrupt the flow.

Firefox surfaced both password-save and address-save prompts during the flow. That is not caused by app UI directly, but the current field/autocomplete choices make those browser interruptions likely.

Recommendation: keep autocomplete for account fields, but review address autocomplete behavior. For local/dev this is noise; for a real owner it can still feel like the app is asking for something unrelated.

### Could Improve

8. Setup snapshot is useful but passive.

The dashboard does show setup counts, but after onboarding the relevant zeroes are below the daily command content and do not act like a checklist.

Recommendation: promote setup readiness above daily readiness until minimum setup is complete.

9. Programs and rooms are clear once discovered.

The program and room pages are simple and fast. The issue is discovery and sequencing, not the forms themselves.

Recommendation: reuse these forms inside a guided setup mode instead of sending users into the full admin navigation immediately.

10. Schedule prerequisite handling is strong.

The class template page handles missing programs/rooms well: it blocks the form, lists missing prerequisites, and links to the right pages. This pattern should be brought to the dashboard and booking pages.

## Recommended First-Run Experience

After workspace creation, do not land on the normal daily command center. Land on a setup-focused dashboard:

Title: "Finish setting up North Star Martial Arts"

Primary checklist:

1. Add your first program
2. Add your training room
3. Create your weekly schedule
4. Add a member or trial prospect
5. Set up memberships or drop-ins
6. Try a test booking

Each checklist item should show:

- Why it matters
- Estimated time
- Completion state
- One clear action

Only after core setup is complete should the product switch the primary dashboard story from "setup" to "daily operations."

## Bottom Line

The core pieces are there, and several individual forms are clean. The onboarding problem is narrative and sequencing: the app treats a brand-new owner like an already-operating gym. Fixing the first-run dashboard and prerequisite-aware CTAs would remove most of the friction without needing a large feature expansion.
