import crypto from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import type { Prisma } from '@prisma/client';
import { ErrorCode, createLeadSchema, type ImportResult, type LeadListQuery } from '@leados/shared';
import type { Actor } from '../../lib/auth.js';
import { AppError } from '../../lib/errors.js';
import { emitAll } from '../../lib/events.js';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, fullName } from '../../lib/labels.js';
import { prisma } from '../../lib/prisma.js';
import { asTags } from '../../lib/serializers.js';
import { buildLeadWhere, leadOrderBy, type LeadFilters } from './leads.service.js';

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_EXPORT_ROWS = 10_000;
const CHUNK = 500;

const importError = (message: string) =>
  new AppError(ErrorCode.VALIDATION_ERROR, message, { file: [message] });

/** Header aliases, compared after lower-casing and removing spaces, dashes and underscores. */
const HEADER_ALIASES: Record<string, string> = {
  firstname: 'firstName',
  first: 'firstName',
  name: 'name',
  fullname: 'name',
  lastname: 'lastName',
  last: 'lastName',
  surname: 'lastName',
  email: 'email',
  emailaddress: 'email',
  phone: 'phone',
  phonenumber: 'phone',
  mobile: 'phone',
  company: 'company',
  companyname: 'company',
  organisation: 'company',
  organization: 'company',
  source: 'source',
  status: 'status',
  tags: 'tags',
};

const normaliseHeader = (h: string) =>
  HEADER_ALIASES[h.toLowerCase().replace(/[\s_-]+/g, '')] ?? null;

/** Maps a friendly value ("Website", "whats app") to the enum value, or leaves it for zod to reject. */
function toEnumValue(
  value: string | undefined,
  labels: Record<string, string>,
): string | undefined {
  if (!value) return undefined;
  const key = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (key in labels) return key;
  const byLabel = Object.entries(labels).find(
    ([, label]) => label.toLowerCase() === value.trim().toLowerCase(),
  );
  return byLabel ? byLabel[0] : value.trim();
}

