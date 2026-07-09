# LeadOS — AI-Powered CRM & Social Lead Automation Platform

Multi-tenant CRM & revenue operating system. This repository implements the
LeadOS Business Requirements Document (BRD) module by module.

> **Stack (per BRD):** Node.js + TypeScript API · Prisma + PostgreSQL · Redis / BullMQ ·
> React frontend. Designed to deploy to Render + Neon + Upstash, but runs fully
> locally (Postgres or SQLite fallback + in-process queue) for development.

---

## Monorepo layout

```
leados/
├─ apps/
│  ├─ api/        # Node/TypeScript backend API (Express + Prisma)
│  └─ web/        # React frontend (marketing + app + admin)
├─ packages/
│  └─ shared/     # Types, constants, validation shared by api + web
├─ pnpm-workspace.yaml
└─ package.json
```

## Build progress (mapped to BRD)

| Module | BRD sections | Status |
|--------|--------------|--------|
| **M1 — Foundation, Auth & Onboarding, Multi-Org** | §10.2, §10.3, §17, §9 (roles) | ✅ code complete, self-reviewed |
| **M2 — Super Admin panel** | §10.4, §9.1 | ✅ code complete (list+metrics+detail+suspend) |
| **M3 — Org Admin dashboard** | §10.5 | ✅ code complete (counts, pipeline value, activity) |
| **M4 — Lead management** | §10.6 | ✅ code complete (CRUD, filters, activity) |
| **M5 — Contacts / Customers / Customer 360** | §10.7 | ✅ code complete (CRUD + customer360) |
| **M6 — Deals & Pipeline (Kanban)** | §10.8 | ✅ code complete (board, stage move, totals) |
| **M7 — Tasks & Follow-ups** | §10.9 | ✅ code complete (CRUD, filters) |
| **M8 — Inbox & Conversations** | §10.10 | ✅ code complete (list, thread, reply, convert) |
| **M9 — Social simulation + name/phone capture** | §11, §12 | ✅ code complete (webhook + rule-based capture) |
| **M10 — Cron queue drain** | §14 | ✅ code complete (protected drain endpoint) |
| M11 — Marketing website + React app UI | §10.1, §10.5 | ✅ code complete (marketing + all app screens + admin) |
| **M12 — Demo seed** | §18 | ✅ code complete (3 orgs, guardrails) |

> **LeadOS is code-complete AND run-verified for every in-scope BRD module**
> (backend API + React frontend).

### ✅ Verification results (all passing)
Ran `pnpm install` → `prisma db push` → API type-check → boot → full smoke suite
→ frontend production build. Every check passed:

| # | Check | BRD | Result |
|---|-------|-----|--------|
| 1 | Signup creates user+workspace, returns JWT, role OWNER | §10.2/§21.1 | ✅ |
| 2 | Weak password rejected with rule errors | §10.2 | ✅ |
| 3 | Login returns token + memberships | §10.2 | ✅ |
| 4 | Tenant isolation: member=200, foreign org=403 | §20 | ✅ |
| 5 | Dashboard counts + pipeline value | §10.5 | ✅ |
| 6 | Leads CRUD + filters | §10.6 | ✅ |
| 7 | Contacts + Customer 360 | §10.7 | ✅ |
| 8 | Deals + Kanban pipeline (7 cols, totals) | §10.8 | ✅ |
| 9 | Tasks CRUD | §10.9 | ✅ |
| 10 | Capture scenario 1 → NEEDS_NAME_PHONE, reply SENT | §12.1 | ✅ |
| 11 | Capture scenario 3 → NEEDS_PHONE (name only) | §12.3 | ✅ |
| 12 | Capture scenario 2 → COMPLETE (name+phone) | §12.2 | ✅ |
| 13 | Captured lead shows name "Rahul" + phone | §12 | ✅ |
| 14 | Cron drain: correct secret works, wrong=401 | §14 | ✅ |
| 15 | Real send w/o Meta creds → FAILED, never SENT | §11.3 | ✅ |
| 16 | Non-superadmin blocked from /admin (403) | §10.4 | ✅ |
| 17–21 | Super Admin list, counts, metrics, suspend/reactivate | §10.4/§9.1 | ✅ |
| 22–23 | Demo seed refuses w/o flag, seeds 3 orgs with flag | §18 | ✅ |
| 24 | Seeded orgs (TechNova, GrowthBridge, CureCare) visible | §18 | ✅ |
| 25 | Frontend production build (52 modules, 0 errors) | §10.1/§11 | ✅ |

