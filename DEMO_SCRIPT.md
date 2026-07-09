# LeadOS — Demo Narration Script

A ~6-minute scripted walkthrough for presenting LeadOS live (sales demo, investor
pitch, or recorded video). Speaker lines are in **bold**; actions in _italics_.

## Setup (before the demo)
```bash
# 1) start everything
pnpm dev                         # API :4000 + Web :5173
# 2) seed rich demo data + a ready Super Admin
ALLOW_DEMO_SEED=true pnpm db:seed
```
Demo login: **meera@demo.test / LeadOS@123** (owner **and** Super Admin).
Optional: run `pnpm --filter @leados/api demo:walkthrough` once to warm data.

---

## 0:00 — The problem (15s)
> **"Businesses get leads everywhere — Instagram DMs, WhatsApp, website forms,
> referrals — and lose most of them because they're scattered across inboxes and
> spreadsheets. LeadOS turns every conversation into a tracked, followed-up
> revenue opportunity."**

_Open the marketing site at `/`._

## 0:15 — Sign up in seconds (30s)
_Click **Get Started** → fill signup._
> **"A business creates its workspace in under a minute — they instantly become
> the owner of an isolated, multi-tenant CRM."**

_(For the seeded demo, log in as meera@demo.test instead.)_

## 0:45 — The dashboard (30s)
_Land on **Dashboard**._
> **"Right away they see leads, deals, open tasks, pipeline value, and recent
> activity — the whole business at a glance."**

## 1:15 — Leads + AI scoring (45s)
_Go to **Leads**._
> **"Every lead from every channel lands here. Watch this —"** _click **✨ Score
> all leads**._
> **"AI ranks them by likelihood to convert. No AI key needed — it falls back to
> a transparent rule-based score, and you can flip on OpenAI, Groq, or Gemini
> with one env var."**
_Click a lead → mention CSV **Import/Export** buttons._

## 2:00 — Social capture, live (60s) ⭐ the wow moment
_Go to **Social Simulator**._
> **"Here's the magic. A customer DMs us on Instagram."**
_Click the "Hi, I want pricing" scenario → **Send**._
> **"LeadOS instantly creates a lead and — because we don't have their details —
> automatically asks for their name and phone."**
_Send the "My name is Rahul and my phone is 9876543210" scenario._
> **"They reply, and LeadOS parses the name and phone, updates the lead, and
> confirms — all automatically."**
_Open **Inbox** → show the conversation thread._
> **"Everything's captured in a unified inbox. This works in safe simulation
> mode today, and switches to real Instagram/WhatsApp with verified Meta
> webhooks when you're approved — the code path is already built."**

## 3:00 — Pipeline (30s)
_Go to **Pipeline**._
> **"Deals move through a visual Kanban with live stage totals. Drag or change a
> stage and probability updates automatically."**

## 3:30 — Automation (30s)
_Go to **Workflows**._
> **"Set rules like 'when a lead is qualified, auto-create a follow-up task.'"**
_Show the active workflow; if time, qualify a lead and show the task appear in
**Tasks**._

## 4:00 — Customer 360 + Inbox AI (30s)
_Go to **Contacts → a contact → Customer 360**._
> **"One screen shows identity, timeline, deals, tasks, and the next best
> action."**
_Back in **Inbox**, click **✨ Suggest reply** / **✨ Sentiment**._
> **"AI drafts replies and reads sentiment so agents move faster."**

## 4:30 — Web forms & integrations (30s)
_Go to **Integrations**._
> **"Embed a lead form on any website, and connect Instagram, WhatsApp, Facebook,
> or Google Calendar. Tasks with due dates sync to the calendar."**

## 5:00 — Super Admin (30s)
_Click **Super Admin** in the sidebar (visible because meera is a super admin)._
> **"Platform operators get a bird's-eye view of every organization with safe,
> aggregated counts — and can suspend or reactivate accounts. Strict tenant
> isolation means no one ever sees another org's data."**

## 5:30 — Billing & scale (30s)
_Go to **Billing**._
> **"Plans, usage limits, Stripe-ready. And the whole thing launches on free
> tiers — Neon, Upstash, Render, cron-job.org — then scales by flipping env vars:
> add a Redis worker, real AI, Stripe, Meta. No rewrites."**

## 6:00 — Close (15s)
> **"That's LeadOS: capture every lead, automate the follow-up, and convert —
> from one premium workspace. It's fully built, tested, documented, and ready to
> deploy today."**
_Optionally open **API Docs** to show the live Swagger UI._

---

## Handy talking points / FAQ
- **"Is it real or a mockup?"** — Fully functional: 18 API modules, real DB,
  39 automated tests, OpenAPI docs. Social messaging runs in safe simulation
  until Meta approves your app (real webhook signature verification is built).
- **"How much to run?"** — ₹0 at launch (free tiers + rule-based AI + mock
  billing). Costs start only when you scale.
- **"Data safety?"** — Per-org isolation, JWT auth, rate limiting, no secrets in
  logs, Meta data-deletion compliance for App Review.
- **"Time to go live?"** — Point env at Neon + set a JWT secret; deploy to
  Render; add cron-job.org. Real channels/AI/billing are config toggles.
