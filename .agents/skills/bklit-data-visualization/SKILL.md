---
name: bklit-data-visualization
description: Use for React infographics and Bklit UI data charts.
version: 1.0.0
author: Flowstate
license: MIT
metadata:
  hermes:
    tags: [bklit, charts, data-visualization, infographics, react, accessibility]
    related_skills: [impeccable, motion-scroll-animations, local-web-demo-verification]
---

# Bklit UI Data Visualization

## Overview

Use Bklit UI as the default component source for React charts and data-graph sections when a project needs an infographic, operational dashboard visualization, or evidence-led narrative. Use the approved logic-only Impeccable install only to inform critique of hierarchy and product continuity; Design owns approved visual hierarchy, UX owns comprehension and accessibility acceptance criteria, and Frontend implements the bounded packet. Do not run Impeccable hooks, live mode, `npx impeccable`, or bundled scripts. This skill governs chart choice, data truth, Bklit integration, accessibility, and verification.

Bklit UI is an independent open-source project and a Vercel OSS Program member. It is not a Vercel-owned component library. Its chart components and shadcn registry are MIT licensed. Bklit Studio is proprietary: use the hosted Studio only for non-code visual exploration. Do not export or incorporate Studio-generated code, and never copy, redistribute, or modify Studio source.

Authoritative sources:

- `https://github.com/bklit/bklit-ui`
- `https://ui.bklit.com/docs`
- `https://ui.bklit.com/studio`

## When to Use

Use for:

- React/Next.js charts and data-rich dashboard sections
- Infographic-style evidence blocks based on real, approved data
- Trends, category comparisons, funnels, flows, distributions, geography, and KPI context
- Replacing improvised SVG or CSS chart drawings with maintained components

Do not use for:

- Decorative charts with invented numbers
- Static illustrations that do not encode data
- Native-mobile implementations
- A chart where a sentence, number, or table is clearer
- Copying Bklit Studio source or proprietary behavior

## Required Workflow

### 1. Establish design and data authority

Load Impeccable and inspect the existing product tokens, typography, spacing, chart precedents, and target viewport. Identify the data owner, source, unit, time range, timezone, update cadence, and whether values are actual, seeded-demo, or explicitly illustrative.

Completion criterion: every displayed measure has a documented source and meaning; no number was invented to improve the composition.

### 2. Decide whether a chart is warranted

Use a chart only when it improves comparison, change detection, composition, or flow comprehension. Prefer:

- A single metric plus context for one KPI
- A semantic table for exact lookup
- Plain prose for one conclusion
- A chart for patterns across multiple values

Completion criterion: the chart has one explicit reader question it answers.

### 3. Select the chart by analytical task

| Reader question | Default Bklit component | Notes |
|---|---|---|
| How did this change over time? | Line or area chart | Use a line for precise comparison; area only when magnitude/volume matters. |
| Which category is larger? | Bar chart | Start quantitative axes at zero unless a clearly labeled analytical reason requires otherwise. |
| How do two measures vary together? | Scatter chart | Explain encodings and outliers. |
| How does volume move between stages/entities? | Sankey chart | Keep node count small and label flows directly. |
| Where does a process lose volume? | Funnel chart | Show counts and rates; never imply causality. |
| How do multiple series/types combine? | Composed chart | Use sparingly; avoid mixed scales without prominent labeling. |
| What is the distribution across geography? | Choropleth | Normalize for population/exposure when required; include a legend and data gaps. |
| What share belongs to each part? | Ring or pie chart | Use only for a small number of mutually exclusive parts; bars are usually clearer. |
| Is one KPI inside known thresholds? | Gauge | Thresholds must come from approved policy, not aesthetics. |
| What is the OHLC movement? | Candlestick | Only for genuine open/high/low/close data. |
| How do several normalized dimensions compare? | Radar | Discouraged; use grouped bars unless the shape itself answers a real question. |

Completion criterion: the selected chart matches the reader question and its trade-offs are documented.

### 4. Integrate through the official registry

Bklit UI is a shadcn registry. Before running anything, inspect `package.json`, the project component conventions, aliases, Tailwind version, React version, and existing shadcn configuration. Do not initialize shadcn or add dependencies when the scoped request does not permit it.

Typical command after prerequisites are approved:

```bash
npx shadcn@latest add @bklit/line-chart
```

Replace `line-chart` with the exact component from current Bklit documentation. Never guess a registry name from memory. Inspect generated files before accepting them; Bklit registry components become project-owned code.

