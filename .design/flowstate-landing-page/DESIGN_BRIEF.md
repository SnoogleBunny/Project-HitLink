# Design Brief: Flowstate Landing Page

## Problem

Martial arts gym owners are stuck using software that interrupts the rhythm of the gym. Scheduling, attendance, waivers, memberships, billing, and parent accounts feel fragmented or fragile, so owners keep mental tabs open instead of trusting the system. They need confidence that operations will run cleanly without turning the gym into a software project.

## Solution

Create a premium public landing page for Flowstate that makes the product feel calm, reliable, and inevitable. The page should lead with the brand as the hero-level signal, frame Flowstate as martial arts gym software "reliable enough to disappear," and invite early gyms to join the Founding Gym waitlist for 15% off monthly pricing, grandfathered after full release.

The experience should feel like entering a quiet, well-run training space: atmospheric, composed, and disciplined. It should avoid dashboard clutter in the hero. Product UI can be represented by a deliberate neutral placeholder plane that will later be replaced with real Flowstate UI.

## Experience Principles

1. **Presence over persuasion** -- The page should create belief through atmosphere and restraint, not through stacked cards, stat strips, or noisy SaaS proof points.
2. **Reliability over feature volume** -- Every section should reinforce that Flowstate makes operations dependable and seamless, not merely that it has many modules.
3. **Specificity over generic SaaS** -- Speak directly to Muay Thai, striking-style martial arts, and broader martial arts gyms so the page cannot be mistaken for any other gym software brand.

## Aesthetic Direction

- **Philosophy**: Premium calm for martial arts operations; quiet confidence, low friction, composed motion, and tactile training-space atmosphere.
- **Tone**: Calm, assured, focused, modern, and mature.
- **Reference points**: Editorial product launches, boutique fitness brand photography, high-end wellness/sport surfaces, and software pages that treat whitespace and image as the main composition.
- **Anti-references**: Generic SaaS dashboards, purple-on-white startup templates, floating cards in the hero, icon grids above the fold, gritty fight-promo visuals, loud combat-sports branding, and competitor-comparison hero copy.

## Existing Patterns

This landing page is a new public app surface. It should follow repo engineering conventions but does not need to inherit the admin/member app's operational UI language.

- Typography: Existing apps load local Geist fonts. The landing page should use a more expressive purposeful type choice, avoiding Inter, Roboto, Arial, and default system stacks. If external fonts are used, load them through Next font handling or local assets for performance.
- Colors: Existing admin/member apps use green, cream, muted earth tones, and CSS custom properties. Flowstate should define its own CSS variables with a premium calm palette: deep green/ink, warm stone, soft mist, muted graphite, and one restrained accent.
- Spacing: Existing apps use CSS custom properties and responsive constraints. Flowstate should define a landing-specific spacing scale with generous first-viewport breathing room.
- Components: Shared `packages/ui` components are starter/demo-level and should not drive this page. Build page-specific components inside `apps/landing-web`.
- App state: `apps/landing-web` currently exists as an empty folder. The new page should be scaffolded as a separate Next app on port `3003`.

## Component Inventory

| Component | Status | Notes |
| --------- | ------ | ----- |
| Landing app shell | New | Separate `apps/landing-web` Next app with metadata, font loading, and global CSS. |
| Brand configuration | New | Central content/config file for Flowstate copy, CTAs, SEO targets, and offer language. |
| Full-bleed hero | New | First viewport as one composition: brand, headline, support sentence, CTA group, atmospheric image, and neutral UI placeholder plane. No cards or badges. |
| Waitlist form | New | Real form UI with accessible fields, success/error states, and clear "Founding Gym" offer context. Backend handling may be local server action or simple persistence strategy chosen during build planning. |
| Demo CTA | New | Secondary route/action for demo interest, likely mailto or lightweight form until scheduling exists. |
| Trust/operations sections | New | One job per section; explain reliability, daily operations, member self-service, and parent/billing confidence without dense cards. |
| Competitor replacement SEO section | New | Lower-page answer-style content for alternative/replacement intent without naming competitors in the hero. |
| Founding Gym offer section | New | Communicates 15% off monthly pricing, grandfathered after launch, without publishing full pricing numbers. |
| Footer | New | Minimal brand, contact, legal/navigation links, and competitor/alternative answer links if useful for SEO. |

## Key Interactions

- User clicks **Join Waitlist** in the hero or offer section, and focus moves to the waitlist form.
- User submits waitlist details. The interface validates required fields, shows a pending state, then shows a calm success confirmation that reinforces Founding Gym pricing.
- User clicks **Book a Demo** and is routed to a low-friction demo request path, not a fake pricing flow.
- Smooth in-page navigation should feel intentional and restrained.
- Motion should support presence: slow hero image entrance, gentle UI placeholder reveal, and subtle section transitions. Avoid noisy looping motion.

## Responsive Behavior

- Desktop: The first viewport is a single full-bleed composition with Flowstate as the dominant signal and the atmospheric visual plane spanning the viewport. Secondary sections should breathe and avoid dense grids.
- Tablet: Preserve the hero composition but reduce image/copy tension; CTAs remain visible without introducing extra content above the fold.
- Mobile: Brand, headline, support sentence, and CTAs appear first; the atmospheric visual remains dominant but cropped intentionally. The UI placeholder should remain visible as a future product image slot without feeling like a card.
- Waitlist form must be easy to complete on mobile with large targets, clear labels, and no multi-column fields on narrow screens.

## Accessibility Requirements

- Maintain WCAG AA contrast for text and interactive controls.
- All form fields require persistent labels, helpful validation messaging, and keyboard-accessible focus states.
- CTA links and buttons must have clear accessible names and visible focus outlines.
- Motion should respect `prefers-reduced-motion`.
- The atmospheric hero image must have appropriate alternative text if rendered as an image; decorative visual layers should be hidden from assistive technology.
- The page must preserve semantic heading order and use landmark regions.

## Out of Scope

- Full product UI screenshots are out of scope; use a neutral grey placeholder plane for future UI imagery.
- Publishing exact monthly pricing numbers is out of scope.
- Direct competitor callouts in the hero are out of scope.
- Full white-label/multi-domain routing is out of scope for this first landing page.
- A full brand rename across admin/member/API apps is out of scope; this brief covers the public Flowstate landing page only.
- Design review is not part of this phase and should run separately after the build exists.
