/**
 * `pnpm db:import-legacy [-- --org <id|slug>] [-- --dry-run]`
 * Copies the data of one organization from the previous LeadOS deployment's database
 * (LEGACY_DATABASE_URL: tables "Organization", "Lead", "Conversation", …) into this app's
 * database (DATABASE_URL). The legacy database is only read. The target must be migrated and
 * empty (no users yet). `--dry-run` does everything inside a transaction and rolls it back.
 *
 * Copied: members (same email and password), leads, contacts, pipelines and stages, deals,
 * tasks, notes (the old free-text "notes" fields), activity timeline, workflows whose
 * definition is still valid, and Instagram DM conversations with their messages.
 * Not copied: the Instagram connection (reconnect it in Settings → Instagram), simulated test
 * messages, notifications, webhook logs, saved views, follow-up and auto-reply rules.
 * Ids are kept, so links between records stay intact. Values the new app doesn't know are
 * mapped to the closest one and listed in the summary.
 */
import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  DEAL_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  WORKFLOW_TRIGGERS,
  workflowDefinitionSchema,
} from '@leados/shared';
import { env, withDefaultUser } from '../config/env.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { SETTINGS_ID } from '../modules/settings/index.js';

type Row = Record<string, unknown>;

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const orgArg = argv.includes('--org') ? argv[argv.indexOf('--org') + 1] : undefined;

const legacyUrl = process.env.LEGACY_DATABASE_URL?.trim();

/** Placeholder hash that no password matches (for accounts that had no email password). */
const NO_PASSWORD = '!no-password';

// ─── Value mapping ───────────────────────────────────────────────────────────

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const date = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null);
const key = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

/** Counts values that had no exact counterpart, e.g. "lead status: HOT → QUALIFIED" ×3. */
const remapped = new Map<string, number>();
const noteRemap = (note: string) => remapped.set(note, (remapped.get(note) ?? 0) + 1);

function mapValue(
  label: string,
  value: unknown,
  allowed: readonly string[],
  aliases: Record<string, string>,
  fallback: string,
): string {
  const k = key(value);
  if (allowed.includes(k)) return k;
  const mapped = aliases[k] ?? fallback;
  noteRemap(`${label}: ${String(value ?? '(empty)')} → ${mapped}`);
  return mapped;
}

const leadSource = (v: unknown) =>
  mapValue(
    'lead source',
    v,
    LEAD_SOURCES,
    {
      INSTAGRAM_DM: 'INSTAGRAM',
      INSTAGRAM_COMMENT: 'INSTAGRAM',
      IG: 'INSTAGRAM',
      WEB: 'WEBSITE',
      WEB_FORM: 'WEBSITE',
      FORM: 'WEBSITE',
      CSV: 'IMPORT',
      FB: 'FACEBOOK',
      CALL: 'PHONE',
    },
    'OTHER',
  );
const leadStatus = (v: unknown) =>
  mapValue(
    'lead status',
    v,
    LEAD_STATUSES,
    {
      OPEN: 'NEW',
      IN_PROGRESS: 'CONTACTED',
      INTERESTED: 'QUALIFIED',
      HOT: 'QUALIFIED',
      CONVERTED: 'WON',
      CLOSED_WON: 'WON',
      CLOSED_LOST: 'LOST',
      JUNK: 'LOST',
      SPAM: 'LOST',
    },
    'NEW',
  );
const dealStatus = (v: unknown) =>
  mapValue('deal status', v, DEAL_STATUSES, { CLOSED_WON: 'WON', CLOSED_LOST: 'LOST' }, 'OPEN');
const taskStatus = (v: unknown) =>
  mapValue(
    'task status',
    v,
    TASK_STATUSES,
    {
      TODO: 'PENDING',
      OPEN: 'PENDING',
      DONE: 'COMPLETED',
      COMPLETE: 'COMPLETED',
      CANCELED: 'CANCELLED',
    },
    'PENDING',
  );
const taskPriority = (v: unknown) =>
  mapValue('task priority', v, TASK_PRIORITIES, { NORMAL: 'MEDIUM', CRITICAL: 'URGENT' }, 'MEDIUM');

