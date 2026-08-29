# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-alpine

# --- Basis ------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# --- Abhängigkeiten ---------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Entwicklung (Bind-Mount + Hot Reload) ----------------------------------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "dev"]

# --- Build ------------------------------------------------------------------
FROM deps AS builder
COPY . .
RUN pnpm build

# --- Produktion -------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

# `output: "standalone"` liefert server.js plus nur die wirklich benötigten
# node_modules. public/ und .next/static werden nicht automatisch kopiert.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrationen und Wartungsskripte. Sie laufen aus DIESEM Image – der
# standalone-Output enthält `pg` bereits, weil die Anwendung es importiert.
# Ein eigenes Migrations-Image wäre reiner Ballast.
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs db/migrations ./db/migrations

# Mount-Point für das proofs-Volume; muss dem Runtime-User gehören.
RUN mkdir -p /data/proofs && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
