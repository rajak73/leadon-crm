# Security Policy

LeadOS handles customer PII (names, phones, emails, messages) across multiple
tenants, so security is a first-class concern. This document describes our
security posture and how to report issues.

## Reporting a vulnerability

Please email **security@leados.example** with details and reproduction steps.
Do **not** open a public issue for security reports. We aim to acknowledge within
2 business days.

---

## Security controls (implemented)

### Authentication & sessions
- JWT bearer tokens, signed with `JWT_SECRET`; passwords hashed with bcrypt.
- Password policy enforced (min 8, upper, number, special — BRD §10.2).
- **Two-factor authentication (TOTP)** — optional per user, compatible with
  Google Authenticator/Authy. Login issues a short-lived (5 min) challenge; the
  session token is only granted after a valid TOTP or single-use backup code.
  Backup codes are bcrypt-hashed; disabling requires the account password.
- **Single sign-on (Google OAuth 2.0)** — optional. New SSO users get a
  workspace; existing accounts link by verified email. State is a signed,
  short-lived token; the session token is returned via URL fragment (not logged)
  and immediately cleared from the address bar.
- Boot-time validation refuses to start in production with a weak/missing
  `JWT_SECRET` (`lib/validateEnv.ts`).

### Multi-tenant isolation (BRD §20)
- Every normal request is scoped by `organizationId` via `requireOrg`
  middleware; non-members receive `403`.
- The **only** sanctioned cross-tenant path is Super Admin aggregate routes,
  guarded by `requireSuperAdmin` — and even those expose only non-secret counts
  (no impersonation, no token access).

### Authorization (RBAC, BRD §9)
- Roles: OWNER, ADMIN, SALES_MANAGER, SALES_AGENT, SUPPORT_AGENT.
- Sensitive actions (add member, change plan, workflows, integrations) require
  OWNER/ADMIN. Sales/Support agents see only leads assigned to them.

### Webhook & callback security (BRD §16)
- Meta event webhooks: HMAC-SHA256 signature verified against the **raw body**
  with `META_APP_SECRET`, compared in constant time. Unsigned/invalid → `401`.
- Data-deletion & deauthorize callbacks verify Meta's `signed_request`.
- Internal cron endpoint requires `Authorization: Bearer <CRON_SECRET>`.

### Abuse & availability
- Rate limiting: global (300/min), auth (20/min), AI (30/min), public forms
  (10/min) → `429` on excess.
- Response size bounds: all list queries are paginated/capped; JSON body limit
  1 MB; batch imports capped.
- gzip compression; graceful shutdown releases DB connections.

### Secrets & data handling
- Secrets only via environment variables; never committed (`.gitignore`,
  `.dockerignore`) and never returned to clients (integrations expose only
  `hasAccessToken: true`).
- Structured logger redacts sensitive keys (password, token, secret, etc.).
- Real message sends without valid Meta credentials **fail safely** and are
  never marked SENT (BRD §11.3).

### Privacy / compliance
- Meta data-deletion callback scrubs message content and anonymizes leads.
- Public Privacy Policy (`/privacy`) and Data Deletion (`/data-deletion`) pages.
- Demo seed cannot run in production (`ALLOW_DEMO_SEED` + NODE_ENV guards).

### Transport & headers
- `helmet` sets secure HTTP headers.
- CORS restricted to `WEB_ORIGIN`; wildcard origin is rejected in production.
- Deploy behind HTTPS (Render/host terminates TLS); `trust proxy` set for
  correct client IPs.

---

## Hardening checklist for production

- [ ] Strong, unique `JWT_SECRET` and `CRON_SECRET`
- [ ] `DATABASE_URL` points at pooled Postgres/Neon (not SQLite)
- [ ] `WEB_ORIGIN` set to your exact frontend origin (no `*`)
- [ ] `ALLOW_DEMO_SEED=false`
- [ ] `META_APP_SECRET` set before enabling real webhooks
- [ ] Rotate any credentials that were ever shared in chat/logs
- [ ] Enable a Redis-backed rate limiter/cache when running multiple instances
- [ ] Ship logs (`/metrics` + JSON logs) to your monitoring stack

---

## Known limitations (by design, documented)

- In-memory rate limiter/cache are **per-instance**; use the Redis backends for
  horizontal scaling (interfaces already in place — see ARCHITECTURE.md §5).
- Access tokens are stored in a DB column for the demo; use a secrets manager /
  encryption-at-rest in production.
- Social messaging runs in simulation until real Meta credentials + App Review
  are configured.