/** The old app logged free-form activity types; keep the timeline under the closest new type. */
function activityType(v: unknown): string {
  const k = key(v);
  const pick = (t: string) => {
    if (t !== k) noteRemap(`activity type: ${String(v)} → ${t}`);
    return t;
  };
  if (/NOTE/.test(k)) return pick('NOTE_ADDED');
  if (/TASK/.test(k)) return pick(/COMPLET|DONE/.test(k) ? 'TASK_COMPLETED' : 'TASK_CREATED');
  if (/DEAL/.test(k)) {
    if (/WON/.test(k)) return pick('DEAL_WON');
    if (/LOST/.test(k)) return pick('DEAL_LOST');
    if (/STAGE|MOVE/.test(k)) return pick('DEAL_STAGE_MOVED');
    return pick(/CREAT/.test(k) ? 'DEAL_CREATED' : 'DEAL_UPDATED');
  }
  if (/CONTACT/.test(k)) return pick(/CREAT/.test(k) ? 'CONTACT_CREATED' : 'CONTACT_UPDATED');
  if (/COMMENT/.test(k)) return pick('INSTAGRAM_COMMENT_RECEIVED');
  if (/MESSAGE|DM|REPLY/.test(k)) {
    return pick(
      /SENT|SEND|OUT|REPL/.test(k) ? 'INSTAGRAM_MESSAGE_SENT' : 'INSTAGRAM_MESSAGE_RECEIVED',
    );
  }
  if (/WORKFLOW|AUTOMATION/.test(k)) return pick('WORKFLOW_ACTION');
  if (/SCOR/.test(k)) return pick('LEAD_SCORED');
  if (/CONVERT/.test(k)) return pick('LEAD_CONVERTED');
  if (/ASSIGN/.test(k)) return pick('LEAD_ASSIGNED');
  if (/STATUS/.test(k)) return pick('LEAD_STATUS_CHANGED');
  if (/CREAT/.test(k)) return pick('LEAD_CREATED');
  return pick('LEAD_UPDATED');
}

/** "Priya Mehta" → { firstName: "Priya", lastName: "Mehta" }. */
function splitName(name: unknown): { firstName: string; lastName: string | null } {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: 'Unknown', lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') || null };
}