> Note: this repo uses SQLite + in-process queue locally so it runs with zero
> external services; swap `DATABASE_URL`/provider to Neon and set `REDIS_URL`
> for the BRD's production stack — no code changes required.

---

## Future phases (BRD §26) — now implemented & verified

| Phase | Feature | BRD | Status |
|-------|---------|-----|--------|
| **13** | AI lead scoring, reply suggestions, conversation summary | §13.2 | ✅ built + verified |
| **13** | Provider abstraction: OpenAI · Groq · Gemini, key from env only | §13.1/§13.2 | ✅ |
| **13** | Rule-based fallback when no key (AI stays disabled by default) | §13.1 | ✅ verified (`mode: rules`) |
| **14** | BullMQ background worker (activates when `REDIS_URL` set) | §14 | ✅ built |
| **14** | Free cron mode preserved when no Redis (worker exits cleanly) | §14.5 | ✅ verified (`mode: cron`) |
| **15** | Stripe-ready billing: TRIAL/STARTER/PRO/ENTERPRISE plans | §15.2 | ✅ built + verified |
| **15** | Plan change (mock mode w/o Stripe key) + usage limits | §15.2/§19.3 | ✅ verified (402 at limit) |

### New endpoints
- `GET /api/v1/ai/status` · `POST /api/v1/ai/score-lead/:id` · `POST /api/v1/ai/score-all`
- `GET /api/v1/ai/reply-suggestions/:conversationId` · `GET /api/v1/ai/summarize/:conversationId`
- `GET /api/v1/billing/plans` · `GET /api/v1/billing/subscription` · `POST /api/v1/billing/change-plan`

### New UI
- **Billing** page (plan cards, usage vs limits, upgrade)
- **Leads → "✨ Score all leads"** button
- **Inbox → "✨ Summarize" / "✨ Suggest reply"** (click a suggestion to use it)

### Enabling real AI (optional)
```bash
# in apps/api/.env
FLAG_AI_SCORING_ENABLED=true
AI_PROVIDER=groq          # or openai | gemini
GROQ_API_KEY=...          # key in env only, never in chat (BRD §13.2)
```

### Enabling the paid worker (optional)
```bash
# in apps/api/.env
REDIS_URL=rediss://...    # Upstash
# then run the worker process alongside the API:
pnpm --filter @leados/api worker
```

### Enabling real Stripe (optional)
```bash
# in apps/api/.env
STRIPE_SECRET_KEY=sk_...  # blank = safe mock mode
```

---

## Phase 11 — Real Meta Integration (BRD §16) — built & verified

Inbound webhook handling + outbound Graph API sends for Instagram / WhatsApp /
Facebook, with strict signature security. Disabled by default (no creds) — safe.

| Feature | BRD | Status |
|---------|-----|--------|
| GET verification handshake (echoes challenge on token match) | §16 | ✅ verified (200 / 403) |
| POST HMAC-SHA256 signature validation (raw-body, constant-time) | §16 | ✅ verified (200 / 401) |
| Payload parser: WhatsApp Cloud API + Instagram/Messenger/FB | §16 | ✅ |
| Account → organization mapping via IntegrationAccount | §16 | ✅ verified (accepted 0→1) |
| Real event → lead/conversation created (isSimulation=false) | §11.2 | ✅ verified |
| Real outbound via Graph API; **fails safely** w/o valid creds | §11.3 | ✅ verified (OUTBOUND=FAILED, never SENT) |
| Integrations UI (connect/disconnect, no secret leak) | §16 | ✅ |

**Endpoints**
- `GET /api/v1/webhooks/meta` — subscription handshake
- `POST /api/v1/webhooks/meta` — signed event delivery (raw body)
- `GET /api/v1/integrations` · `POST /api/v1/integrations/connect` · `POST /api/v1/integrations/:id/disconnect`

**Webhook callback URL** to register in your Meta App:
`https://<your-api-host>/api/v1/webhooks/meta`

### Enabling real Meta (optional)
```bash
# in apps/api/.env
META_APP_SECRET=...              # required to verify signatures & sends
META_WEBHOOK_VERIFY_TOKEN=...    # your chosen handshake token
WHATSAPP_PHONE_NUMBER_ID=...     # for WhatsApp Cloud API sends
WHATSAPP_ACCESS_TOKEN=...
```
Then in the app, **Integrations → Connect account** to map your business
account id to the org (and store a page access token for Instagram/FB replies).

