import { beforeAll, describe, expect, it } from 'vitest';
import { sendTaskReminders } from '../src/modules/tasks/index.js';
import { api, createMember, flush, prisma, setupAdmin, testApp, type Session } from './helpers.js';

const app = testApp();
let admin: Session;
let member: Session;

const HOUR = 60 * 60 * 1000;

beforeAll(async () => {
  admin = await setupAdmin(app);
  member = await createMember(app, admin, 'Tara');
  // UTC keeps "today" predictable in tests.
  await api(app, admin).patch('/settings', { timezone: 'UTC', aiScoringAuto: false }).expect(200);
});

describe('tasks', () => {
  it('defaults the assignee to the creator and links related records', async () => {
    const lead = (await api(app, member).post('/leads', { firstName: 'Linked' }).expect(201)).body
      .data;
    const res = await api(app, member)
      .post('/tasks', {
        title: 'Call back',
        relatedLeadId: lead.id,
        dueDate: new Date(Date.now() + HOUR).toISOString(),
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      type: 'FOLLOW_UP',
      priority: 'MEDIUM',
      status: 'PENDING',
      isOverdue: false,
      assignedTo: { id: member.userId },
      relatedLead: { id: lead.id, name: 'Linked' },
    });
    const detail = await api(app, member).get(`/leads/${lead.id}`).expect(200);
    expect(detail.body.data.openTaskCount).toBe(1);
    await api(app, member)
      .post('/tasks', { title: 'X', relatedDealId: crypto.randomUUID() })
      .expect(422);
  });

  it('sets and clears completedAt and records completion on the timeline', async () => {
    const lead = (await api(app, admin).post('/leads', { firstName: 'Done' }).expect(201)).body
      .data;
    const task = (
      await api(app, admin)
        .post('/tasks', { title: 'Send quote', relatedLeadId: lead.id })
        .expect(201)
    ).body.data;
    const done = await api(app, admin)
      .patch(`/tasks/${task.id}`, { status: 'COMPLETED' })
      .expect(200);
    expect(done.body.data.completedAt).not.toBeNull();
    const reopened = await api(app, admin)
      .patch(`/tasks/${task.id}`, { status: 'PENDING' })
      .expect(200);
    expect(reopened.body.data.completedAt).toBeNull();
    const timeline = (await api(app, admin).get(`/activities?leadId=${lead.id}`).expect(200)).body
      .data;
    expect(timeline.map((a: { description: string }) => a.description)).toContain(
      'Task completed: Send quote',
    );
  });

  it('filters by due date', async () => {
    await prisma.task.deleteMany({});
    const now = Date.now();
    const startOfTomorrow = new Date(new Date().setUTCHours(24, 0, 0, 0)).getTime();
    const mk = (title: string, dueDate: Date | null, status = 'PENDING') =>
      prisma.task.create({
        data: { title, dueDate, status, createdById: admin.userId, assignedToId: admin.userId },
      });
    await mk('overdue', new Date(now - 2 * HOUR));
    await mk('overdue but done', new Date(now - 2 * HOUR), 'COMPLETED');
    await mk('later today', new Date(Math.min(now + HOUR, startOfTomorrow - 1000)));
    await mk('in three days', new Date(startOfTomorrow + 2 * 24 * HOUR));
    await mk('next month', new Date(now + 30 * 24 * HOUR));
    await mk('no date', null);

    const titles = async (q: string) =>
      (await api(app, admin).get(`/tasks?${q}`).expect(200)).body.data
        .map((t: { title: string }) => t.title)
        .sort();
    expect(await titles('due=overdue')).toEqual(['overdue']);
    expect(await titles('due=today')).toEqual(expect.arrayContaining(['later today']));
    expect(await titles('due=today')).not.toContain('in three days');
    expect(await titles('due=week')).toEqual(
      expect.arrayContaining(['later today', 'in three days']),
    );
    expect(await titles('due=week')).not.toContain('next month');
    expect(await titles('due=none')).toEqual(['no date']);
    expect(await titles('status=COMPLETED')).toEqual(['overdue but done']);

    const list = (await api(app, admin).get('/tasks?due=overdue').expect(200)).body.data;
    expect(list[0].isOverdue).toBe(true);
    const sorted = (await api(app, admin).get('/tasks?sortBy=dueDate&sortOrder=asc').expect(200))
      .body.data;
    expect(sorted.at(-1).title).toBe('no date'); // nulls last
  });

  it('sorts by priority', async () => {
    await prisma.task.deleteMany({});
    for (const priority of ['LOW', 'URGENT', 'MEDIUM', 'HIGH']) {
      await api(app, admin).post('/tasks', { title: priority, priority }).expect(201);
    }
    const res = await api(app, admin)
      .get('/tasks?sortBy=priority&sortOrder=asc&limit=3')
      .expect(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual([
      'URGENT',
      'HIGH',
      'MEDIUM',
    ]);
    expect(res.body.meta.total).toBe(4);
  });

  it('notifies on assignment and sends one reminder per due task', async () => {
    await prisma.notification.deleteMany({});
    const soon = await api(app, admin)
      .post('/tasks', {
        title: 'Due soon',
        assignedToId: member.userId,
        dueDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      })
      .expect(201);
    await api(app, admin)
      .post('/tasks', {
        title: 'Much later',
        assignedToId: member.userId,
        dueDate: new Date(Date.now() + 5 * HOUR).toISOString(),
      })
      .expect(201);
    await flush();
    const assigned = await prisma.notification.findMany({
      where: { userId: member.userId, type: 'TASK_ASSIGNED' },
    });
    expect(assigned).toHaveLength(2);

    await sendTaskReminders();
    await sendTaskReminders(); // second run must not notify again
    const due = await prisma.notification.findMany({
      where: { userId: member.userId, type: 'TASK_DUE' },
    });
    expect(due.map((n) => n.entityId)).toEqual([soon.body.data.id]);
    expect(due[0]!.title).toBe('Due soon: Due soon');

    // Moving the due date re-arms the reminder.
    await api(app, admin)
      .patch(`/tasks/${soon.body.data.id}`, {
        dueDate: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(200);
    await sendTaskReminders();
    expect(
      await prisma.notification.count({ where: { userId: member.userId, type: 'TASK_DUE' } }),
    ).toBe(2);

    await api(app, member).post('/notifications/read-all').expect(200);
    expect(
      (await api(app, member).get('/notifications/unread-count').expect(200)).body.data.count,
    ).toBe(0);
  });
});

describe('notes', () => {
  it('requires exactly one parent record', async () => {
    await api(app, admin).get('/notes').expect(422);
    const lead = (await api(app, admin).post('/leads', { firstName: 'N' }).expect(201)).body.data;
    await api(app, admin)
      .post('/notes', {
        content: 'hi',
        relatedLeadId: lead.id,
        relatedContactId: crypto.randomUUID(),
      })
      .expect(422);
    await api(app, admin)
      .post('/notes', { content: 'hi', relatedLeadId: crypto.randomUUID() })
      .expect(422);
  });

  it('only the author or an admin can edit or delete a note', async () => {
    const lead = (await api(app, admin).post('/leads', { firstName: 'Noted' }).expect(201)).body
      .data;
    const adminNote = (
      await api(app, admin)
        .post('/notes', { content: 'Admin note', relatedLeadId: lead.id })
        .expect(201)
    ).body.data;
    const memberNote = (
      await api(app, member)
        .post('/notes', { content: 'Member note', relatedLeadId: lead.id })
        .expect(201)
    ).body.data;
    expect(memberNote.createdBy.id).toBe(member.userId);

    await api(app, member).patch(`/notes/${adminNote.id}`, { content: 'hijack' }).expect(403);
    await api(app, member).delete(`/notes/${adminNote.id}`).expect(403);
    await api(app, member)
      .patch(`/notes/${memberNote.id}`, { content: 'Edited by me' })
      .expect(200);
    await api(app, admin)
      .patch(`/notes/${memberNote.id}`, { content: 'Edited by admin' })
      .expect(200);

    const list = (await api(app, member).get(`/notes?leadId=${lead.id}`).expect(200)).body.data;
    expect(list.map((n: { content: string }) => n.content)).toEqual([
      'Edited by admin',
      'Admin note',
    ]);

    await api(app, admin).delete(`/notes/${memberNote.id}`).expect(200);
    expect(await prisma.note.count({ where: { id: memberNote.id } })).toBe(0);

    const timeline = (
      await api(app, admin).get(`/activities?leadId=${lead.id}&limit=10`).expect(200)
    ).body.data;
    expect(timeline[0].description).toBe('Note added: “Member note”');
    expect(timeline[0].performedBy.id).toBe(member.userId);
    const older = (
      await api(app, admin)
        .get(`/activities?leadId=${lead.id}&before=${timeline[0].createdAt}`)
        .expect(200)
    ).body.data;
    expect(older.every((a: { createdAt: string }) => a.createdAt < timeline[0].createdAt)).toBe(
      true,
    );
  });
});