/** Tags were stored as text: a JSON array or a comma-separated list. */
function tagsOf(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  let list: unknown[] = s.split(',');
  try {
    const parsed: unknown = JSON.parse(s);
    if (Array.isArray(parsed)) list = parsed;
  } catch {
    // not JSON: a comma-separated list
  }
  return [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
}

// ─── Ids ─────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The new app only accepts UUID ids; the old one used other formats (e.g. cuid). Each old id
 * maps to a fixed UUID (name-based, v5 layout), so references between records stay intact.
 */
function uid(legacyId: unknown): string {
  const id = String(legacyId);
  if (UUID.test(id)) return id.toLowerCase();
  const h = crypto.createHash('sha1').update(`leados-legacy:${id}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Columns holding ids of other legacy rows (externalId, mediaId… are Instagram's ids). */
const ID_COLUMNS = [
  'id',
  'userId',
  'pipelineId',
  'stageId',
  'leadId',
  'contactId',
  'dealId',
  'conversationId',
  'assignedUserId',
  'ownerId',
  'actorUserId',
];
const legacyIds = new Set<string>();
function withUuids(row: Row): Row {
  const out = { ...row };
  for (const col of ID_COLUMNS) {
    if (out[col] === null || out[col] === undefined) continue;
    legacyIds.add(String(out[col]));
    out[col] = uid(out[col]);
  }
  return out;
}
/** Rewrites legacy ids inside a workflow definition (e.g. the user to assign leads to). */
function remapIds(value: unknown): unknown {
  if (typeof value === 'string') return legacyIds.has(value) ? uid(value) : value;
  if (Array.isArray(value)) return value.map(remapIds);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapIds(v)]));
  }
  return value;
}

const isBcrypt = (hash: unknown) => typeof hash === 'string' && /^\$2[aby]\$\d\d\$/.test(hash);

// ─── Read ────────────────────────────────────────────────────────────────────

async function pickOrganization(legacy: PrismaClient): Promise<Row> {
  const orgs = await legacy.$queryRawUnsafe<Row[]>(
    `SELECT o.id, o.name, o.slug, o.status,
            (SELECT count(*)::int FROM "Lead" l WHERE l."organizationId" = o.id) AS leads,
            (SELECT count(*)::int FROM "Message" m WHERE m."organizationId" = o.id) AS messages
     FROM "Organization" o ORDER BY o."createdAt"`,
  );
  if (orgArg) {
    const org = orgs.find((o) => o.id === orgArg || o.slug === orgArg);
    if (!org) throw new Error(`No organization with id or slug "${orgArg}".`);
    return org;
  }
  if (orgs.length === 1) return orgs[0]!;
  console.error('The legacy database has several organizations. Pick one with -- --org <slug>:\n');
  console.error(`  ${'slug'.padEnd(28)} ${'leads'.padStart(5)} ${'messages'.padStart(8)}  name`);
  for (const o of orgs) {
    console.error(
      `  ${String(o.slug).padEnd(28)} ${String(o.leads).padStart(5)} ${String(o.messages).padStart(8)}  ${o.name} (${o.status})`,
    );
  }
  process.exit(1);
}

async function readLegacy(legacy: PrismaClient, orgId: string) {
  const q = async (sql: string) => (await legacy.$queryRawUnsafe<Row[]>(sql, orgId)).map(withUuids);
  return {
    members: await q(
      `SELECT m.role, u.id, u.email, u."passwordHash", u."firstName", u."lastName", u."createdAt"
       FROM "OrganizationMember" m JOIN "User" u ON u.id = m."userId"
       WHERE m."organizationId" = $1`,
    ),
    contacts: await q(`SELECT * FROM "Contact" WHERE "organizationId" = $1`),
    leads: await q(`SELECT * FROM "Lead" WHERE "organizationId" = $1`),
    pipelines: await q(`SELECT * FROM "Pipeline" WHERE "organizationId" = $1 ORDER BY "createdAt"`),
    stages: await q(
      `SELECT s.* FROM "PipelineStage" s JOIN "Pipeline" p ON p.id = s."pipelineId"
       WHERE p."organizationId" = $1 ORDER BY s."pipelineId", s."order"`,
    ),
    deals: await q(`SELECT * FROM "Deal" WHERE "organizationId" = $1`),
    tasks: await q(`SELECT * FROM "Task" WHERE "organizationId" = $1`),
    activities: await q(`SELECT * FROM "Activity" WHERE "organizationId" = $1`),
    workflows: await q(`SELECT * FROM "Workflow" WHERE "organizationId" = $1`),
    conversations: await q(`SELECT * FROM "Conversation" WHERE "organizationId" = $1`),
    messages: await q(
      `SELECT * FROM "Message" WHERE "organizationId" = $1 ORDER BY "createdAt", id`,
    ),
  };
}

// ─── Transform ───────────────────────────────────────────────────────────────

function transform(org: Row, data: Awaited<ReturnType<typeof readLegacy>>) {
  const warnings: string[] = [];

  // Users: the organization's members. OWNER/ADMIN → ADMIN, everyone else → MEMBER.
  const users: Prisma.UserCreateManyInput[] = data.members.map((m) => ({
    id: String(m.id),
    email: String(m.email).trim().toLowerCase(),
    passwordHash: isBcrypt(m.passwordHash) ? String(m.passwordHash) : NO_PASSWORD,
    firstName: str(m.firstName) ?? String(m.email).split('@')[0]!,
    lastName: str(m.lastName) ?? '',
    role: ['OWNER', 'ADMIN'].includes(key(m.role)) ? 'ADMIN' : 'MEMBER',
    createdAt: date(m.createdAt)!,
  }));
  const noPassword = users.filter((u) => u.passwordHash === NO_PASSWORD).map((u) => u.email);
  if (noPassword.length) {
    warnings.push(
      `No email password for ${noPassword.join(', ')} (e.g. Google sign-in); an admin sets one in Settings → Team.`,
    );
  }
  const admin =
    users.find((u) => u.role === 'ADMIN' && u.passwordHash !== NO_PASSWORD) ??
    users.find((u) => u.role === 'ADMIN');
  if (!admin) throw new Error('The organization has no owner or admin, so nobody could manage it.');
  if (admin.passwordHash === NO_PASSWORD) {
    throw new Error(`No admin can sign in with a password (${admin.email}); nobody could log in.`);
  }
  const adminId = admin.id!;
  const userIds = new Set(users.map((u) => u.id!));
  const userRef = (v: unknown) => (v && userIds.has(String(v)) ? String(v) : null);

  // Pipelines: each needs exactly one Won and one Lost stage (matched by key or name).
  const pipelines = data.pipelines.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    isDefault: Boolean(p.isDefault),
    createdAt: date(p.createdAt)!,
  }));
  if (pipelines.length === 0) {
    pipelines.push({
      id: uid(`${String(org.id)}-pipeline`),
      name: 'Sales pipeline',
      isDefault: true,
      createdAt: new Date(),
    });
  }
  if (!pipelines.some((p) => p.isDefault)) pipelines[0]!.isDefault = true;
  const stages: Prisma.PipelineStageCreateManyInput[] = [];
  for (const p of pipelines) {
    const own = data.stages.filter((s) => s.pipelineId === p.id);
    // Whole words only: "CLOSED_WON" is won, not lost.
    const words = (s: Row) => new Set(`${key(s.key)}_${key(s.name)}`.split('_'));
    const won = own.find((s) => ['WON', 'WIN'].some((w) => words(s).has(w)));
    const lost = own.find((s) => ['LOST', 'LOSE', 'LOSS'].some((w) => words(s).has(w)));
    own.forEach((s, i) =>
      stages.push({
        id: String(s.id),
        pipelineId: p.id,
        name: String(s.name),
        order: i,
        probability: s.probability === null ? null : Number(s.probability),
        isWon: s === won,
        isLost: s === lost,
      }),
    );
    let order = own.length;
    if (!won) {
      stages.push({
        id: uid(`${p.id}-won`),
        pipelineId: p.id,
        name: 'Won',
        order: order++,
        probability: 100,
        isWon: true,
      });
    }
    if (!lost) {
      stages.push({
        id: uid(`${p.id}-lost`),
        pipelineId: p.id,
        name: 'Lost',
        order: order++,
        probability: 0,
        isLost: true,
      });
    }
  }
  const stagesOf = (pipelineId: string) => stages.filter((s) => s.pipelineId === pipelineId);
  const pipelineIds = new Set(pipelines.map((p) => p.id));
  const defaultPipeline = pipelines.find((p) => p.isDefault)!.id;

  // Leads and contacts. Old free-text notes become a note on the record.
  const leadIds = new Set(data.leads.map((l) => String(l.id)));
  const contactIds = new Set(data.contacts.map((c) => String(c.id)));
  const ref = (ids: Set<string>, v: unknown) => (v && ids.has(String(v)) ? String(v) : null);
  const notes: Prisma.NoteCreateManyInput[] = [];
  const addNote = (text: unknown, at: unknown, link: Partial<Prisma.NoteCreateManyInput>) => {
    const content = str(text);
    if (content) notes.push({ content, createdById: adminId, createdAt: date(at)!, ...link });
  };

  const leads: Prisma.LeadCreateManyInput[] = data.leads.map((l) => {
    addNote(l.notes, l.createdAt, { relatedLeadId: String(l.id) });
    const score = Number(l.score);
    return {
      id: String(l.id),
      ...splitName(l.name),
      email: str(l.email),
      phone: str(l.phone),
      source: leadSource(l.source),
      status: leadStatus(l.status),
      tags: tagsOf(l.tags),
      aiScore: Number.isFinite(score) && score > 0 ? Math.min(100, Math.round(score)) : null,
      assignedToId: userRef(l.assignedUserId),
      createdById: adminId,
      lastActivityAt: date(l.lastActivityAt),
      createdAt: date(l.createdAt)!,
    };
  });
  const contacts: Prisma.ContactCreateManyInput[] = data.contacts.map((c) => {
    addNote(c.notes, c.createdAt, { relatedContactId: String(c.id) });
    return {
      id: String(c.id),
      ...splitName(c.name),
      email: str(c.email),
      phone: str(c.phone),
      company: str(c.company),
      createdById: adminId,
      createdAt: date(c.createdAt)!,
    };
  });

  // Deals: one without a valid stage goes to the stage matching its status.
  const dealIds = new Set(data.deals.map((d) => String(d.id)));
  const deals: Prisma.DealCreateManyInput[] = data.deals.map((d) => {
    addNote(d.notes, d.createdAt, { relatedDealId: String(d.id) });
    const status = dealStatus(d.status);
    const pipelineId =
      d.pipelineId && pipelineIds.has(String(d.pipelineId))
        ? String(d.pipelineId)
        : defaultPipeline;
    const list = stagesOf(pipelineId);
    const stage =
      list.find((s) => s.id === d.stageId) ??
      (status === 'WON'
        ? list.find((s) => s.isWon)
        : status === 'LOST'
          ? list.find((s) => s.isLost)
          : list.find((s) => !s.isWon && !s.isLost)) ??
      list[0]!;
    const owner = userRef(d.ownerId);
    return {
      id: String(d.id),
      title: String(d.title),
      value: d.value === null ? null : Number(d.value),
      status,
      pipelineId,
      stageId: stage.id!,
      leadId: ref(leadIds, d.leadId),
      contactId: ref(contactIds, d.contactId),
      assignedToId: owner,
      createdById: owner ?? adminId,
      expectedCloseDate: date(d.expectedCloseDate),
      closedAt: status === 'OPEN' ? null : date(d.updatedAt),
      createdAt: date(d.createdAt)!,
    };
  });

  const now = new Date();
  const tasks: Prisma.TaskCreateManyInput[] = data.tasks.map((t) => {
    const status = taskStatus(t.status);
    const due = date(t.dueDate);
    return {
      id: String(t.id),
      title: String(t.title),
      description: str(t.description),
      priority: taskPriority(t.priority),
      status,
      dueDate: due,
      completedAt: status === 'COMPLETED' ? date(t.updatedAt) : null,
      // Reminders for past due dates were the old app's job; don't send them again.
      reminderSentAt: due && due < now ? now : null,
      assignedToId: userRef(t.assignedUserId),
      createdById: adminId,
      relatedLeadId: ref(leadIds, t.leadId),
      relatedContactId: ref(contactIds, t.contactId),
      relatedDealId: ref(dealIds, t.dealId),
      createdAt: date(t.createdAt)!,
    };
  });

  const activities: Prisma.ActivityCreateManyInput[] = data.activities.map((a) => ({
    id: String(a.id),
    type: activityType(a.type),
    description: String(a.message),
    performedById: userRef(a.actorUserId),
    relatedLeadId: ref(leadIds, a.leadId),
    relatedContactId: ref(contactIds, a.contactId),
    createdAt: date(a.createdAt)!,
  }));

  // Workflows: only definitions the new engine accepts, imported switched off for review.
  const workflows: Prisma.WorkflowCreateManyInput[] = [];
  for (const w of data.workflows) {
    let definition: unknown = w.definition;
    try {
      if (typeof definition === 'string') definition = JSON.parse(definition);
    } catch {
      definition = null;
    }
    const parsed = workflowDefinitionSchema.safeParse(remapIds(definition));
    if (
      !parsed.success ||
      !(WORKFLOW_TRIGGERS as readonly string[]).includes(parsed.data.trigger.type)
    ) {
      warnings.push(
        `Workflow "${String(w.name)}" isn't in a format the new app supports; recreate it.`,
      );
      continue;
    }
    workflows.push({
      id: String(w.id),
      name: String(w.name),
      triggerType: parsed.data.trigger.type,
      definition: parsed.data as unknown as Prisma.InputJsonValue,
      isActive: false,
      createdById: adminId,
      createdAt: date(w.createdAt)!,
    });
  }
  if (workflows.length) {
    warnings.push(
      `${workflows.length} workflow(s) imported switched off; review and turn them on.`,
    );
  }

  // Instagram DMs. The customer's Instagram id is the conversation's externalId.
  const skipped = new Map<string, number>();
  const skip = (why: string) => {
    skipped.set(why, (skipped.get(why) ?? 0) + 1);
    return false;
  };
  // The old app sometimes kept several conversations for one customer; merge them into the
  // oldest (the new app has one conversation per customer).
  const byIgsid = new Map<string, Row>();
  const mergedInto = new Map<string, string>();
  const byAge = [...data.conversations].sort(
    (a, b) => date(a.createdAt)!.getTime() - date(b.createdAt)!.getTime(),
  );
  for (const c of byAge) {
    const channel = key(c.channel);
    if (!channel.includes('INSTAGRAM') && channel !== 'IG') {
      skip(`conversations on ${String(c.channel)}`);
      continue;
    }
    if (key(c.type).includes('COMMENT')) {
      skip('comment threads');
      continue;
    }
    const igsid = str(c.externalId);
    if (!igsid) {
      skip('conversations without an Instagram user id');
      continue;
    }
    const kept = byIgsid.get(igsid);
    if (!kept) {
      byIgsid.set(igsid, { ...c });
      mergedInto.set(String(c.id), String(c.id));
      continue;
    }
    kept.leadId ??= c.leadId;
    kept.customerName ??= c.customerName;
    kept.unreadCount = (Number(kept.unreadCount) || 0) + (Number(c.unreadCount) || 0);
    mergedInto.set(String(c.id), String(kept.id));
    skip('duplicate conversations (merged, their messages kept)');
  }
  const conversations = [...byIgsid.values()];
  const messages = data.messages.flatMap((m) => {
    const conversationId = mergedInto.get(String(m.conversationId));
    if (m.isSimulation) skip('simulated test messages');
    else if (!conversationId) skip('messages of skipped conversations');
    else return [{ ...m, conversationId } as Row];
    return [];
  });
  const isInbound = (m: Row) => key(m.direction).startsWith('IN');
  const lastOf = new Map<string, Row>();
  const lastInboundOf = new Map<string, Date>();
  for (const m of messages) {
    lastOf.set(String(m.conversationId), m);
    if (isInbound(m)) lastInboundOf.set(String(m.conversationId), date(m.createdAt)!);
  }
  const textOf = (m: Row) =>
    str(m.body) ??
    (key(m.type) && key(m.type) !== 'TEXT' ? `[${String(m.type).toLowerCase()}]` : null);

  const igConversations: Prisma.IgConversationCreateManyInput[] = conversations.map((c) => {
    const last = lastOf.get(String(c.id));
    const name = str(c.customerName);
    return {
      id: String(c.id),
      igsid: str(c.externalId)!,
      username: name && !/\s/.test(name) ? name.replace(/^@/, '') : null,
      name: name && /\s/.test(name) ? name : null,
      leadId: ref(leadIds, c.leadId),
      unreadCount: Number(c.unreadCount) || 0,
      lastMessageAt: last ? date(last.createdAt) : null,
      lastMessagePreview: last ? (textOf(last) ?? '[attachment]').slice(0, 200) : null,
      lastInboundAt: lastInboundOf.get(String(c.id)) ?? null,
      createdAt: date(c.createdAt)!,
    };
  });
  const seenMid = new Set<string>();
  const igMessages: Prisma.IgMessageCreateManyInput[] = messages.map((m) => {
    const inbound = isInbound(m);
    let mid = str(m.externalId);
    if (mid && seenMid.has(mid)) mid = null;
    if (mid) seenMid.add(mid);
    return {
      id: String(m.id),
      conversationId: String(m.conversationId),
      direction: inbound ? 'INBOUND' : 'OUTBOUND',
      mid,
      text: textOf(m),
      author: inbound ? 'CUSTOMER' : 'USER',
      status: inbound ? 'RECEIVED' : /FAIL|ERROR/.test(key(m.status)) ? 'FAILED' : 'SENT',
      createdAt: date(m.createdAt)!,
      sentAt: inbound ? null : date(m.createdAt),
    };
  });

  return {
    admin,
    warnings,
    skipped,
    rows: {
      users,
      contacts,
      leads,
      pipelines,
      stages,
      deals,
      tasks,
      notes,
      activities,
      workflows,
      igConversations,
      igMessages,
    },
  };
}