> Security: signatures are verified against the raw request bytes; requests
> without a valid `X-Hub-Signature-256` are rejected 401. When no app secret is
> configured, all real webhooks are rejected and real sends fail safely —
> simulation mode remains fully functional (BRD §11.3).

---

## Phase 11+ — Meta App Review readiness (BRD §16) — built & verified

Everything Meta requires to approve the app for Advanced Access.

| Item | Status |
|------|--------|
| Data-deletion callback (verifies `signed_request`, scrubs PII, returns url+code) | ✅ verified |
| Deletion status page (public, per confirmation code) | ✅ verified (200, "complete") |
| Deauthorize callback (verifies `signed_request`) | ✅ verified (200) |
| Invalid `signed_request` rejected | ✅ verified (400) |
| Actual data scrub (conversation deleted, lead anonymized, messages removed) | ✅ verified |
| Public **Privacy Policy** page (`/privacy`) | ✅ |
| Public **Data Deletion Instructions** page (`/data-deletion`) | ✅ |
| App Review **readiness checklist** endpoint | ✅ verified (`ready: true`) |

**Endpoints for the Meta App dashboard**
- Webhook callback: `POST /api/v1/webhooks/meta`
- Data deletion callback: `POST /api/v1/webhooks/meta/data-deletion`
- Deauthorize callback: `POST /api/v1/webhooks/meta/deauthorize`
- Deletion status: `GET /api/v1/webhooks/meta/deletion-status?code=...`
- Readiness check (yours): `GET /api/v1/webhooks/meta/readiness`
- Privacy Policy URL: `<web>/privacy` · Data Deletion URL: `<web>/data-deletion`

> Data-deletion & deauthorize callbacks use Meta's `signed_request` scheme
> (base64url `sig.payload`, HMAC-SHA256 with the app secret) — separate from the
> event webhook's `X-Hub-Signature-256`. Both are implemented and verified.

---

## Scalability — free at launch, scales by config (BRD §19)

LeadOS launches on **100% free tiers** and scales up by changing env vars only.
See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full free stack + upgrade path.

| Hardening | Status |
|-----------|--------|
| Rate limiting (global 300/min, auth 20/min, AI 30/min) → 429 | ✅ verified |
| gzip compression on responses | ✅ verified |
| Bounded queries (take caps) + pagination on every list | ✅ |
| Batched `score-all` (chunked transactions, `more` flag) | ✅ verified |
| DB indexes on all hot filter/sort paths | ✅ |
| TTL cache on heavy aggregates (admin metrics, 30s) | ✅ |
| Cron drain time budget (25s) — never exceeds host timeout | ✅ |
| Small Prisma pool (free-Neon friendly) + graceful shutdown | ✅ |
| Idempotent webhook processing | ✅ |

**Everything paid is abstracted with a free default + drop-in upgrade:**
- Queue: in-process/cron (free) → BullMQ+Redis (`REDIS_URL`)
- Cache & rate-limit: in-memory (free) → Redis (same interface)
- AI: rule-based (free) → OpenAI/Groq/Gemini (`AI_PROVIDER`+key)
- Billing: mock (free) → Stripe (`STRIPE_SECRET_KEY`)
- Messaging: simulation (free) → real Meta (`META_*` + Integrations UI)
- Email/notifications: console (free) → SMTP (`EMAIL_ENABLED`+`SMTP_URL`)

---

## Complete BRD coverage — additional features (final pass)

Every remaining BRD item is now built & verified:

| Feature | BRD | Status |
|---------|-----|--------|
| CSV **export** leads | §10.6 | ✅ verified |
| CSV **import** leads (bulk, plan-limited) | §10.6, §15.2 | ✅ verified |
| **Web forms** — public lead capture + embeddable HTML snippet | §15.2 | ✅ verified |
| **Workflows** — trigger→action rules (CRUD + engine) | §8.1, §17 | ✅ verified (auto-task on stage change) |
| AI **sentiment analysis** | §13.2 | ✅ verified |
| AI **deal close probability** | §13.2 | ✅ verified |
| AI **next best action** / follow-up recommendation | §13.2 | ✅ verified |
| **Email/notification** service (free console default, SMTP-ready) | §14.4, §15.2 | ✅ |
| **Role scoping** — Sales/Support Agents see only assigned leads | §9.5, §9.6 | ✅ |
| **Calendar integration** — Google Calendar OAuth; task→event sync | §15.2 | ✅ verified (mock + real path) |

