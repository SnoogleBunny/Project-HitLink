---
name: motion-scroll-animations
description: Use for accessible React scroll animations with Motion.
version: 1.0.0
author: Flowstate
license: MIT
metadata:
  hermes:
    tags: [motion, react, scroll-animation, accessibility, performance, nextjs]
    related_skills: [impeccable, bklit-data-visualization, local-web-demo-verification]
---

# Motion Scroll Animations

## Overview

Use Motion (`motion.dev`, npm package `motion`) as the default React animation engine for approved scroll-triggered and scroll-linked interactions. This skill does not refer to unrelated products named MotionAI. Motion is the continuation of Framer Motion and supports React 18/19.

Use the approved logic-only Impeccable install only to inform critique. Design owns approved visual direction and motion intent, UX owns comprehension and accessibility acceptance criteria, and Frontend owns bounded implementation. Do not run Impeccable hooks, live mode, `npx impeccable`, or bundled scripts. This skill owns implementation discipline, accessibility, performance, responsive behavior, and verification.

Authoritative sources:

- `https://motion.dev/docs/react`
- `https://motion.dev/docs/react-scroll-animations`
- `https://motion.dev/docs/react-use-scroll`
- `https://motion.dev/docs/react-use-reduced-motion`
- `https://github.com/motiondivision/motion`

## When to Use

Use for:

- Revealing content when it enters the viewport
- Scroll progress indicators
- Parallax or transforms tied to scroll progress
- Sticky narrative sequences where motion improves comprehension
- Coordinated chart/data reveals after the underlying content is available
- State transitions and micro-interactions that belong to the same visual system

Do not use for:

- Decorative motion without a communication purpose
- Replacing native scrolling or trapping the user in a scroll sequence
- Critical information that exists only during animation
- Native-mobile work
- Background-only code or server components
- A project that already standardizes on another engine unless migration is explicitly scoped

## Required Workflow

### 1. Define the communication purpose

Design states the approved visual/motion intent, UX states the comprehension/accessibility criteria, and Impeccable may inform logic-only critique. Record one reason for each proposed animation:

- **Hierarchy:** directs attention to the next meaningful element
- **Sequence:** explains an ordered process
- **Feedback:** confirms an interaction
- **State change:** makes a transition understandable
- **Spatial continuity:** preserves the relationship between elements

“Looks polished” is not sufficient. Remove animations without a specific purpose.

Completion criterion: every effect has a one-sentence purpose and a static fallback.

### 2. Inspect the existing stack

Check `package.json`, lockfile, React/Next.js versions, existing animation libraries, CSS conventions, Client Component boundaries, and reduced-motion patterns. Do not add both `motion` and `framer-motion` casually. If the project already uses `framer-motion`, preserve it unless migration is explicitly approved.

Preferred new React imports:

```tsx
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
```

Completion criterion: no duplicate engine, speculative dependency, or unauthorized migration is introduced.

### 3. Choose the smallest correct pattern

#### In-view reveal

Use `whileInView` or `useInView` for a one-time viewport reveal:

```tsx
"use client";

import { motion, useReducedMotion } from "motion/react";

export function InViewReveal({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={false}
      whileInView={
        reduceMotion ? undefined : { opacity: [0.85, 1], y: [8, 0] }
      }
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.35 }}
    >
      {children}
    </motion.div>
  );
}
```

`initial={false}` keeps the server-rendered default visible. This pattern adds a small in-view emphasis only after JavaScript runs; it does not hide content before intersection. The static/no-JavaScript experience must remain understandable, and QA must verify the exact route with JavaScript disabled.

#### Scroll-linked progress

Use MotionValues rather than React state:

```tsx
"use client";

import { motion, useScroll, useSpring } from "motion/react";

export function ReadingProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.25,
  });

  return <motion.div aria-hidden="true" className="progress" style={{ scaleX }} />;
}
```

#### Element-relative transformation

Use a ref target with `useScroll({ target, offset })`, then map ranges with `useTransform`. Keep transforms bounded and test all viewport sizes.

Completion criterion: the selected Motion primitive is simpler than custom listeners and does not re-render React on every scroll frame.

### 4. Isolate client behavior

In Next.js App Router:

- Keep data loading, authorization, and static content in Server Components.
- Put Motion hooks in a small leaf Client Component.
- Pass serializable values into the client boundary.
- Do not move an entire route to `"use client"` just to animate one region.
- Avoid hydration-dependent layout changes.

Completion criterion: the smallest practical subtree is client-rendered.

## Hard Rules

### Accessibility

- Respect `useReducedMotion()` and CSS `prefers-reduced-motion`.
- Reduced motion means no parallax, large translation, looping, or scroll-linked movement; replace with static/instant state.
- Never require animation to discover, read, or operate critical content.
- Do not move keyboard focus as a side effect of scrolling.
- Preserve native reading and tab order.
- Avoid flashing and rapid luminance changes.
- Pause or provide control for long-running nonessential animation.

