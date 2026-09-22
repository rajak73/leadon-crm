# LeadOS API

Base path: `/api`. All request/response bodies are JSON unless noted. Request bodies are
validated with the zod schemas in `packages/shared/src/schemas.ts`; response shapes are the
types in `packages/shared/src/types.ts`.

## Conventions

**Envelope.** Every JSON response is wrapped:

```jsonc
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 25, "total": 80, "totalPages": 4 } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Check the highlighted fields.", "details": { "email": ["Enter a valid email address"] } } }
```

`meta` is present on paginated lists only. `error.message` is always safe to show to users.
Status codes follow `ERROR_STATUS` in `packages/shared/src/errors.ts` (validation = 422).

**Auth.** `POST /auth/login` returns an access token (JWT, 15 min) in the body and sets an
HttpOnly refresh cookie `leados_rt` (path `/api/auth`, SameSite=Lax, Secure in production,
30 days). Send `Authorization: Bearer <accessToken>` on every other request. When a request
returns 401, call `POST /auth/refresh` once (the client must share one in-flight refresh
promise), then retry. Refresh rotates the cookie; a token reused within a 30-second grace
window after rotation returns the same new session instead of revoking the family (handles
two tabs refreshing at once). Reuse outside the window revokes the family.

State-changing requests on `/auth/*` (refresh, logout) require header `X-Requested-With: fetch`
(simple CSRF guard, since they rely on the cookie).

**Roles.** `ADMIN` can do everything. `MEMBER` can read and write CRM records (leads,
contacts, deals, tasks, notes) and read pipelines and workflows, but cannot: manage users,
change settings, create/edit/delete pipelines or workflows, or bulk-delete. Endpoints marked
**(admin)** return 403 for members.

**Soft delete.** Leads, contacts, deals, tasks and workflows are soft-deleted (`deletedAt`)
and never returned afterwards.

**Pagination.** `?page=1&limit=25` (max 100). Array filters accept repeated params or
comma-separated values: `?status=NEW,CONTACTED`. `assignedToId` also accepts `me` and
`unassigned`.

## Auth & account

| Method | Path            | Body / query           | Returns                                                                                                                        |
| ------ | --------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/auth/status`  | —                      | `AuthStatus` (public)                                                                                                          |
| POST   | `/auth/setup`   | `setupSchema`          | `AuthSession` + cookie (201). Only when no users exist, else 409. Creates the admin user, settings row and a default pipeline. |
| POST   | `/auth/login`   | `loginSchema`          | `AuthSession` + cookie. 5 failed attempts lock the account for 15 min (429 `RATE_LIMITED` while locked). Rate-limited per IP.  |
| POST   | `/auth/refresh` | — (cookie)             | `AuthSession` + rotated cookie                                                                                                 |
| POST   | `/auth/logout`  | — (cookie)             | `null`, clears cookie, revokes family                                                                                          |
| GET    | `/me`           | —                      | `User`                                                                                                                         |
| PATCH  | `/me`           | `updateProfileSchema`  | `User` (409 if email taken)                                                                                                    |
| POST   | `/me/password`  | `changePasswordSchema` | `null`; revokes all other sessions                                                                                             |

## Team & settings

| Method | Path                              | Body / query              | Returns                                                                                            |
| ------ | --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/users`                          | —                         | `User[]` (all users, incl. disabled; any role — needed for assignee pickers)                       |
| POST   | `/users` **(admin)**              | `createUserSchema`        | `User` (409 if email exists)                                                                       |
| PATCH  | `/users/:id` **(admin)**          | `updateUserSchema`        | `User`. Cannot demote/disable yourself or the last active admin (409). Disabling revokes sessions. |
| POST   | `/users/:id/password` **(admin)** | `resetUserPasswordSchema` | `null`                                                                                             |
| GET    | `/settings`                       | —                         | `AppSettings`                                                                                      |
| PATCH  | `/settings` **(admin)**           | `updateSettingsSchema`    | `AppSettings`                                                                                      |

