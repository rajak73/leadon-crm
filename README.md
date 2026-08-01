# LeadOS — Instagram Lead Automation & Auto-Reply CRM

LeadOS is a **single-organization** CRM built specifically around one
Instagram Business account: it connects via real Meta OAuth, turns every DM
and comment into a tracked lead, replies automatically (keyword rules or AI),
scores and prioritizes leads, chases quiet ones with multi-step follow-up
sequences, and gives you a Pipeline + Reports view of how it's all converting.

> The codebase still has the bones of a broader multi-tenant CRM underneath
> (users *can* belong to more than one org, and a Super Admin panel exists),
> but the product is designed, tested, and shipped as **one workspace, one
> connected Instagram account**. If you're evaluating this repo, treat the
> Instagram-facing flow as the product — everything else (Contacts, Deals,
> Workflows, Billing, the Social Simulator) still works but isn't part of
> the core pitch, and isn't linked from the sidebar.

---

## Core features

- **Instagram Auto-Reply & Lead Capture** — real Meta webhooks (DMs and
  comments), keyword rules with an AI fallback, automatic name/phone capture
  from the conversation, idempotent processing.
- **Customer 360 Profile Manager** — every lead's full picture in one place:
  Instagram handle, score, tags, deals, tasks, activity timeline, and
  conversation history (`Lead Detail` page — this *is* the customer profile
  for an Instagram-sourced business, not a separate "Contacts" concept).
- **Lead Pipeline & Conversion Tracker** — a Kanban pipeline (auto-created for
  every new workspace) plus a Reports page with real conversion-rate, funnel,
  and trend charts computed from your actual data.
- **AI Lead Scoring & Prioritization** — a weighted heuristic (contact info
  present, engagement, intent keywords, recency, response speed, source
  quality) with an optional real-AI upgrade; sort/filter leads by score, not
  just by "who came in most recently."
- **Automated Follow-up Sequence Builder** — multi-step sequences ("no reply
  in 24h → nudge; still no reply 48h later → check in again"), each step only
  firing if the customer genuinely hasn't been replied to yet by anyone or
  anything (agent, keyword rule, or AI).

---

## Stack

- **API:** Node.js + TypeScript, Express, Prisma ORM, PostgreSQL (Neon in
  production; any real Postgres for local dev — the schema provider is
  `postgresql`, there is no SQLite fallback).
- **Web:** React + Vite, a small hand-rolled design system (no Tailwind/UI
  kit) with CSS variables for theming, `lucide-react` icons, real dark mode.
- **Queue:** BullMQ + Redis if `REDIS_URL` is set, otherwise a periodic cron
  drain (`routes/cron.ts`) — same code path either way.
- **AI:** provider-abstracted (OpenAI / Groq / Gemini) behind a feature flag,
  with deterministic rule-based fallbacks always available so nothing breaks
  when no key is configured.
- **Meta/Instagram:** real OAuth (both "Facebook Login for Business" and the
  newer Page-less "Instagram API with Instagram Login" modes), HMAC-verified
  webhooks, encrypted token storage.
- **Deploys to:** Render (API) + Vercel (web) + Neon (Postgres) on free
  tiers; scales up by changing env vars, no code changes required.

---

## Monorepo layout

```
leados/
├─ apps/
│  ├─ api/        # Express + Prisma backend
│  └─ web/        # React frontend (marketing + app)
├─ packages/
│  └─ shared/     # Types, constants, validation shared by api + web
├─ pnpm-workspace.yaml
└─ package.json
```

---

## Quick start (local)

```bash
# 1. install deps
pnpm install

# 2. configure env (copy + edit) — DATABASE_URL must be a real Postgres
#    connection string; see apps/api/.env.example for every option
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. create the db + generate the Prisma client
createdb leados_dev   # or point DATABASE_URL at an existing Postgres instance
pnpm db:generate
pnpm db:push

# 4. run api + web
pnpm dev
# api -> http://localhost:4000
# web -> http://localhost:5173
```

The Instagram/Meta features (real OAuth, webhooks, sends) stay safely
disabled until you fill in the `META_*` / `INSTAGRAM_*` vars in
`apps/api/.env` — everything else in the product works without them, and real
sends fail closed (never silently "succeed") when credentials are missing.

### Password rule
Min 8 characters, at least one uppercase letter, one number, one special
character. Example: `LeadOS@123`

---

## Sidebar / app screens

Dashboard · Inbox (DMs + Comments) · Leads · Pipeline · Reports · Auto Reply
Rules · Follow-up Sequences · Integrations · Team · Audit Log.

Reachable by direct URL but not linked in the sidebar (kept working, not part
of the core product surface): Contacts, Deals detail, Tasks, Workflows,
Billing, the Social Simulator, and `/admin` (Super Admin, gated to users
flagged `isSuperAdmin`).

---

## Testing

```bash
pnpm --filter @leados/api test   # Vitest + Supertest — unit + integration
pnpm --filter @leados/web e2e    # Playwright — real-browser flows
```

Both suites run against a real Postgres test database (`TEST_DATABASE_URL` /
`E2E_DATABASE_URL`), never SQLite. CI (`.github/workflows/ci.yml`) runs both
on every push/PR.

## Live API docs

- In-app: **API Docs** page, or
- Direct: `GET /api/docs` (Swagger UI) · `GET /api/docs/openapi.yaml` (raw
  OpenAPI 3.0 spec)

## Security

- Strict organization scoping: every route filters by `organizationId`;
  Super Admin aggregate routes are the one sanctioned bypass, and they never
  return secrets or allow impersonation.
- Meta webhook events are verified against the raw request body
  (`X-Hub-Signature-256`, HMAC-SHA256, constant-time compare) — unsigned or
  mis-signed requests are rejected before anything is processed.
- Integration access tokens are encrypted at rest (`lib/crypto.ts`,
  AES-256-GCM).
- See `SECURITY.md` for the full posture and a production hardening
  checklist.

## Other docs in this repo

- `ARCHITECTURE.md` — system diagram, request lifecycle, data model
- `DEPLOYMENT.md` — the free-tier stack and how to scale it up
- `SECURITY.md` — auth, tenant isolation, webhook signatures, secret handling

> These were written earlier in the project's life alongside the broader
> multi-tenant CRM build and may describe some things (module/phase
> checklists, generic multi-tenant framing) that predate the Instagram-only
> product direction — the feature list and Quick Start above reflect what's
> actually shipped today.
