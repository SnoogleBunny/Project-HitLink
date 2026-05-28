# Design Review: Admin Daily Command Center

Reviewed against: `DESIGN_BRIEF.md`  
Philosophy: Quiet boutique command center with a hospitality operations palette  
Date: 2026-05-26

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| ---------- | ---------- | ----------- |
| `screenshots/dashboard-preview-desktop-1280.png` | Desktop (1280 x 1100) | Full dashboard preview with sidebar, readiness, owner queue, quick actions, schedule, and setup snapshot. |
| `screenshots/dashboard-preview-tablet-768.png` | Tablet (768 x 1100) | Stacked shell and dashboard preview with two-column readiness metrics. |
| `screenshots/dashboard-preview-mobile-375.png` | Mobile (375 x 1200) | Single-column owner-first flow with readable cards and full-width actions. |
| `screenshots/live-dashboard-desktop-1280.png` | Desktop (1280 x 1100) | Production build, seeded demo owner dashboard after login. |
| `screenshots/live-dashboard-tablet-768.png` | Tablet (768 x 1100) | Production build, seeded demo owner dashboard after login. |
| `screenshots/live-dashboard-mobile-375.png` | Mobile (375 x 1200) | Production build, seeded demo owner dashboard after login. |

All screenshots are in `.design/admin-daily-command-center/screenshots/`.

## Review Scope

The review now includes both the static design preview and the real database-backed `/dashboard` page. Docker/Postgres was started, migrations were confirmed current, the demo seed was refreshed, and the admin app was checked through a production `next build` / `next start` run on localhost.

## Summary

The implementation matches the brief: the dashboard now opens with owner readiness, gives color-coded operational status without becoming noisy, and keeps concrete actions close to the exceptions. The visual result reads as a quiet hospitality command center: warm white panels, dark green shell, muted premium typography, and amber/rust/green status states that are visible but composed.

## Must Fix

None found.

## Should Fix

None found.

## Could Improve

1. **Consider a dedicated hover/focus state screenshot later**: The CSS includes visible focus and hover states, but the review screenshots only capture default responsive states. This is polish-level follow-up, not a blocker.

## Checklist

### Visual Hierarchy

Pass. The readiness summary is the first meaningful content in `apps/admin-web/app/dashboard/page.tsx`, followed by the owner queue and then schedule/setup. The desktop screenshot keeps attention as the primary panel, while tablet and mobile preserve the same owner-first order in both preview and live captures.

### Consistency

Pass. Dashboard panels, status chips, metric tiles, severity rails, action tiles, and schedule rows share CSS variables and component-level classes from `apps/admin-web/app/globals.css`. The status meanings are consistent across metrics, queue summaries, attention rows, and schedule chips.

### Aesthetic Fidelity

Pass. The white-forward panels, dark green shell, restrained borders, small radii, and hospitality status palette match the brief's "quiet boutique command center" direction. The UI avoids analytics-dashboard noise, heavy gradients, oversized hero treatment, and generic SaaS decoration.

### Component Quality

Pass. The page reuses `AdminShell`, server-side dashboard helpers, existing `Link` actions, roster URLs, billing routes, and schedule/member destinations. The new aggregation logic lives in `apps/admin-web/lib/dashboard.ts` and is covered by `apps/admin-web/lib/dashboard.test.ts`.

### States and Interactions

Pass. Empty states exist for clear days and no classes; healthy status tones are represented in the aggregation rules; each attention row has one action. Forms are intentionally out of the queue per the brief scope. The live seeded billing state exposed a missing-date copy issue, which was fixed to show "Payment method needs setup" and the next billing date instead of placeholder date text.

### Responsive Behavior

Pass. Playwright checks at 1280, 768, and 375 confirmed no horizontal overflow, no overflowing elements, and no interactive targets under 44 px in the production app. The metric grid moves from five columns to two columns to one column, and attention/schedule rows become single-column on mobile.

### Accessibility

Pass. The page uses sections with `aria-labelledby`, named links/buttons, visible focus styles, status text labels plus dots, and non-color-only severity labels. Contrast checks passed for body, muted, sidebar, success, warning, danger, and info text/background pairs; warning was adjusted to `#965f0f` to pass against the amber background.

### Typography

Pass. The app uses the existing Geist font variables. The preview now loads the same font assets, font sizing avoids viewport-based scaling, and negative letter spacing was removed from touched admin headings.

### Dark Mode

Pass for token readiness. Light and dark status/background tokens exist in `apps/admin-web/app/globals.css`, including `prefers-color-scheme: dark`. The task focused on the white-forward owner dashboard, so dark screenshots were not captured.

### Mobile-First

Pass. The 375 px live screenshot shows a single-column flow, readable text, no horizontal scroll, and full-width primary row actions where needed.

## Verification

- `PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --filter admin-web test -- dashboard.test.ts owner-workspace.test.ts`
- `PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --filter admin-web lint`
- `PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --filter admin-web check-types`
- `PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH /usr/local/bin/pnpm db:up`
- `PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH /usr/local/bin/pnpm db:migrate:deploy`
- `PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH /usr/local/bin/pnpm db:generate`
- `PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH /usr/local/bin/pnpm db:seed`
- `PATH=/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH /usr/local/bin/pnpm --filter admin-web build`
- Static localhost screenshot/metrics sweep at 1280, 768, and 375 px.
- Live production localhost login and dashboard screenshot/metrics sweep at 1280, 768, and 375 px.
- WCAG contrast spot-check for the dashboard foreground/background token pairs.