**New endpoints**
- `GET /api/v1/leads/export.csv` · `POST /api/v1/leads/import`
- `POST /api/v1/forms/:orgSlug/submit` · `GET /api/v1/forms/:orgSlug/embed.html`
- `GET/POST/PATCH/DELETE /api/v1/workflows`
- `GET /api/v1/ai/sentiment/:conversationId` · `/deal-probability/:dealId` · `/next-best-action/:leadId`
- `GET /api/v1/calendar/status|connect|callback` · `POST /api/v1/calendar/disconnect`

**New UI:** Workflows page · Leads CSV import/export buttons · Inbox sentiment button · Calendar connect card (Integrations).

### Enabling real Google Calendar (optional)
```bash
# in apps/api/.env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<your-api>/api/v1/calendar/callback
```
Then **Integrations → Connect calendar** runs Google OAuth; tasks with a due
date create real Calendar events. Without creds it runs safely in mock mode.

---

---

## Testing, API spec & demo data

### Automated tests
62 tests (Vitest + Supertest) — unit (capture flow, password rule, AI heuristics)
+ integration (auth, tenant isolation, CRM CRUD, CSV, simulation+capture, cron
security, safe-send, super admin, billing limits, web forms, workflows, Meta
signature). Isolated test SQLite DB — never touches dev data.
```bash
pnpm --filter @leados/api test
```

### OpenAPI / Postman
`openapi.yaml` (OpenAPI 3.0, 44 paths, 18 tags) documents the whole API.
Import it into **Postman** (File → Import → select `openapi.yaml`) or view in any
OpenAPI/Swagger UI. Auth is Bearer JWT; most routes need the `X-Org-Id` header.

### Rich demo data + ready Super Admin
`ALLOW_DEMO_SEED=true pnpm --filter @leados/api run demo:seed` creates 3 orgs, each with leads, deals,
tasks (incl. overdue/done), **2 inbox conversations with a full 4-message
capture journey**, activities, and an active workflow. It also **promotes the
first owner to Super Admin** so `/admin` works immediately.

**Demo Logins (Password for all is `LeadOS@123`):**
- **TechNova Realty (Super Admin + Org Owner):** `meera@demo.test`
- **GrowthBridge Agency (Org Owner):** `karan@demo.test`
- **CureCare Clinic (Org Owner):** `anita@demo.test`

### Live demo walkthrough (for presentations)
With the API running, drive the whole product end-to-end with narrated output:
```bash
pnpm --filter @leados/api demo:walkthrough
```
Runs 11 steps (signup → lead → social capture → inbox → AI → pipeline →
workflow → web form → billing → dashboard) against the live API.

### Automated tests
- **API:** 62 unit + integration tests (Vitest + Supertest) — `pnpm --filter @leados/api test`
- **E2E:** 10 real-browser flows (Playwright + Chromium) — marketing, signup→dashboard, keyboard shortcuts,
  create lead, ⌘K search, dark-mode toggle, logout — `pnpm --filter @leados/web e2e`
  (auto-boots the API on an isolated `e2e.db` + the web dev server).

### CI (GitHub Actions)
`.github/workflows/ci.yml` runs on push/PR: install → Prisma generate →
API type-check → 62 API tests → web build → Playwright E2E.

### One-command Docker stack
`docker compose up --build` runs the full BRD stack locally (Postgres + Redis +
API + worker + web):
- API → http://localhost:4000 · Web → http://localhost:5173
> Set the Prisma provider to `postgresql` in `apps/api/prisma/schema.prisma`
> before building for Postgres (the default SQLite path needs no Docker).

### Live API docs (Swagger UI)
- In-app: **API Docs** page (sidebar), or
- Direct: `GET /api/docs` (Swagger UI) · `GET /api/docs/openapi.yaml` (raw spec)

### Presenting the demo
`DEMO_SCRIPT.md` — a ~6-minute scripted narration for a live demo/pitch.

### Architecture & contributing
`ARCHITECTURE.md` — system diagram, request lifecycle, capture flow, data model
(ERD), the free-default→paid-upgrade pattern, and contributor conventions.

### Boot-time env validation
The API validates configuration on startup (`lib/validateEnv.ts`): it warns in
development and **fails fast in production** on weak/missing `JWT_SECRET`,
default `CRON_SECRET`, SQLite in prod, wildcard CORS, or `ALLOW_DEMO_SEED=true`.

