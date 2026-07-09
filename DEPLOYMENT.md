# LeadOS — Free-Tier Deployment & Scaling Guide

LeadOS is designed to launch **entirely on free tiers** and scale up later by
swapping env vars only — no code changes (BRD §14, §19.3).

---

## 1. Free stack (₹0 to start)

| Concern | Free service | Notes |
|---------|--------------|-------|
| Database | **Neon** (free Postgres) | Use the **pooled** connection string |
| Queue / cache | **Upstash Redis** (free) | Optional; app runs without it (cron mode) |
| API + Web hosting | **Render** free web services | Free instances sleep when idle |
| Background jobs | **cron-job.org** (free) | Calls the drain endpoint every 5 min |
| AI | none needed | Rule-based scoring works with **no key** |
| Billing | none needed | Runs in mock mode with **no Stripe key** |

Everything above stays free at launch. You only pay when you outgrow it.

## 2. Deploy steps (One-Click Blueprint)

We have included a `render.yaml` Blueprint file that fully automates the Render setup.

1. Go to **Render.com** and sign in with GitHub.
2. Click **New +** -> **Blueprint** and select your GitHub repository.
3. Render will ask you for the following environment variables (do **NOT** commit these values to GitHub, paste them directly into the Render dashboard):
   - `DATABASE_URL`: Your Neon Postgres connection string
   - `REDIS_URL`: Your Upstash Redis connection string
   - `GROQ_API_KEY`: Your Groq AI key
   - `VITE_API_URL`: Leave blank for now!

4. Click **Apply** to build both the API and the Web service.

### Post-deploy step (Link the Frontend)
Once the `leados-api` service finishes building, copy its live URL (e.g., `https://leados-api-xxxx.onrender.com`). 
Go to the `leados-web` service on Render, add an environment variable `VITE_API_URL` with that URL, and manually redeploy `leados-web` so the frontend can talk to the backend.

---

## 3. What makes it scalable (already built in)

| Feature | Benefit | BRD |
|---------|---------|-----|
| **Rate limiting** (global/auth/AI) | Protects free DB pool from abuse; returns 429 | §19.3 |
| **gzip compression** | Cuts free-tier bandwidth usage | §19.2 |
| **Bounded queries** (take caps everywhere) | No table ever fully loaded → no OOM | §19.2 |
| **Pagination** on all list endpoints | Constant memory regardless of data size | §19.2 |
| **Batched `score-all`** (chunked txns + `more` flag) | Won't time out on large orgs | §19.2 |
| **DB indexes** on all hot filter/sort paths | Fast queries as data grows | §19.3 |
| **TTL cache** on heavy aggregates (admin metrics) | Fewer full-table counts | §19.2 |
| **Cron drain time budget** (25s) | Never exceeds host request timeout | §19.2 |
| **Small Prisma pool + graceful shutdown** | Releases free-tier connections cleanly | §19.4 |
| **Idempotent webhook processing** | Safe retries, no dupes | §19.4 |

---

## 4. Scaling up later (still just env changes)

| Bottleneck | Upgrade | How |
|------------|---------|-----|
| 5-min cron latency | **Paid background worker** | Set `REDIS_URL` (Upstash) + run `pnpm --filter @leados/api worker`. Simulation/webhook auto-switch to the queue (BRD §14, Phase 14). |
| Rate limit per-instance | **Redis-backed limiter** | Swap the Map store in `middleware/rateLimit.ts` for Redis INCR/EXPIRE (same interface). |
| Cache per-instance | **Redis cache** | Swap `lib/cache.ts` store for Redis (same get/set). |
| DB connections | **Neon paid / bigger pool** | Raise `connection_limit`; Neon autoscale. |
| Multiple API instances | **Horizontal scale** | Stateless API; move rate-limit + cache to Redis (above), then scale replicas. |
| Real messaging | **Meta credentials + App Review** | Set `META_*` / `WHATSAPP_*` env + connect via Integrations UI. |
| Real AI | **AI key** | `FLAG_AI_SCORING_ENABLED=true` + `AI_PROVIDER` + key. |
| Paid plans | **Stripe** | Set `STRIPE_SECRET_KEY`. |

> Design principle: everything that would normally require a paid service is
> abstracted behind an interface (queue, cache, rate limit, AI, billing, Meta)
> with a **free in-process/mock default** and a **drop-in paid backend**. Start
> free; scale by configuration, not rewrites.