## Leads

| Method | Path                 | Body / query                                 | Returns                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/leads`             | `leadListQuerySchema`                        | `Lead[]` + meta. `search` matches first/last name, email, phone, company.                                                                                                                                                                                                                                                                                        |
| POST   | `/leads`             | `createLeadSchema`                           | `Lead` (201). 409 `CONFLICT` if a non-deleted lead with the same email exists (`details.existingId: [id]`). `LOST` is not allowed on create.                                                                                                                                                                                                                     |
| GET    | `/leads/:id`         | —                                            | `LeadDetail`                                                                                                                                                                                                                                                                                                                                                     |
| PATCH  | `/leads/:id`         | `updateLeadSchema`                           | `Lead`. Status → LOST requires `lostReason`; leaving LOST clears it. A converted (WON) lead's status can't change (409 `INVALID_TRANSITION`).                                                                                                                                                                                                                    |
| DELETE | `/leads/:id`         | —                                            | `null`                                                                                                                                                                                                                                                                                                                                                           |
| POST   | `/leads/:id/convert` | `convertLeadSchema`                          | `{ lead: Lead, contact: Contact, deal: Deal \| null }`. Sets status WON, creates a contact (or links an existing contact with the same email) and optionally a deal in the first open stage. 409 if already converted.                                                                                                                                           |
| POST   | `/leads/:id/score`   | —                                            | `AiScore` — scores now (sync). 503 `AI_UNAVAILABLE` only if the AI provider fails _and_ the rules fallback is disabled (never, by default).                                                                                                                                                                                                                      |
| GET    | `/leads/:id/scores`  | —                                            | `AiScore[]` newest first (max 20)                                                                                                                                                                                                                                                                                                                                |
| POST   | `/leads/bulk`        | `bulkLeadsSchema`                            | `{ affected: number }`. `delete` is admin-only.                                                                                                                                                                                                                                                                                                                  |
| POST   | `/leads/import`      | multipart `file` (CSV, ≤ 2 MB, ≤ 5,000 rows) | `ImportResult`. Header row required; recognised columns (case-insensitive): first name / firstName / name, last name, email, phone, company, source, status, tags (`;`-separated). Unknown columns ignored. Source/status accept labels ("Website") or values; default source `IMPORT`. Imported leads trigger `LEAD_CREATED` workflows but not AI auto-scoring. |
| GET    | `/leads/export`      | same filters as `GET /leads` (no pagination) | `text/csv` download, max 10,000 rows                                                                                                                                                                                                                                                                                                                             |
| GET    | `/leads/tags`        | —                                            | `string[]` — distinct tags in use, for filter autocomplete                                                                                                                                                                                                                                                                                                       |

## Contacts

| Method | Path            | Body / query             | Returns            |
| ------ | --------------- | ------------------------ | ------------------ |
| GET    | `/contacts`     | `contactListQuerySchema` | `Contact[]` + meta |
| POST   | `/contacts`     | `createContactSchema`    | `Contact` (201)    |
| GET    | `/contacts/:id` | —                        | `ContactDetail`    |
| PATCH  | `/contacts/:id` | `updateContactSchema`    | `Contact`          |
| DELETE | `/contacts/:id` | —                        | `null`             |

## Pipelines & deals

| Method | Path                         | Body / query           | Returns                                                                                                             |
| ------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET    | `/pipelines`                 | —                      | `Pipeline[]` (default first)                                                                                        |
| POST   | `/pipelines` **(admin)**     | `createPipelineSchema` | `Pipeline`                                                                                                          |
| GET    | `/pipelines/:id/board`       | —                      | `PipelineBoard`                                                                                                     |
| PATCH  | `/pipelines/:id` **(admin)** | `updatePipelineSchema` | `Pipeline`. Removing a stage that holds deals → 409 with a message naming the stage.                                |
| DELETE | `/pipelines/:id` **(admin)** | —                      | `null`. 409 if it has deals or is the only/default pipeline.                                                        |
| GET    | `/deals`                     | `dealListQuerySchema`  | `Deal[]` + meta                                                                                                     |
| POST   | `/deals`                     | `createDealSchema`     | `Deal` (201). Stage must belong to pipeline (422). Creating directly in a won/lost stage sets status.               |
| GET    | `/deals/:id`                 | —                      | `Deal`                                                                                                              |
| PATCH  | `/deals/:id`                 | `updateDealSchema`     | `Deal`                                                                                                              |
| POST   | `/deals/:id/move`            | `moveDealSchema`       | `Deal`. Into isWon stage → WON + closedAt; into isLost → LOST (+lostReason); out of won/lost → OPEN, closedAt null. |
| DELETE | `/deals/:id`                 | —                      | `null`                                                                                                              |

## Tasks & notes & timeline

| Method | Path          | Body / query                                         | Returns                                                                                                                                                              |
| ------ | ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/tasks`      | `taskListQuerySchema`                                | `Task[]` + meta. `due`: overdue = dueDate < now & not done; today = current calendar day, week = today + next 6 days, both in settings timezone; none = no due date. |
| POST   | `/tasks`      | `createTaskSchema`                                   | `Task` (201)                                                                                                                                                         |
| PATCH  | `/tasks/:id`  | `updateTaskSchema`                                   | `Task`. status → COMPLETED sets completedAt; leaving COMPLETED clears it.                                                                                            |
| DELETE | `/tasks/:id`  | —                                                    | `null`                                                                                                                                                               |
| GET    | `/notes`      | `?leadId` \| `?contactId` \| `?dealId` (exactly one) | `Note[]` newest first                                                                                                                                                |
| POST   | `/notes`      | `createNoteSchema`                                   | `Note` (201)                                                                                                                                                         |
| PATCH  | `/notes/:id`  | `updateNoteSchema`                                   | `Note` — author or admin only                                                                                                                                        |
| DELETE | `/notes/:id`  | —                                                    | `null` — author or admin only (hard delete)                                                                                                                          |
| GET    | `/activities` | `timelineQuerySchema`                                | `Activity[]` newest first (cursor via `before`)                                                                                                                      |

