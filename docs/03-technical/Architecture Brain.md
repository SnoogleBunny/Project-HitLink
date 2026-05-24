# Architecture Brain

## Shape

HitLink is a pnpm/Turborepo monorepo.

Apps:

- `apps/admin-web`: owner/coach admin app.
- `apps/member-web`: member portal and public trial/signing surfaces.
- `apps/api`: thin API app, currently health endpoint.

Packages:

- `packages/auth`: password/session helpers.
- `packages/db`: Prisma schema/client and domain helpers.
- `packages/ui`: shared UI components.
- `packages/types`: shared types.
- `packages/config`: shared config.

## Local Runtime

- Postgres via Docker Compose.
- Root `.env` contains `DATABASE_URL`, Stripe values, app URLs, and forms magic-link secret.
- Admin and member app scripts load `../../.env` before Next starts.

## Important Constraints

- Avoid importing server-only modules such as `next/headers` into client components.
- `"use server"` modules should export async server actions only. Shared form state belongs in non-server modules.
- `packages/db/prisma/schema.prisma` is source of truth for implemented DB shape.
- Migration order matters for fresh demo databases.

## Verification Commands

```bash
pnpm lint
pnpm check-types
pnpm test
pnpm build
pnpm db:up
pnpm db:migrate
```

