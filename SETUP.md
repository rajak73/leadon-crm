# LeadOS — Setup & Verification Guide

Turnkey steps to run and smoke-test the backend (Module 1). Follow top to bottom.

## Prerequisites
- Node.js ≥ 18
- pnpm ≥ 9 (`npm i -g pnpm`)

## 1. Install
```bash
cd leados
pnpm install
```

## 2. Configure env
```bash
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env → set a strong JWT_SECRET (default SQLite DB is fine locally)
```

## 3. Generate Prisma client + create the database
```bash
pnpm db:generate
pnpm db:migrate      # creates SQLite dev.db and applies the schema
```
> Using Postgres/Neon instead? In `apps/api/prisma/schema.prisma` set
> `provider = "postgresql"` and point `DATABASE_URL` at your connection string,
> then run the same two commands.

## 4. Run the API
```bash
pnpm api
# → LeadOS API running at http://localhost:4000
```

---

## Smoke tests (Module 1 acceptance)

### Health
```bash
curl -s http://localhost:4000/health | jq
```

### Signup (creates user + workspace, returns JWT) — BRD §10.2, §21.1
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Asha","lastName":"Rao","email":"asha@demo.test","password":"LeadOS@123","workspaceName":"Rao Realty"}' | jq
```
Save the returned `token` and the org `organizationId`.

### Weak password is rejected — BRD §10.2
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"X","lastName":"Y","email":"x@demo.test","password":"weak","workspaceName":"X Co"}' | jq
# → 400 with password errors
```

### Login
```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"asha@demo.test","password":"LeadOS@123"}' | jq
```

### Authenticated: list my orgs
```bash
TOKEN=<paste-token>
curl -s http://localhost:4000/api/v1/organizations \
  -H "Authorization: Bearer $TOKEN" | jq
```

### Tenant isolation check — BRD §20 (the important one)
```bash
ORG=<your-org-id>
# member of org → works
curl -s http://localhost:4000/api/v1/organizations/current \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" | jq
# random/foreign org id → 403 Forbidden (no cross-tenant leak)
curl -s http://localhost:4000/api/v1/organizations/current \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: someone-elses-org" | jq
```

### Add a team member (OWNER/ADMIN only) — BRD §9.2
```bash
curl -s -X POST http://localhost:4000/api/v1/organizations/members \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Ravi","lastName":"K","email":"ravi@demo.test","password":"LeadOS@123","role":"SALES_AGENT"}' | jq
```

### Promote a Super Admin (for Module 2)
```bash
pnpm --filter @leados/api make:superadmin asha@demo.test
```

---

---

## Smoke tests (Modules 2–10)

Set `TOKEN` and `ORG` from signup/login first. Use `H="-H Authorization:Bearer $TOKEN -H X-Org-Id:$ORG"` mentally below.

### Super Admin (BRD §10.4) — after `make:superadmin`
```bash
# re-login to get a token whose isSuperAdmin=true
SA=<superadmin-token>
curl -s http://localhost:4000/api/v1/admin/organizations -H "Authorization: Bearer $SA" | jq
curl -s http://localhost:4000/api/v1/admin/metrics       -H "Authorization: Bearer $SA" | jq
# non-superadmin token → 403
curl -s http://localhost:4000/api/v1/admin/organizations -H "Authorization: Bearer $TOKEN" | jq
```

### Dashboard (BRD §10.5)
```bash
curl -s http://localhost:4000/api/v1/dashboard -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" | jq
```

### Leads (BRD §10.6)
```bash
curl -s -X POST http://localhost:4000/api/v1/leads \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" -H 'Content-Type: application/json' \
  -d '{"name":"Test Lead","phone":"9876500000","source":"MANUAL","status":"NEW"}' | jq
curl -s "http://localhost:4000/api/v1/leads?status=NEW" -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" | jq
```

### Deals & Kanban pipeline (BRD §10.8)
```bash
curl -s http://localhost:4000/api/v1/deals/pipeline -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" | jq
```

### Social simulation + name/phone capture (BRD §11, §12) — the key demo
```bash
# 1) new sender, no details → system asks for name+phone (drainNow processes immediately)
curl -s -X POST http://localhost:4000/api/v1/simulation/webhook \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" -H 'Content-Type: application/json' \
  -d '{"channel":"INSTAGRAM","senderId":"ig_user_1","text":"Hi, I want pricing","drainNow":true}' | jq
# expect captureState NEEDS_NAME_PHONE + simulated reply SENT

# 2) same sender provides details → captureState COMPLETE, lead updated
curl -s -X POST http://localhost:4000/api/v1/simulation/webhook \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" -H 'Content-Type: application/json' \
  -d '{"channel":"INSTAGRAM","senderId":"ig_user_1","text":"My name is Rahul and my phone is 9876543210","drainNow":true}' | jq
```

### Cron queue drain (BRD §14)
```bash
# enqueue without drainNow, then drain via the protected cron endpoint
curl -s -X POST http://localhost:4000/api/v1/simulation/webhook \
  -H "Authorization: Bearer $TOKEN" -H "X-Org-Id: $ORG" -H 'Content-Type: application/json' \
  -d '{"channel":"WHATSAPP","senderId":"wa_user_9","text":"Hello"}' | jq
# CRON_SECRET must match apps/api/.env
curl -s -X POST http://localhost:4000/api/internal/cron/drain-queues \
  -H "Authorization: Bearer <CRON_SECRET>" | jq
# wrong secret → 401
curl -s -X POST http://localhost:4000/api/internal/cron/drain-queues -H "Authorization: Bearer nope" | jq
```

### Demo seed (BRD §18)
```bash
# blocked without the flag
pnpm --filter @leados/api demo:seed          # → refuses
# allowed
ALLOW_DEMO_SEED=true pnpm --filter @leados/api demo:seed
```

## Expected results checklist
- [ ] `/health` returns `status: ok`
- [ ] Signup returns a token + one org with role `OWNER`
- [ ] Weak password returns 400 with rule errors
- [ ] Login returns token + memberships
- [ ] Foreign `X-Org-Id` returns 403 (tenant isolation holds)
- [ ] Add member works for OWNER; would 403 for a SALES_AGENT
- [ ] Super Admin sees all orgs + counts; non-superadmin gets 403 (§10.4)
- [ ] Dashboard returns counts + pipeline value (§10.5)
- [ ] Lead CRUD + filters work (§10.6)
- [ ] Pipeline board returns stages with deals + totals (§10.8)
- [ ] Simulation #1 → captureState NEEDS_NAME_PHONE, reply SENT (§12.1)
- [ ] Simulation #2 → captureState COMPLETE, lead name/phone updated (§12.2)
- [ ] Cron drain works with correct secret; 401 with wrong secret (§14)
- [ ] Real send w/o Meta creds returns FAILED, never SENT (§11.3)
- [ ] Demo seed refuses without ALLOW_DEMO_SEED, succeeds with it (§18)