## Notifications

In-app only. The web app polls `GET /notifications/unread-count` every 30 s.

| Method | Path                          | Body / query                  | Returns                 |
| ------ | ----------------------------- | ----------------------------- | ----------------------- |
| GET    | `/notifications`              | `notificationListQuerySchema` | `Notification[]` + meta |
| GET    | `/notifications/unread-count` | —                             | `{ count: number }`     |
| POST   | `/notifications/:id/read`     | —                             | `null`                  |
| POST   | `/notifications/read-all`     | —                             | `null`                  |

Notifications are created when: a lead/deal/task is assigned to someone other than the actor;
a task becomes due (checked every minute, once per task, for tasks due within the next 15 min
or overdue and not yet reminded); a workflow `send_notification` action runs; a lead's AI
score crosses 70 for the first time (to the assignee).

## Workflows

| Method | Path                         | Body / query           | Returns                                                                                                                                                                                     |
| ------ | ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/workflows`                 | —                      | `Workflow[]`                                                                                                                                                                                |
| POST   | `/workflows` **(admin)**     | `createWorkflowSchema` | `Workflow`                                                                                                                                                                                  |
| GET    | `/workflows/:id`             | —                      | `Workflow`                                                                                                                                                                                  |
| PATCH  | `/workflows/:id` **(admin)** | `updateWorkflowSchema` | `Workflow`                                                                                                                                                                                  |
| DELETE | `/workflows/:id` **(admin)** | —                      | `null`                                                                                                                                                                                      |
| GET    | `/workflows/:id/runs`        | `paginationSchema`     | `WorkflowRun[]` + meta                                                                                                                                                                      |
| GET    | `/workflows/meta`            | —                      | `{ fields: Record<WorkflowTrigger, Array<{ key: string; label: string; type: 'string' \| 'number' \| 'enum' \| 'tags'; options?: string[] }>> }` — fields usable in conditions per trigger. |

**Engine.** Domain services emit events on an in-process event bus after their DB write
commits. The workflow engine subscribes, loads active workflows whose `triggerType` matches,
checks `trigger.config` (keys: `fromStatus`/`toStatus` for LEAD_STATUS_CHANGED; `minScore`/`maxScore`
for LEAD_SCORED; `pipelineId`, `stageId`, `fromStageId` for deal triggers), evaluates conditions against the entity,
and runs actions sequentially, writing a `WorkflowRun` with per-action logs. Runs are queued
in-process (concurrency 4) so the triggering request isn't slowed. Actions performed by a
workflow emit events with `depth + 1`; runs at depth ≥ 3 are recorded as SKIPPED (loop guard).
`outbound_webhook` POSTs `{ event, entity, workflowId, runId }` with a 10 s timeout, no
redirects, and refuses private/loopback/link-local/CGNAT addresses after DNS resolution
(connect to the resolved IP).

## Search, analytics, health

| Method | Path                   | Body / query           | Returns                                                        |
| ------ | ---------------------- | ---------------------- | -------------------------------------------------------------- |
| GET    | `/search`              | `searchQuerySchema`    | `SearchResults`                                                |
| GET    | `/analytics/dashboard` | `analyticsQuerySchema` | `DashboardSummary`                                             |
| GET    | `/health`              | —                      | `{ status: 'ok', db: 'ok' }` (public, no envelope requirement) |

## AI lead scoring

Uses the configured AI provider (see "AI provider" below) in JSON mode. The prompt includes
the lead's fields, tags, open deals and the last 20 activities; `modelVersion` records the
model name (e.g. `gemini-2.5-flash`). When no AI key is set, or the call fails/times out
(20 s), the deterministic rules scorer (`modelVersion: "rules-v1"`) is used instead so
scoring always works. When `settings.aiScoringAuto` is on, leads are rescored (debounced 10 s
per lead) after create, status change and new notes.

## AI provider

One provider serves both lead scoring and Instagram replies, chosen by env:
`AI_PROVIDER=gemini|groq|openai` (if unset: the first of GEMINI_API_KEY, GROQ_API_KEY,
OPENAI_API_KEY that is set; none → `rules`). All three are called through the `openai` SDK
using their OpenAI-compatible endpoints:

| Provider | Base URL                                                   | Key              | Default model (`AI_MODEL` overrides) |
| -------- | ---------------------------------------------------------- | ---------------- | ------------------------------------ |
| gemini   | `https://generativelanguage.googleapis.com/v1beta/openai/` | `GEMINI_API_KEY` | `gemini-2.5-flash`                   |
| groq     | `https://api.groq.com/openai/v1`                           | `GROQ_API_KEY`   | `llama-3.3-70b-versatile`            |
| openai   | default                                                    | `OPENAI_API_KEY` | `gpt-4o-mini`                        |

