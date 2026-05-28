# Working Demo State

Last audited: 2026-05-23  
Tags: #demo

## Local URLs

- Admin: http://localhost:3000
- Member: http://localhost:3001
- API health: http://localhost:3002/api/v1/health

## Verified Working

- Admin signup.
- Owner login.
- Workspace onboarding.
- Dashboard navigation.
- Program creation.
- Room creation.
- Weekly schedule template creation.
- Member creation.
- Member portal provisioning.
- Membership plan creation.
- Member membership assignment.
- Punch-card and drop-in product creation.
- Owner-granted punch card.
- Member portal login.
- Member schedule browsing.
- Member class booking.
- Bookings page.
- Owner roster view after member booking.
- Billing settings page.
- Public trial page render.
- API health check.

## Known Demo Credentials

These are local demo credentials from the latest audit database:

- Admin: `demo-1779528710445@example.com` / `DemoPass123!`
- Member: `member-1779528764540@example.com` / `MemberPass123!`

## Known Limits

- Live Stripe actions need real Stripe credentials and webhook setup.
- Staff invite emails and coach acceptance are not complete.
- API app is intentionally thin.
- Alvin's separate frontends were not found in this repo or nearby searched folders.
- The local `flowstate_dev` database had migration-history drift during audit; fresh migrations were validated against a temporary clean database after migration ordering was fixed.

## Verification Results From Latest Audit

- `pnpm lint`: pass.
- `pnpm check-types`: pass.
- `pnpm test`: pass.
- `pnpm build`: pass.
- `curl http://localhost:3002/api/v1/health`: `{"ok":true}`.