For Next.js App Router:

- Keep database/data loading and authorization in server code.
- Put the interactive chart in the smallest possible client component.
- Validate and normalize data before passing it to the chart.
- Keep timestamps explicit and format them in the approved product timezone.
- Do not fetch sensitive data directly from the browser merely to animate a chart.

Completion criterion: generated files are understood, scoped, licensed, and aligned with existing project conventions.

### 5. Build an infographic composition

Design owns the approved visual system and hierarchy; Impeccable may inform logic-only critique. Compose an infographic from:

1. One concise evidence-led headline
2. A sentence stating what the data represents
3. One primary chart or coordinated small-multiple set
4. Direct labels or restrained annotations for the important pattern
5. Source, unit, date range, timezone, and seeded/illustrative disclosure
6. A table or textual summary for exact values and assistive technology

Do not surround every metric with a card. Do not add a chart merely to fill space. Avoid 3D effects, unlabeled dual axes, excessive legends, rainbow palettes, fake precision, and animation that changes the perceived values.

Completion criterion: a reader can identify the takeaway, evidence boundary, and source without hovering.

## Data Integrity Rules

- Never fabricate customer, revenue, conversion, attendance, or performance values.
- Label seeded demo data as demo data.
- Preserve raw values; format only at the presentation boundary.
- State whether percentages use members, bookings, visits, or another denominator.
- Distinguish zero from missing data.
- Keep sorted order meaningful and stable.
- Use a zero baseline for bars unless truncation is necessary and conspicuously disclosed.
- Do not smooth lines if smoothing could imply observations that do not exist.
- Do not aggregate across incompatible periods, locations, roles, or timezones.
- Never turn correlation into a causal product claim.

## Accessibility

Every chart must include:

- A visible title and concise summary
- Programmatic accessible naming
- Text/table access to the same meaningful values
- Color-independent series distinction where multiple series exist
- WCAG-compliant contrast against the actual surface
- Keyboard-accessible interactive affordances
- Tooltips that supplement rather than contain the only explanation
- Responsive labels without clipping or horizontal page overflow

Use patterns, markers, line styles, direct labels, or icons in addition to color. If a dense chart cannot be made understandable at 390px, provide a purposeful mobile alternative rather than shrinking desktop content.

## Motion Coordination

Load `motion-scroll-animations` only when motion communicates sequence, change, or interaction. Chart animation must:

- Preserve the underlying values at every frame
- Respect `prefers-reduced-motion`
- Avoid scroll hijacking
- Not replay aggressively on minor viewport changes
- Never imply live data when the source is static
- Keep labels/tooltips synchronized with the visible data

A static chart is the default. Motion requires a stated communication purpose.

## Testing and Evidence

Required verification for a changed chart surface:

1. Unit tests for transformation, units, missing values, ordering, and timezone handling
2. Focused component tests for labels, summary, and data-table fallback
3. Runtime screenshots at 390px, 768/1024px, and desktop
4. Keyboard and focus verification
5. Reduced-motion verification when animated
6. Console, page-error, and failed-request diagnostics
7. No horizontal overflow or clipped labels
8. Source/license and generated-file review
9. Lint, typecheck, tests, and production build

For demo data, verify the exact seeded dataset rather than substituting plausible values in tests.

## Common Pitfalls

1. **Calling Bklit a Vercel product.** It is independent and participates in the Vercel OSS Program.
2. **Treating Studio as MIT source.** Only chart components/registry are MIT; Studio source is proprietary.
3. **Installing before checking the stack.** Inspect shadcn, Tailwind, aliases, and dependencies first.
4. **Choosing by appearance.** Select the chart from the analytical question.
5. **Hiding evidence in tooltips.** Provide visible context and a text/table alternative.
6. **Inventing data for polish.** Use approved real or labeled seeded data only.
7. **Animating by default.** Static is correct unless animation improves comprehension.
8. **Desktop-only density.** Design a deliberate mobile form.

## Verification Checklist

- [ ] Impeccable design context loaded
- [ ] Reader question and data source documented
- [ ] Correct chart type selected
- [ ] Current Bklit docs checked
- [ ] MIT chart component used; Studio source not copied
- [ ] Data units, denominator, timezone, range, and demo status visible
- [ ] Accessible summary and exact-value fallback present
- [ ] Mobile/tablet/desktop evidence captured
- [ ] Motion, if any, is purposeful and reduced-motion safe
- [ ] Tests, lint, types, build, console/network, and overflow checks pass