Use `response_format: { type: 'json_object' }` (supported by all three) and validate the
JSON with zod; on invalid JSON retry once, then fail. Timeout 20 s. Scoring falls back to
the rules scorer on any failure (as before). Replies have no fallback: if the AI fails,
nothing is sent, the conversation is flagged `needsAttention` and the error is logged.
`GET /settings` reports `aiProvider` and `aiModel`.

## Instagram

Uses the **Instagram API with Instagram Login** (graph.instagram.com, `INSTAGRAM_GRAPH_VERSION`
default `v23.0`). Needs a Meta app with the Instagram product, permissions
`instagram_business_basic`, `instagram_business_manage_messages`,
`instagram_business_manage_comments`, and a professional (Business/Creator) account.

Env: `META_APP_SECRET` (Instagram app secret — verifies webhook signatures and is used for
token refresh), `META_WEBHOOK_VERIFY_TOKEN` (random string; if unset one is derived from
JWT_SECRET and shown in settings), `PUBLIC_URL` (public https origin of this app, e.g. a
Cloudflare Tunnel URL; defaults to APP_ORIGIN), `INSTAGRAM_TEST_MODE` (default `true` in
development, `false` otherwise), `ENCRYPTION_KEY` (optional; 32+ chars; defaults to a key
derived from JWT_SECRET) for encrypting the stored token with AES-256-GCM.