### Observability (logging & metrics)
- Structured logger (`lib/logger.ts`): pretty in dev, **single-line JSON in
  production** (ship to Datadog/Loki/Render); redacts secret-like keys.
- Per-request logs with an `X-Request-Id` header, method, path, status, latency.
- `GET /metrics` — uptime, request counts by status class, error count, avg
  latency. Tune verbosity with `LOG_LEVEL`.

### Security
`SECURITY.md` documents the full posture (auth, tenant isolation, RBAC, webhook
signatures, rate limiting, secret handling, privacy/compliance) + a production
hardening checklist and how to report vulnerabilities.

### Load testing
`pnpm --filter @leados/api load-test` (API must be running) fires concurrent
requests and reports throughput + latency percentiles (p50/p90/p99). Verified
~900 req/s on `/health`; on rate-limited routes it confirms 429s engage exactly
at the limit.

### Mobile responsiveness
`MOBILE_AUDIT.md` covers the small-screen audit + fixes: a hamburger **slide-in
nav drawer** (the app is fully usable on phones), horizontally-scrollable wide
tables, and responsive topbar/marketing tweaks.

### Dark mode
Full **dark theme** via CSS variables + `data-theme` on `<html>`. Toggle in the
topbar (🌙/☀️); respects the OS `prefers-color-scheme` on first load and persists
the choice. See a static preview at `docs/theme-i18n-preview.html`.

### Internationalization (i18n)
Lightweight, dependency-free i18n (`lib/i18n.tsx`) with **English, Hindi, and
Spanish**. Switch language in the topbar; choice persists. Missing keys fall back
to English then the key. Nav, Dashboard, and Leads are fully translated; add a
locale (or translate more pages) by extending the dictionary map.

### Notification center
In-app notifications with a **bell + unread badge** in the topbar. A `Notification`
model + endpoints (`/api/v1/notifications`, `/unread-count`, `/read-all`) back a
dropdown panel that polls unread count every 30s. Events auto-create notices:
**lead captured** (from social capture) and **workflow ran**. Org-scoped, with
optional per-user targeting.

