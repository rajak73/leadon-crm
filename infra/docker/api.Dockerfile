# LeadOS — single image serving the API and the built web app from one origin.
#   docker build -f infra/docker/api.Dockerfile -t leados .
#   docker run -p 4000:4000 -e DATABASE_URL=postgresql://… -e JWT_SECRET=$(openssl rand -base64 48) leados
# Needs a PostgreSQL database (DATABASE_URL); migrations run on every start.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm --filter @leados/api exec prisma generate --schema=../../prisma/schema.prisma \
 && pnpm --filter @leados/shared build \
 && pnpm --filter @leados/web build \
 && pnpm --filter @leados/api build
# Self-contained production install of the API (no dev dependencies).
RUN pnpm --filter @leados/api deploy --prod --ignore-scripts /out \
 && cp -r prisma /out/prisma \
 && cp -r apps/web/dist /out/web \
 && cd /out && node node_modules/prisma/build/index.js generate --schema=prisma/schema.prisma \
 && rm -rf /out/src /out/tests /out/*.config.ts /out/tsconfig.json

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST_DIR=/app/web
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/server.js"]
