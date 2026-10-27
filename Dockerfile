FROM node:22.23.4-bookworm-slim AS dependencies

WORKDIR /app
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_HOME=/opt/corepack \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm db:generate

FROM dependencies AS build

ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_MEMBER_APP_URL=http://localhost:3001
ARG NEXT_PUBLIC_MEMBER_WEB_URL=http://localhost:3001
ARG NEXT_PUBLIC_FLOWSTATE_APP_URL=http://localhost:3003
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_MEMBER_APP_URL=$NEXT_PUBLIC_MEMBER_APP_URL \
    NEXT_PUBLIC_MEMBER_WEB_URL=$NEXT_PUBLIC_MEMBER_WEB_URL \
    NEXT_PUBLIC_FLOWSTATE_APP_URL=$NEXT_PUBLIC_FLOWSTATE_APP_URL \
    NODE_OPTIONS=--max-old-space-size=3072

# No database or provider credentials are needed to compile the applications.
# Serial builds keep a normal Docker Desktop installation within its memory limit.
RUN pnpm exec turbo run build --concurrency=1

FROM node:22.23.4-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_HOME=/opt/corepack \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HOSTNAME=0.0.0.0

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.33.0 --activate
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /run/hitlink /app/apps/landing-web/data \
    && chown -R node:node /run/hitlink /app/apps/landing-web/data

USER node
EXPOSE 3000 3001 3002 3003
CMD ["pnpm", "--filter", "admin-web", "start"]
