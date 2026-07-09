# LeadOS API — multi-stage build
FROM node:20-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# --- deps: install workspace deps (cached) ---
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --filter @leados/api... --no-frozen-lockfile

# --- build ---
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @leados/api prisma:generate
RUN pnpm --filter @leados/api build

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/api /app/apps/api
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
WORKDIR /app/apps/api
EXPOSE 4000
# Apply schema then start (safe for demo/dev; use migrations in real prod).
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
