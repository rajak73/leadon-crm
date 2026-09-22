import type { Prisma } from '@prisma/client';
import type {
  Contact,
  ContactDetail,
  ContactListQuery,
  CreateContactInput,
  PageMeta,
  UpdateContactInput,
} from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import type { Actor } from '../../lib/auth.js';
import { notFound } from '../../lib/errors.js';
import { pageMeta } from '../../lib/http.js';
import { fullName } from '../../lib/labels.js';
import { lockRows, prisma } from '../../lib/prisma.js';
import {
  asTags,
  contactInclude,
  dealSummaryInclude,
  toContact,
  toDealSummary,
} from '../../lib/serializers.js';
import { assigneeFilter, tagFilter, textSearch } from '../leads/index.js';
import { assertAssignable } from '../users/index.js';

export async function listContacts(
  actor: Actor,
  q: ContactListQuery,
): Promise<{ data: Contact[]; meta: PageMeta }> {
  const and: Prisma.ContactWhereInput[] = textSearch(
    ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
    q.search,
  );
  if (q.tag) and.push(tagFilter(q.tag));
  const where: Prisma.ContactWhereInput = {
    deletedAt: null,
    ...assigneeFilter(q.assignedToId, actor),
    ...(and.length ? { AND: and } : {}),
  };
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = [
    q.sortBy === 'lastActivityAt' || q.sortBy === 'company'
      ? { [q.sortBy]: { sort: q.sortOrder, nulls: 'last' } }
      : { [q.sortBy]: q.sortOrder },
    { id: 'asc' },
  ];
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: contactInclude,
      orderBy,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.contact.count({ where }),
  ]);
  return { data: rows.map(toContact), meta: pageMeta(q.page, q.limit, total) };
}

async function getContact(id: string): Promise<Contact> {
  const row = await prisma.contact.findFirst({
    where: { id, deletedAt: null },
    include: contactInclude,
  });
  if (!row) throw notFound('contact');
  return toContact(row);
}

export async function getContactDetail(id: string): Promise<ContactDetail> {
  const contact = await getContact(id);
  const [deals, lead] = await Promise.all([
    prisma.deal.findMany({
      where: { contactId: id, deletedAt: null },
      include: dealSummaryInclude,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.findFirst({
      where: { convertedToContactId: id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    }),
  ]);
  return { ...contact, deals: deals.map(toDealSummary), convertedFromLeadId: lead?.id ?? null };
}

export async function createContact(actor: Actor, input: CreateContactInput): Promise<Contact> {
  const id = await prisma.$transaction(async (tx) => {
    await assertAssignable(tx, input.assignedToId);
    const c = await tx.contact.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        jobTitle: input.jobTitle ?? null,
        tags: input.tags,
        assignedToId: input.assignedToId ?? null,
        createdById: actor.userId!,
      },
    });
    await recordActivity(tx, {
      type: 'CONTACT_CREATED',
      description: 'Contact created',
      performedById: actor.userId,
      contactId: c.id,
    });
    return c.id;
  });
  return getContact(id);
}

const FIELD_LABEL: Record<string, string> = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  jobTitle: 'job title',
  tags: 'tags',
  assignedToId: 'owner',
};

export async function updateContact(
  actor: Actor,
  id: string,
  input: UpdateContactInput,
): Promise<Contact> {
  await prisma.$transaction(async (tx) => {
    await lockRows(tx, 'Contact', [id]);
    const existing = await tx.contact.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw notFound('contact');
    const data: Prisma.ContactUncheckedUpdateInput = {};
    const changed: string[] = [];
    for (const key of [
      'firstName',
      'lastName',
      'email',
      'phone',
      'company',
      'jobTitle',
      'assignedToId',
    ] as const) {
      if (input[key] !== undefined && input[key] !== existing[key]) {
        (data as Record<string, unknown>)[key] = input[key] ?? null;
        changed.push(FIELD_LABEL[key]!);
      }
    }
    if (input.tags && JSON.stringify(input.tags) !== JSON.stringify(asTags(existing.tags))) {
      data.tags = input.tags;
      changed.push('tags');
    }
    if (data.assignedToId) await assertAssignable(tx, data.assignedToId as string);
    if (!changed.length) return;
    await tx.contact.update({ where: { id }, data });
    let description = `Updated ${changed.join(', ')}`;
    if (data.assignedToId !== undefined) {
      const owner = data.assignedToId
        ? await tx.user.findUnique({
            where: { id: data.assignedToId as string },
            select: { firstName: true, lastName: true },
          })
        : null;
      if (changed.length === 1)
        description = owner ? `Assigned to ${fullName(owner)}` : 'Unassigned';
    }
    await recordActivity(tx, {
      type: 'CONTACT_UPDATED',
      description,
      metadata: { fields: changed },
      performedById: actor.userId,
      contactId: id,
    });
  });
  return getContact(id);
}

export async function deleteContact(id: string): Promise<void> {
  const r = await prisma.contact.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (r.count === 0) throw notFound('contact');
}