export async function importLeads(actor: Actor, file: Buffer): Promise<ImportResult> {
  let rows: string[][];
  try {
    rows = parseCsv(file, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];
  } catch {
    throw importError("We couldn't read this file. Make sure it's a CSV file with a header row.");
  }
  const [header, ...data] = rows;
  if (!header) throw importError('The file is empty.');
  const columns = header.map(normaliseHeader);
  if (!columns.includes('firstName') && !columns.includes('name')) {
    throw importError('Add a "First name" (or "Name") column to the header row.');
  }
  if (data.length > MAX_IMPORT_ROWS) {
    throw importError(
      `The file has ${data.length.toLocaleString('en-IN')} rows. Import at most 5,000 rows at a time.`,
    );
  }

  const result: ImportResult = { total: data.length, created: 0, skipped: 0, errors: [] };
  const candidates: Array<{ row: number; lead: Prisma.LeadCreateManyInput }> = [];
  const seenEmails = new Set<string>();

  data.forEach((cells, index) => {
    const row = index + 1;
    const raw: Record<string, string> = {};
    columns.forEach((col, i) => {
      if (col && cells[i] !== undefined && raw[col] === undefined) raw[col] = cells[i]!;
    });
    if (raw.name && !raw.firstName) {
      const [first, ...rest] = raw.name.split(/\s+/);
      raw.firstName = first ?? '';
      if (!raw.lastName && rest.length) raw.lastName = rest.join(' ');
    }
    const parsed = createLeadSchema.safeParse({
      firstName: raw.firstName ?? '',
      lastName: raw.lastName,
      email: raw.email,
      phone: raw.phone,
      company: raw.company,
      source: toEnumValue(raw.source, LEAD_SOURCE_LABEL) ?? 'IMPORT',
      status: toEnumValue(raw.status, LEAD_STATUS_LABEL) ?? 'NEW',
      tags: raw.tags
        ? raw.tags
            .split(';')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0] ?? '');
      const label =
        (
          {
            firstName: 'First name',
            lastName: 'Last name',
            email: 'Email',
            phone: 'Phone',
            company: 'Company',
            status: 'Status',
            source: 'Source',
            tags: 'Tags',
          } as Record<string, string>
        )[field] ?? field;
      const message =
        issue.code === 'invalid_enum_value' || issue.code === 'invalid_literal'
          ? `${label} "${raw[field] ?? ''}" isn't recognised`
          : issue.message;
      result.errors.push({
        row,
        message: field && !message.startsWith(label) ? `${label}: ${message}` : message,
      });
      return;
    }
    const lead = parsed.data;
    if (lead.status === 'LOST') {
      result.errors.push({ row, message: 'Status: leads can’t be imported as Lost' });
      return;
    }
    if (lead.email) {
      if (seenEmails.has(lead.email)) {
        result.skipped++;
        return;
      }
      seenEmails.add(lead.email);
    }
    candidates.push({
      row,
      lead: {
        id: crypto.randomUUID(),
        firstName: lead.firstName,
        lastName: lead.lastName ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        company: lead.company ?? null,
        source: lead.source,
        status: lead.status,
        tags: lead.tags,
        createdById: actor.userId!,
      },
    });
  });

  // Skip emails that already exist (one query per chunk, not per row).
  const emails = [...seenEmails];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += CHUNK) {
    const found = await prisma.lead.findMany({
      where: { email: { in: emails.slice(i, i + CHUNK) }, deletedAt: null },
      select: { email: true },
    });
    found.forEach((f) => f.email && existing.add(f.email));
  }
  const toCreate = candidates
    .filter((c) => !(c.lead.email && existing.has(c.lead.email)))
    .map((c) => c.lead);
  result.skipped += candidates.length - toCreate.length;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < toCreate.length; i += CHUNK) {
      const chunk = toCreate.slice(i, i + CHUNK);
      await tx.lead.createMany({ data: chunk.map((l) => ({ ...l, lastActivityAt: now })) });
      await tx.activity.createMany({
        data: chunk.map((l) => ({
          type: 'LEAD_CREATED',
          description: 'Lead imported from CSV',
          metadata: { source: l.source, import: true },
          performedById: actor.userId,
          relatedLeadId: l.id!,
          createdAt: now,
        })),
      });
    }
  });
  result.created = toCreate.length;

  emitAll(
    toCreate.map((l) => ({
      type: 'lead.created' as const,
      leadId: l.id!,
      actorId: actor.userId,
      depth: actor.depth,
      imported: true,
    })),
  );
  return result;
}

/** Neutralises spreadsheet formulas (CSV injection) while keeping phone numbers like +91… intact. */
function safeCell(value: string): string {
  if (/^[=@\t\r]/.test(value) || (/^[+-]/.test(value) && !/^[+-][\d\s()-]*$/.test(value)))
    return `'${value}`;
  return value;
}

export async function exportLeads(
  actor: Actor,
  q: LeadFilters & Pick<LeadListQuery, 'sortBy' | 'sortOrder'>,
): Promise<string> {
  const leads = await prisma.lead.findMany({
    where: await buildLeadWhere(actor, q),
    include: { assignedTo: { select: { firstName: true, lastName: true } } },
    orderBy: leadOrderBy(q),
    take: MAX_EXPORT_ROWS,
  });
  const header = [
    'First name',
    'Last name',
    'Email',
    'Phone',
    'Company',
    'Source',
    'Status',
    'Tags',
    'AI score',
    'Assigned to',
    'Lost reason',
    'Created at',
  ];
  const rows = leads.map((l) =>
    [
      l.firstName,
      l.lastName ?? '',
      l.email ?? '',
      l.phone ?? '',
      l.company ?? '',
      LEAD_SOURCE_LABEL[l.source as keyof typeof LEAD_SOURCE_LABEL] ?? l.source,
      LEAD_STATUS_LABEL[l.status as keyof typeof LEAD_STATUS_LABEL] ?? l.status,
      asTags(l.tags).join('; '),
      l.aiScore === null ? '' : String(l.aiScore),
      l.assignedTo ? fullName(l.assignedTo) : '',
      l.lostReason ?? '',
      l.createdAt.toISOString(),
    ].map(safeCell),
  );
  // BOM so Excel opens UTF-8 (e.g. names in Devanagari) correctly.
  return '\uFEFF' + stringify([header, ...rows]);
}
