# Build Tasks: Flowstate Landing Page

Generated from: `.design/flowstate-landing-page/DESIGN_BRIEF.md`  
Date: 2026-05-28

## Foundation

- [x] **Create the Flowstate landing app slice**: Build `apps/landing-web` as a separate Next app on port `3003`, with metadata, font loading, global CSS, and the premium-calm token system applied. _Creates: landing shell, app config, global theme._
- [x] **Create landing content and lead model**: Add a central Flowstate content/config module plus a waitlist submission type and storage path so copy, SEO targets, offer language, and form fields are not scattered through JSX. _Creates: brand/content config and waitlist data helpers._

## Core UI

- [x] **Build the full-bleed hero composition**: Create a brand-first first viewport with Flowstate as the dominant signal, one headline, one support sentence, CTA group, atmospheric martial arts image, and neutral UI placeholder plane. _Creates: hero section; depends on tokens._
- [x] **Build reliability and operations sections**: Add restrained sections that explain "reliable enough to disappear" and the daily loops Flowstate handles without dense card grids or dashboard clutter. _Creates: section components._
- [x] **Build Founding Gym offer section**: Present 15% off monthly pricing, grandfathered after launch, without public pricing numbers; reinforce premium early access. _Creates: offer section and CTA reuse._
- [x] **Build alternatives SEO/AEO section**: Add lower-page answer content for competitor replacement and martial arts gym software alternative searches without making the page competitor-led. _Creates: answer section._

## Interactions & States

- [x] **Build real waitlist form**: Implement accessible required fields, server action submission, pending state, validation errors, persisted capture, and success confirmation tied to Founding Gym pricing. _Creates: client form component plus server action._
- [x] **Build CTA and navigation behavior**: Wire `Join Waitlist` to focus the form, `Book a Demo` to a low-friction contact action, and mobile navigation to stay minimal. _Creates/modifies: CTA components._
- [x] **Add intentional motion**: Add 2-3 restrained motions: hero atmosphere entrance, UI placeholder reveal, and section/form presence transitions, all respecting `prefers-reduced-motion`. _Creates: CSS motion rules._

## Responsive & Polish

- [x] **Responsive layout pass**: Verify the first viewport remains one composition on desktop, tablet, and mobile; ensure the hero image remains dominant and the UI placeholder does not become a card. _Breakpoints: 375, 768, 1280._
- [x] **Accessibility and SEO pass**: Validate semantic headings, form labels, focus states, contrast, metadata, Open Graph, structured answer copy, and no hidden competitor stuffing. _Creates/modifies: metadata and accessibility polish._
- [x] **Performance pass**: Confirm static rendering where possible, optimized generated image usage, no unnecessary dependencies, and cache-friendly assets. _Verifies: build output and asset sizing._

## Review

- [ ] **Design review**: Run `/design-review` separately after the build to critique the implementation against the brief.
