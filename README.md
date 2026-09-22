# LeadOS

A CRM for one company and its sales team. It covers leads, contacts, a deals pipeline,
tasks, notes, AI lead scoring and simple automation.

- **Backend:** Node.js 22, Express 5 and TypeScript, with Prisma on PostgreSQL
- **Frontend:** React 19 (Vite), Tailwind CSS v4, TanStack Query and Radix UI
- **One process:** in production the API also serves the web app, so a single server and a
  single Postgres database is all you run

## Features

- **Leads:** search and filters, bulk actions, CSV import and export, and converting a lead
  into a contact and a deal
- **Contacts**
- **Pipelines:** a drag-and-drop kanban board, several pipelines, and custom stages
- **Tasks:** due dates, reminders and priorities, grouped into Overdue, Today and Upcoming
- **Notes and activity:** a timeline on every lead, contact and deal
- **AI lead scoring:** uses OpenAI `gpt-4o-mini`. Without an API key it falls back to a
  built-in rules scorer, and no data leaves your server.
- **Workflows:** automation in three steps: _when_ something happens, _only if_ conditions
  match, _then_ do something. Actions: change status, assign (to a person or round robin),
  add a tag, create a task, notify, rescore, or call a webhook.
- **Dashboard:** KPIs, charts and team performance
- **Team:** Admin and Member roles, with in-app notifications
- **Interface:** a clean light design, works on phones, keyboard accessible, and a
  <kbd>⌘K</kbd> command palette

## Getting started

You need Node 22 or newer, pnpm 9 (`corepack enable`) and PostgreSQL 16 running locally
(e.g. `brew install postgresql@16 && brew services start postgresql@16`).

```bash
pnpm install
cp .env.example .env            # the defaults work for local development
createdb leados_v2
pnpm db:migrate                 # creates the tables
pnpm db:seed -- --demo          # creates an admin account plus demo data (omit --demo for an empty CRM)
pnpm dev                        # API on :4000, web app on http://localhost:5173
```

The seed prints the admin login. You can choose it with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD` in `.env`. If you skip the seed, the app opens a first-run setup screen
where you create the admin account.

## Scripts

| Command                                        | What it does                                                |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                     | Runs the API and web app with hot reload                    |
| `pnpm build`                                   | Builds the shared package, the API and the web app          |
| `pnpm start`                                   | Starts the production server (API + built web app)          |
| `pnpm test`                                    | Runs all tests                                              |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Code checks                                                 |
| `pnpm db:migrate`                              | Applies database migrations                                 |
| `pnpm db:migrate:create`                       | Creates a migration after you change `prisma/schema.prisma` |
| `pnpm db:seed`                                 | Creates the first admin (`-- --demo` adds sample data)      |
| `pnpm db:studio`                               | Opens Prisma Studio to browse the data                      |

## Deploying

LeadOS ships as one Docker image (API + built web app on one origin) that needs a
PostgreSQL database. The container applies pending migrations on every start.

```bash
docker build -f infra/docker/api.Dockerfile -t leados .
docker run -p 4000:4000 -e DATABASE_URL="postgresql://…" -e JWT_SECRET="$(openssl rand -base64 48)" leados
```

Put it behind HTTPS and set `TRUST_PROXY=true` if a reverse proxy sits in front. See
[`.env.example`](.env.example) for every setting.

### Render + Neon

1. **Database (Neon):** create a project in the region closest to your Render region (e.g.
   Render Singapore → AWS Asia Pacific (Singapore)). From **Connect**, copy the **pooled**
   connection string (host contains `-pooler`) and the direct one (pooling off).
2. **Web service (Render):** New → Web Service → this repository.
   - Runtime: **Docker**, Dockerfile path `infra/docker/api.Dockerfile`, Docker context `.`
   - Health check path: `/api/health`
   - Leave build and start commands empty (the Dockerfile defines them).
3. **Environment variables:**

   | Key                                                  | Value                                                           |
   | ---------------------------------------------------- | --------------------------------------------------------------- |
   | `DATABASE_URL`                                       | Neon pooled connection string                                   |
   | `DATABASE_DIRECT_URL`                                | Neon direct connection string (used for migrations)             |
   | `JWT_SECRET`                                         | `openssl rand -base64 48`                                       |
   | `ENCRYPTION_KEY`                                     | `openssl rand -base64 48` (encrypts the stored Instagram token) |
   | `APP_ORIGIN`                                         | the service URL, e.g. `https://leados.onrender.com`             |
   | `TRUST_PROXY`                                        | `true`                                                          |
   | `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` | optional, one AI key                                            |
   | `META_APP_SECRET`                                    | optional, Instagram app secret (webhook signatures)             |
   | `META_WEBHOOK_VERIFY_TOKEN`                          | optional, any random string                                     |

   Render sets `PORT` itself; the image sets `NODE_ENV=production`.

4. **First login:** open the service URL. With an empty database the app shows a first-run
   screen where you create the admin account.
5. **Data from the previous LeadOS (optional):** before anyone creates an account, copy one
   organization from the old database into the new, empty one. The old database is only
   read. Users keep their email and password.
   ```bash
   DATABASE_URL="<new database, direct>" pnpm db:migrate
   DATABASE_URL="<new database, direct>" LEGACY_DATABASE_URL="<old database>" pnpm db:import-legacy -- --dry-run
   DATABASE_URL="<new database, direct>" LEGACY_DATABASE_URL="<old database>" pnpm db:import-legacy
   ```
   Add `-- --org <slug>` when the old database has several organizations. Notifications,
   simulated messages and follow-up rules are not copied; reconnect Instagram afterwards.
6. **Instagram (optional):** in the Meta dashboard set the webhook callback to
   `https://<your-service>/api/webhooks/instagram` with the same verify token, then connect
   the account in Settings → Instagram.

## Project layout

```
apps/api         Express API: src/modules/<area>/ (routes + service), src/lib/ (shared helpers)
apps/web         React app: src/features/<area>/ (pages), src/components/ui/ (design system)
packages/shared  Enums, zod validation schemas and API types used by both apps
prisma/          Database schema and migrations
docs/API.md      API reference
```