### SSO — Google login
"Continue with Google" on Login/Signup (shown only when SSO is configured).
Endpoints: `/api/v1/sso/status|google|google/callback`. New users get a starter
workspace; existing accounts link by verified email. Set `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, and `GOOGLE_LOGIN_REDIRECT_URI` to enable; password login
works regardless.

### Reports & analytics dashboard
A **Reports** page (📈) with KPIs (new leads in range, conversion rate, won
value, task completion), **date-range filters** (7d / 30d / 90d / 1y), and
**dependency-free inline SVG charts**: leads-created & deals-won **trend lines**,
leads by status (bar), leads by source (donut), and deal value split. Backend
`GET /api/v1/reports/overview?days=` (cached 15s) + `GET /api/v1/reports/export.csv`.
Charts adapt to dark mode; preview at `docs/reports-preview.html`. Includes a
**🏆 agent leaderboard** (`/api/v1/reports/leaderboard`) ranking team members by
assigned leads, wins, conversion rate, and open pipeline value.

### Tasks — filters & "My open tasks"
The Tasks page has a **"⭐ My open tasks"** quick button plus **status** and
**assignee** filters (My tasks / a specific agent / unassigned) and an assignee
column. Backend: `/api/v1/tasks?status=&assignedUserId=` (`none` = unassigned).

### Lead detail page + activity timeline
Click any lead name to open its detail page: **inline editing** (name, phone,
email, source, score), quick status change, AI re-score, related
deals/tasks/conversations, and a full **activity timeline** with an **add-note**
box (`POST /api/v1/leads/:id/notes`). Notes and status changes are recorded
chronologically with type icons.

### Keyboard shortcuts
Power-user navigation and actions (ignored while typing in fields):
- **g** then **d/r/l/c/p/t/i** → Dashboard / Reports / Leads / Contacts / Pipeline / Tasks / Inbox
- **⌘/Ctrl+K** → global search · **n** → new item (on Leads/Contacts/Tasks) · **?** → shortcuts help overlay

### Super Admin (app admin) control panel
A tabbed platform console (Super-Admin only, BRD §9.1/§10.4/§20 — aggregate
data, no impersonation, no secrets):
- **Overview** — platform-wide metrics (orgs, users, leads, deals, tasks, messages)
- **Organizations** — all orgs with counts + suspend/reactivate
- **Users** — platform user directory (org counts, 2FA, super-admin flags) with
  **grant/revoke Super Admin** (self-revoke guarded)
- **Activity** — recent audit events across all organizations
- **Org drill-down** — click any org to see its full detail page: plan, all
  counts, member list, recent activity, and suspend/reactivate in one place.
- **Platform search** — a search box that finds any organization or user across
  the whole platform (`/api/v1/admin/search`), jumping straight to the org page.
Endpoints under `/api/v1/admin/*` (`/users`, `/activity`, `/organizations/:id`,
`/organizations/:id/members`, `/organizations/:id/activity`, `/users/:id/super-admin`).

### Contact detail (Customer 360) + inline edit
Open any contact to see its Customer 360: **inline editing** (name, company,
phone, email, source), next action, related deals (linked), tasks, and a
**timeline with an add-note box** (`POST /api/v1/contacts/:id/notes`).

### Deal detail page
Click a deal card in the pipeline to open its detail page: **inline editing**
(title, value, expected close date, notes), **stage management**, related
lead/contact links, tasks, and related activity. Backend `GET /api/v1/deals/:id`.

### Global search (⌘K command palette)
Press **⌘K / Ctrl+K** (or the topbar Search button) anywhere in the app to open a
command palette that searches **leads, contacts, and deals** at once. Debounced,
keyboard-navigable (↑/↓/Enter), org-scoped. Backend: `GET /api/v1/search?q=`.

### Bulk actions, saved views & CSV (Leads, Contacts, Deals)
- **Leads:** row-checkbox **bulk set-status / assign-to-member / unassign / delete**,
  CSV import/export, **saved views** (personal filter presets), and filters by
  status, source, and **assignee** (My leads / a specific agent / unassigned).
- **Contacts:** CSV import/export + bulk delete.
- **Deals:** CSV export + bulk set-stage / delete.
- **Audit log:** CSV export (owner/admin).
All bulk operations are org-scoped and audit-logged.

### Two-factor authentication (2FA / TOTP)
Optional per-user 2FA compatible with Google Authenticator / Authy. Enroll in
**Team → My Security** (QR + manual secret), get one-time **backup codes**, and
on next login enter the 6-digit code (or a backup code). Endpoints under
`/api/v1/2fa/*`; login returns a 5-minute challenge that `/2fa/login-verify`
exchanges for a session. Disabling requires the account password.

### Audit log (compliance, BRD §8.2)
Enterprise-style audit trail: an `AuditLog` model records **who did what** (actor
email, action, entity, safe metadata, IP, timestamp). Mutating actions are
instrumented (lead create/delete, deal delete, member add/role-change). Viewable
by **owners/admins only** at `/api/v1/audit` and the **Audit Log** page (filter by
action, paginated). Sales/Support agents get 403.

### Progressive Web App (PWA)
Installable, offline-capable: `manifest.webmanifest`, an SVG icon, and a service
worker (`public/sw.js`) that caches the app shell (cache-first) while keeping API
calls network-first (fresh + tenant-safe), with an offline fallback page. An
**Install** button appears in the topbar when the browser supports it. Works from
the production build (`pnpm --filter @leados/web build` → serve `dist/`).

---

## ✅ 100% BRD coverage

Every feature in the BRD is now implemented, verified, and free-to-launch —
including all future roadmap items (AI §13, worker §14, billing §15, Meta §16
+ App Review) and all integrations (§15.2: CSV, web forms, email, **calendar**).
No remaining gaps.

### Frontend screens (apps/web)
Marketing (`/`), Login, Signup, and the app shell under `/app`:
Dashboard · Leads · Contacts · Customer 360 · Pipeline (Kanban) · Tasks ·
Inbox · Social Simulator · Team · and `/admin` (Super Admin, gated).

## Quick start (local)

```bash
# 1. install deps
pnpm install

# 2. configure env (copy + edit)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. create db + generate client
pnpm db:generate
pnpm db:migrate

# 4. run api + web
pnpm dev
# api  -> http://localhost:4000
# web  -> http://localhost:5173
```

### Password rule (BRD §10.2)
Min 8 chars, at least one uppercase letter, one number, one special character.
Example: `LeadOS@123`

### Security notes (BRD §19.1)
- Strict tenant isolation: normal routes are scoped by `organizationId`.
- Super Admin aggregate routes are the only sanctioned tenant-scope bypass.
- Secrets live only in `.env` (git-ignored); never in code or logs.