// ─── Write ───────────────────────────────────────────────────────────────────

async function insert<T>(label: string, rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 1000) await write(rows.slice(i, i + 1000));
  console.log(`  ${label.padEnd(24)} ${rows.length}`);
}

async function write(tx: Tx, org: Row, r: ReturnType<typeof transform>['rows']): Promise<void> {
  await tx.appSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, companyName: String(org.name) },
    update: {},
  });
  await insert('users', r.users, (c) => tx.user.createMany({ data: c }));
  await insert('contacts', r.contacts, (c) => tx.contact.createMany({ data: c }));
  await insert('leads', r.leads, (c) => tx.lead.createMany({ data: c }));
  await insert('pipelines', r.pipelines, (c) => tx.pipeline.createMany({ data: c }));
  await insert('pipeline stages', r.stages, (c) => tx.pipelineStage.createMany({ data: c }));
  await insert('deals', r.deals, (c) => tx.deal.createMany({ data: c }));
  await insert('tasks', r.tasks, (c) => tx.task.createMany({ data: c }));
  await insert('notes', r.notes, (c) => tx.note.createMany({ data: c }));
  await insert('activities', r.activities, (c) => tx.activity.createMany({ data: c }));
  await insert('workflows', r.workflows, (c) => tx.workflow.createMany({ data: c }));
  await insert('Instagram conversations', r.igConversations, (c) =>
    tx.igConversation.createMany({ data: c }),
  );
  await insert('Instagram messages', r.igMessages, (c) => tx.igMessage.createMany({ data: c }));
}

