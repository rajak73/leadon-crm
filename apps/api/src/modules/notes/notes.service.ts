import { ErrorCode, type CreateNoteInput, type Note } from '@leados/shared';
import { recordActivity } from '../../lib/activity.js';
import { type Actor, isAdmin } from '../../lib/auth.js';
import { emit } from '../../lib/events.js';
import { AppError, fieldError, forbidden, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { noteInclude, toNote } from '../../lib/serializers.js';

export interface NoteTarget {
  leadId?: string;
  contactId?: string;
  dealId?: string;
}

export async function listNotes(target: NoteTarget): Promise<Note[]> {
  const given = [target.leadId, target.contactId, target.dealId].filter(Boolean);
  if (given.length !== 1) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Choose exactly one lead, contact or deal to show notes for.',
    );
  }
  const rows = await prisma.note.findMany({
    where: {
      deletedAt: null,
      ...(target.leadId ? { relatedLeadId: target.leadId } : {}),
      ...(target.contactId ? { relatedContactId: target.contactId } : {}),
      ...(target.dealId ? { relatedDealId: target.dealId } : {}),
    },
    include: noteInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toNote);
}

const excerpt = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}…` : s);

export async function createNote(actor: Actor, input: CreateNoteInput): Promise<Note> {
  const note = await prisma.$transaction(async (tx) => {
    // The related record must exist; activities for deal notes also show on the linked lead/contact.
    let leadId = input.relatedLeadId ?? null;
    let contactId = input.relatedContactId ?? null;
    if (leadId && !(await tx.lead.count({ where: { id: leadId, deletedAt: null } })))
      throw fieldError('relatedLeadId', 'Choose an existing lead');
    if (contactId && !(await tx.contact.count({ where: { id: contactId, deletedAt: null } }))) {
      throw fieldError('relatedContactId', 'Choose an existing contact');
    }
    if (input.relatedDealId) {
      const deal = await tx.deal.findFirst({
        where: { id: input.relatedDealId, deletedAt: null },
        select: { leadId: true, contactId: true },
      });
      if (!deal) throw fieldError('relatedDealId', 'Choose an existing deal');
      leadId = deal.leadId;
      contactId = deal.contactId;
    }
    const created = await tx.note.create({
      data: {
        content: input.content,
        createdById: actor.userId!,
        relatedLeadId: input.relatedLeadId ?? null,
        relatedContactId: input.relatedContactId ?? null,
        relatedDealId: input.relatedDealId ?? null,
      },
      include: noteInclude,
    });
    await recordActivity(tx, {
      type: 'NOTE_ADDED',
      description: `Note added: “${excerpt(input.content)}”`,
      metadata: { noteId: created.id },
      performedById: actor.userId,
      leadId,
      contactId,
      dealId: input.relatedDealId ?? null,
    });
    return created;
  });
  emit({
    type: 'note.created',
    noteId: note.id,
    leadId: note.relatedLeadId,
    actorId: actor.userId,
    depth: actor.depth,
  });
  return toNote(note);
}

async function findEditable(actor: Actor, id: string) {
  const note = await prisma.note.findFirst({ where: { id, deletedAt: null } });
  if (!note) throw notFound('note');
  if (note.createdById !== actor.userId && !isAdmin(actor))
    throw forbidden('Only the author or an admin can change this note.');
  return note;
}

export async function updateNote(actor: Actor, id: string, content: string): Promise<Note> {
  await findEditable(actor, id);
  return toNote(
    await prisma.note.update({ where: { id }, data: { content }, include: noteInclude }),
  );
}

export async function deleteNote(actor: Actor, id: string): Promise<void> {
  await findEditable(actor, id);
  await prisma.note.delete({ where: { id } });
}
