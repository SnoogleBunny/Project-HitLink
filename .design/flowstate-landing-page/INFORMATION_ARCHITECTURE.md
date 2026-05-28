# Information Architecture: Flowstate Landing Page

## Site Map

- Home `/`
  - Hero `/#top`
  - Reliability promise `/#reliability`
  - Daily operations `/#operations`
  - Founding Gym offer `/#founding-gym`
  - Waitlist form `/#waitlist`
  - Competitor alternative answers `/#alternatives`
  - Footer `/#footer`

## Navigation Model

- **Primary navigation**: Minimal anchor nav with `Reliability`, `Founding Gyms`, and `Alternatives`. Maximum three text links so the first viewport stays composed.
- **Secondary navigation**: In-page CTA links only. Avoid section-level tabs, icon clusters, or card-based navigation.
- **Utility navigation**: `Book a Demo` as a secondary action. No login link in the first version unless product auth is intentionally exposed later.
- **Mobile navigation**: No hamburger for v1. Show brand plus a compact `Join Waitlist` CTA; section links can move to the footer.

## Content Hierarchy

### Home

1. **Flowstate brand and hero promise** -- The brand must be the strongest first-viewport signal. The hero communicates calm reliability before feature detail.
2. **Primary CTA group** -- `Join Waitlist` and `Book a Demo` support the early adopter acquisition goal.
3. **Full-bleed atmospheric martial arts visual** -- Establishes premium calm and category specificity. Includes a neutral future-UI placeholder plane, not a dashboard card.
4. **Reliability section** -- Explains what "reliable enough to disappear" means in daily operations.
5. **Operations section** -- Names the operational loops Flowstate handles: memberships, bookings, waivers, attendance, billing, parent accounts, and member self-service.
6. **Founding Gym offer** -- Presents 15% off monthly pricing, grandfathered after launch, without public pricing numbers.
7. **Waitlist form** -- Captures real leads with accessible fields and submission feedback.
8. **Alternatives/replacement content** -- Lower-page answer content for users searching for competitor alternatives and martial arts gym software replacements.
9. **Footer** -- Brand, compact navigation, contact/demo link, and legal placeholders.

## User Flows

### Join Founding Gym Waitlist

1. User lands on `/`.
2. User reads the Flowstate promise and sees the calm martial arts atmosphere.
3. User selects `Join Waitlist`.
4. Page scrolls to `/#waitlist` and focuses the first field.
5. User enters name, gym name, email, martial arts style, and optional note.
   - If required fields are missing -> show inline validation without losing entered values.
   - If submission succeeds -> show success confirmation that references Founding Gym pricing.
   - If submission fails -> show a calm retry message and preserve input values.

### Request Demo

1. User selects `Book a Demo`.
2. User is taken to a lightweight demo request path or mailto-style contact action for v1.
3. The page should not imply an automated scheduling system exists unless it is implemented.

### Research Replacement Options

1. User arrives from a search query such as "Zen Planner alternative for martial arts gyms" or "martial arts gym management software replacement."
2. Hero establishes Flowstate as a premium martial arts-specific brand.
3. Lower alternative section answers comparison/replacement intent without making the page competitor-led.
4. User proceeds to waitlist or demo CTA.

## Naming Conventions

| Concept | Label in UI | Notes |
| ------- | ----------- | ----- |
| Public product | Flowstate | Use throughout landing page; do not use the old internal name publicly here. |
| Early customer program | Founding Gym pricing | Premium, scarce, and clear without sounding gimmicky. |
| Primary conversion | Join Waitlist | Main CTA across hero, offer, and form. |
| Secondary conversion | Book a Demo | Lower-friction sales conversation path. |
| Product promise | Reliable enough to disappear | Encapsulates reliability plus seamlessness. |
| Future product visual | Product preview placeholder | Use neutral language internally; do not label the grey plane in the hero. |

## Component Reuse Map

| Component | Used on | Behavior differences |
| --------- | ------- | -------------------- |
| Landing shell | Home | Owns metadata, fonts, and global theme variables. |
| Header/nav | Home | Desktop shows anchor links and CTA; mobile shows brand and primary CTA only. |
| Hero composition | Home | Full-bleed visual plane with brand-led copy and future UI placeholder. |
| Section block | Reliability, operations, alternatives | One purpose per section; no decorative cards unless needed for interaction. |
| Waitlist form | Waitlist | Real form state, validation, pending, success, and error handling. |
| CTA group | Hero, offer, footer | Primary/secondary treatments remain consistent. |

## Content Growth Plan

- **Alternatives content** can grow into dedicated pages later, such as `/alternatives/zen-planner`, `/alternatives/pushpress`, or `/alternatives/mindbody`. For v1, keep it on the landing page as concise answer content.
- **Founding Gym offer** can evolve into a pricing page later. For v1, no public pricing numbers.
- **Product preview** can replace the grey placeholder with real UI imagery when Flowstate UI is ready.
- **Resources** are out of scope for v1; avoid adding blog/resource navigation until there is content.

## URL Strategy

- Pattern: Single public route `/` with semantic anchors.
- Dynamic segments: None for v1.
- Query parameters: None required for v1. Future campaign tracking can use standard UTM parameters without changing page behavior.
- Form submission: Prefer server action inside `apps/landing-web` for v1 if persistence can be implemented locally. If persistence is deferred, the form must still provide a real submission endpoint or clearly logged capture path, not a visual-only shell.