async function main(): Promise<void> {
  if (!legacyUrl) {
    console.error('Set LEGACY_DATABASE_URL to the old LeadOS database (it is only read).');
    process.exit(1);
  }
  if (withDefaultUser(legacyUrl) === env.DATABASE_URL) {
    console.error('LEGACY_DATABASE_URL and DATABASE_URL point to the same database.');
    process.exit(1);
  }

  const legacy = new PrismaClient({ datasourceUrl: withDefaultUser(legacyUrl) });
  try {
    const existing = await prisma.user.count().catch(() => {
      console.error('The target database has no tables yet. Run `pnpm db:migrate` first.');
      process.exit(1);
    });
    if (existing > 0) {
      console.error(
        `The target database already has ${existing} user(s). Import into an empty one.`,
      );
      process.exit(1);
    }

    const org = await pickOrganization(legacy);
    console.log(`Reading "${String(org.name)}" from the legacy database…`);
    const { admin, warnings, skipped, rows } = transform(
      org,
      await readLegacy(legacy, String(org.id)),
    );

    console.log(dryRun ? 'Would import:' : 'Importing:');
    await prisma
      .$transaction(
        async (tx) => {
          await write(tx, org, rows);
          if (dryRun) throw new DryRunDone(); // roll everything back
        },
        { timeout: 300_000 },
      )
      .catch((e) => {
        if (!(e instanceof DryRunDone)) throw e;
      });

    for (const [why, n] of skipped) console.log(`  skipped ${why}: ${n}`);
    if (remapped.size) {
      console.log('\nValues mapped to the closest new value:');
      for (const [note, n] of [...remapped].sort()) console.log(`  ${note}  ×${n}`);
    }
    if (warnings.length) {
      console.log('\nCheck after import:');
      for (const w of warnings) console.log(`  - ${w}`);
    }
    console.log(
      dryRun
        ? '\nDry run: nothing was written.'
        : `\nDone. Sign in with your old email and password (admin: ${admin.email}). Reconnect Instagram in Settings → Instagram.`,
    );
  } finally {
    await legacy.$disconnect();
    await prisma.$disconnect();
  }
}

class DryRunDone extends Error {}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