### Scrolling

- Do not hijack wheel/touch input.
- Do not use `window.addEventListener("scroll", ...)` for React visual effects when Motion primitives can express the behavior.
- Do not store continuous scroll position in `useState`.
- Do not add fake smooth scrolling globally.
- Sticky sections must release naturally and work with keyboard, touch, browser zoom, and reduced motion.
- Anchor links and browser back/forward behavior must remain correct.

### Performance

- Prefer `transform` and `opacity`.
- Avoid animating layout properties such as width, height, top, left, margin, or complex shadows during scroll.
- Use `will-change` only on elements that actually animate and remove it when no longer needed if dynamic.
- Keep animated DOM size small.
- Do not create one observer/listener per row in large lists without measuring the cost.
- Prevent expensive chart recalculation on every MotionValue update.
- Keep LCP content immediately renderable; do not delay the hero behind animation.

### Content and data

- Motion may reveal data but must not alter or exaggerate the represented values.
- Do not animate counters from zero when that creates a false temporal story.
- Do not imply live updates for static or seeded data.
- Keep chart axes, labels, and data table synchronized with the visible state.

## Recommended Patterns

| Need | Motion pattern | Default behavior |
|---|---|---|
| Simple reveal | `whileInView` | Once, short distance, opacity + transform |
| Section progress | `useScroll({ target })` | Local progress from 0 to 1 |
| Page progress | `useScroll()` + `useSpring` | Noninteractive decorative indicator |
| Parallax | `useScroll` + `useTransform` | Small bounded range; disabled for reduced motion |
| Sticky narrative | CSS sticky + element-relative progress | Native scroll remains authoritative |
| Reorder/expand | `layout` / `layoutId` | Only on elements that actually change layout |
| Exit/entry | `AnimatePresence` | Preserve focus and route semantics |
| Reusable values | `MotionValue` | Avoid React rerender loop |

## Bklit Chart Coordination

When animating Bklit UI charts:

1. Load `bklit-data-visualization` first.
2. Render truthful static data and labels before motion is considered.
3. Prefer a section reveal over animating every mark.
4. If marks animate, preserve scale/domain and exact tooltip values.
5. Disable animation under reduced motion and during screenshot/visual-regression modes when determinism is required.
6. Avoid replaying chart entry animation on tab changes, resize, or minor scroll oscillation unless replay communicates a real reset.

Completion criterion: the chart remains fully comprehensible and correct with all animation disabled.

## Testing and Evidence

For every user-visible scroll animation:

1. Component test the reduced-motion branch.
2. Browser-test initial, in-view, completed, and restored-navigation states.
3. Load the exact route with JavaScript disabled and verify all critical content and controls remain visible and understandable.
4. Verify keyboard order and focus while scrolled.
5. Test 390px, 768/1024px, and desktop layouts.
6. Test at 200% browser zoom where practical.
7. Capture no-animation/reduced-motion evidence.
8. Check console errors, page errors, failed requests, and hydration warnings.
9. Check horizontal overflow and sticky-section release.
10. Use performance tooling for sustained scroll work; confirm no scroll-driven React render storm.
11. Run lint, typecheck, focused tests, and production build.

Visual evidence must come from the exact candidate, not a separate prototype.

## Common Pitfalls

1. **Calling the library MotionAI.** The implementation target is Motion from `motion.dev` and the `motion` npm package.
2. **Animating before intent and acceptance criteria exist.** Design owns motion intent, UX owns comprehension/accessibility criteria, and Impeccable only informs logic-only critique.
3. **Making a whole page client-side.** Isolate Motion to leaf components.
4. **Using state for scroll position.** Use MotionValues.
5. **Ignoring reduced motion.** Every nontrivial effect needs a static branch.
6. **Scroll hijacking.** Native scrolling remains authoritative.
7. **Animating layout-heavy properties.** Use transform/opacity.
8. **Hiding content until JavaScript runs.** Server-render meaningful content.
9. **Nondeterministic visual tests.** Disable or settle motion before screenshots.
10. **Mixing engines.** One animation engine per scoped surface unless explicitly approved.

## Verification Checklist

- [ ] Design intent and UX acceptance criteria documented; Impeccable used only for logic-only critique
- [ ] Existing animation stack inspected
- [ ] Motion package/import choice matches project conventions
- [ ] Small leaf Client Component used
- [ ] Native scrolling preserved
- [ ] Reduced-motion branch implemented and tested
- [ ] Critical content/controls work without animation
- [ ] Transform/opacity used for scroll-linked work
- [ ] Mobile/tablet/desktop, keyboard, zoom, and overflow checked
- [ ] Browser diagnostics and production build pass
- [ ] Bklit data meaning remains unchanged, if applicable