**Connecting.** The admin generates a long-lived token in the Meta dashboard ("Generate
token" under Instagram API setup) and pastes it. The API calls `GET /me?fields=user_id,username,name,profile_picture_url`,
stores the account (replacing any previous one), subscribes the account to webhooks
(`POST /me/subscribed_apps?subscribed_fields=messages,comments`), and records the expiry.
A daily job refreshes the token (`GET /refresh_access_token?grant_type=ig_refresh_token`) when
it expires within 10 days. A Graph API auth error (code 190) sets status `EXPIRED` with a
friendly `statusMessage` and notifies admins once.

**Connecting from the server.** If `INSTAGRAM_ACCESS_TOKEN` is set (and test mode is off), the
server connects the account on start-up whenever none is connected or the stored one is not
ACTIVE, then keeps refreshing it as above. `InstagramStatus.managedByServer` is true and the
settings page shows no token or disconnect controls. `INSTAGRAM_APP_SECRET` and
`INSTAGRAM_WEBHOOK_VERIFY_TOKEN` (names from the previous deployment) are accepted as aliases for
`META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN`.

**Test mode.** When `INSTAGRAM_TEST_MODE=true`, all Graph API calls go to an in-process
sandbox adapter (sends succeed with fake ids, profile lookups return the username), a
"Test account" can be connected with any token, and `POST /instagram/simulate` is enabled.
This lets the whole flow — lead creation, AI reply, drafts, inbox — run on localhost.

**Webhooks** (public, no auth; mounted with a raw body parser before `express.json`):

| Method | Path                  | Behaviour                                                                                                                                                                                                                                                                                         |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/webhooks/instagram` | Meta verification: if `hub.mode=subscribe` and `hub.verify_token` matches, respond `hub.challenge` as text/plain 200, else 403.                                                                                                                                                                   |
| POST   | `/webhooks/instagram` | Verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with META_APP_SECRET, timing-safe) → 401 if invalid (in test mode unsigned requests are accepted only when META_APP_SECRET is unset). Respond 200 immediately, then process each entry on the in-process queue. Update `lastWebhookAt`. |

Processing rules:

- `messaging[]` with `message`: ignore if `message.is_deleted`; dedupe by `mid`. `is_echo`
  (the business wrote from the Instagram app, or it's our own API send) → if `mid` already
  stored, ignore; else store as OUTBOUND, author `INSTAGRAM_APP`, and pause AI for that thread
  (`aiPausedReason: "You replied from the Instagram app"`) so the AI never talks over a person.
  Otherwise upsert the conversation by sender id (fetch `name,username,profile_pic` once),
  store INBOUND, bump `unreadCount`, set `lastInboundAt`. If `createLeads` and the
  conversation has no lead: create a lead (source `INSTAGRAM`, firstName = name or
  @username, tag `instagram`) and link it. Log activity
  `INSTAGRAM_MESSAGE_RECEIVED` on the lead, notify all active admins (`INSTAGRAM_MESSAGE`,
  collapsed: at most one unread notification per conversation), then schedule auto-reply.
- `changes[]` with `field: 'comments'`: ignore comments from our own `igUserId`; dedupe by
  comment id; fetch media `permalink,caption,thumbnail_url,media_url` (cache per mediaId);
  store; optionally create/link a lead the same way (by `fromIgId`, reusing the lead of a DM
  conversation with the same igsid if any); activity + notification (`INSTAGRAM_COMMENT`);
  schedule auto-reply.
- Other fields/events are ignored.

**Auto-reply (DMs).** Runs `replyDelaySeconds` after the latest inbound message (a new
inbound message within the delay resets the timer, so a burst gets one reply). Skips when:
`dmEnabled` off, provider is `rules`, account not ACTIVE, conversation `aiEnabled` false,
reply window closed, a USER/INSTAGRAM_APP message was sent after the latest inbound message,
or the conversation already had `maxRepliesPerDay` AI replies in the last 24 h (then pause
AI with reason "Daily auto-reply limit reached" and flag attention). Prompt contents: system
rules (you are the business's Instagram assistant; answer ONLY from the business info; never
invent prices, availability, discounts or policies; if the answer isn't in the business info,
or the customer asks for a human, complains, or wants to book/pay, set handoff; reply in the
customer's language and script — Hindi, Hinglish, English…; keep it short, no markdown, at
most one emoji; ≤ 900 characters), `tone`, `businessInfo`, the last 20 messages, and known
lead fields. Required JSON: `{ "reply": string|null, "handoff": boolean, "handoffReason":
string|null, "email": string|null, "phone": string|null }`. Then:

- extracted email/phone → fill the lead's empty email/phone fields (never overwrite).
- `handoff` → pause AI (`aiPausedReason` = handoffReason), `needsAttention = true`, send
  `handoffMessage` (as author AI) if non-empty and mode is AUTO (in DRAFT mode store it as a
  draft), notify admins (`AI_HANDOFF`).
- otherwise mode AUTO → send; mode DRAFT → store as DRAFT (only one pending draft per
  conversation — replace an older one), `needsAttention = true`, notify (`AI_DRAFT_READY`).
- Sending: `POST /me/messages { recipient: { id: igsid }, message: { text } }`; store `mid`;
  on failure status FAILED with a friendly `error` ("The 24-hour reply window has closed",
  "Instagram rejected the message", …) and flag attention.

**Auto-reply (comments).** Same guards with `commentsEnabled`; delay 0–5 s; skip replies
to our own comments and comments that are replies inside a thread where we already replied.
JSON: `{ "skip": boolean, "skipReason": string|null, "publicReply": string|null,
"privateReply": string|null }` — skip spam, abuse, emojis-only praise may get a short thanks,
and anything needing a person (complaints) → skip with reason + notify. `commentReplyMode`
decides which parts are used: PUBLIC → `POST /{comment-id}/replies { message }`; PRIVATE →
`POST /me/messages { recipient: { comment_id }, message: { text } }` (one private reply per
comment, within 7 days; the resulting DM thread is stored as a conversation when the customer
answers); BOTH → both (public reply should be short, e.g. "Sent you a DM!"). DRAFT mode stores
the texts with replyStatus DRAFT.

Endpoints (all require auth; **(admin)** as before):

| Method | Path                                                              | Body / query                                                                                    | Returns                                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/instagram/status`                                               | —                                                                                               | `InstagramStatus`                                                                                                                                                                                                                                                                                                |
| POST   | `/instagram/connect` **(admin)**                                  | `connectInstagramSchema`                                                                        | `InstagramStatus`. 422 with a friendly message if Meta rejects the token.                                                                                                                                                                                                                                        |
| POST   | `/instagram/disconnect` **(admin)**                               | —                                                                                               | `InstagramStatus`. Unsubscribes (best effort), deletes the token; conversations/comments are kept.                                                                                                                                                                                                               |
| POST   | `/instagram/simulate` **(admin, test mode only — 404 otherwise)** | `simulateInstagramSchema`                                                                       | `{ conversationId: string } \| { commentId: string }` — runs the real webhook pipeline with a fake sender id derived from the username.                                                                                                                                                                          |
| GET    | `/instagram/counts`                                               | —                                                                                               | `InboxCounts` (the web app polls it every 20 s for the sidebar badge)                                                                                                                                                                                                                                            |
| GET    | `/instagram/conversations`                                        | `conversationListQuerySchema`                                                                   | `IgConversation[]` + meta, newest activity first. `attention` = needsAttention or has a draft.                                                                                                                                                                                                                   |
| GET    | `/instagram/conversations/:id`                                    | —                                                                                               | `IgConversationDetail`                                                                                                                                                                                                                                                                                           |
| PATCH  | `/instagram/conversations/:id`                                    | `updateConversationSchema`                                                                      | `IgConversation`. `aiEnabled: true` clears `aiPausedReason` and `needsAttention` (if no draft). `markRead` zeroes `unreadCount`.                                                                                                                                                                                 |
| POST   | `/instagram/conversations/:id/messages`                           | `sendMessageSchema`                                                                             | `IgMessage` (author USER). 409 if the reply window has closed. Sending clears `needsAttention` and discards any pending draft.                                                                                                                                                                                   |
| POST   | `/instagram/conversations/:id/suggest`                            | —                                                                                               | `AiReplyPreview` — AI suggestion for the latest message, nothing is sent or stored. 503 `AI_UNAVAILABLE` if provider is `rules` or the call fails.                                                                                                                                                               |
| POST   | `/instagram/messages/:id/draft`                                   | `draftActionSchema`                                                                             | `IgMessage` — send (optionally edited) or discard a DRAFT. 409 if not a draft.                                                                                                                                                                                                                                   |
| POST   | `/instagram/conversations/:id/lead`                               | —                                                                                               | `IgConversation` — create and link a lead now (if none).                                                                                                                                                                                                                                                         |
| GET    | `/instagram/comments/posts`                                       | —                                                                                               | `IgCommentPost[]` — one row per post with `commentCount`, `needsReplyCount` (NONE/FAILED), `draftCount`, `latestCommentAt`, `latestPendingAt`. Posts with pending work (needs reply or draft) first, by newest pending comment; then by newest comment. Media fields come from the newest comment that has them. |
| GET    | `/instagram/comments`                                             | `commentListQuerySchema` (`status[]`, `mediaId`, `search`, `sortOrder` asc/desc, `limit` ≤ 100) | `IgComment[]` + meta, by `commentedAt` — newest first by default, `sortOrder=asc` for oldest first. Thread replies are included (`parentCommentId` = the Instagram id of the top-level comment).                                                                                                                 |
| POST   | `/instagram/comments/:id/reply`                                   | `commentReplySchema`                                                                            | `IgComment` — manual reply or approve an edited draft; sends what's given.                                                                                                                                                                                                                                       |
| POST   | `/instagram/comments/:id/skip`                                    | —                                                                                               | `IgComment` (replyStatus SKIPPED, clears draft)                                                                                                                                                                                                                                                                  |
| POST   | `/instagram/comments/:id/discard`                                 | —                                                                                               | `IgComment` — drops an AI draft; replyStatus back to NONE (needs reply). 409 if not a draft.                                                                                                                                                                                                                     |
| POST   | `/instagram/comments/:id/suggest`                                 | —                                                                                               | `CommentReplyPreview`                                                                                                                                                                                                                                                                                            |
| GET    | `/auto-reply/settings`                                            | —                                                                                               | `AutoReplySettings`                                                                                                                                                                                                                                                                                              |
| PATCH  | `/auto-reply/settings` **(admin)**                                | `updateAutoReplySettingsSchema`                                                                 | `AutoReplySettings`. Enabling DM/comments when provider is `rules` → 409 "Add a Gemini, Groq or OpenAI API key to turn on AI replies."                                                                                                                                                                           |
| POST   | `/auto-reply/test`                                                | `testAutoReplySchema`                                                                           | `AiReplyPreview` (kind dm) or `CommentReplyPreview` (kind comment) — uses current settings, nothing is stored or sent.                                                                                                                                                                                           |

Lead detail: `LeadDetail` gains nothing new, but the lead's activity timeline shows the
Instagram activities, and `GET /instagram/conversations?search=` matches username/name.
