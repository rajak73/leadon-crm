import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireSuperAdmin, type AuthedRequest } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { cached, cacheDelete } from '../lib/cache.js';

/**
 * Super Admin panel routes (BRD §10.4, §9.1, §22.2).
 *
 * These are the ONLY sanctioned tenant-scope bypass (BRD §20): a Super Admin
 * may read aggregate, non-secret summaries across ALL organizations. They may
 * NOT impersonate an org, read secret tokens/credentials, or send messages as
 * an org (BRD §10.4 "Super Admin cannot currently", §20 business rules).
 */
const router = Router();
router.use(requireAuth, requireSuperAdmin);

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

/**
 * GET /api/v1/admin/organizations
 * Paginated list of all organizations with safe summary counts (BRD §10.4).
 * Displayed counts: members, leads, customers/contacts, deals, conversations,
 * messages, tasks.
 */
router.get(
  '/organizations',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, q, status } = listQuery.parse(req.query);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { slug: { contains: q } },
      ];
    }

    const [total, orgs] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              members: true,
              leads: true,
              contacts: true,
              deals: true,
              conversations: true,
              messages: true,
              tasks: true,
            },
          },
        },
      }),
    ]);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        status: o.status,
        createdAt: o.createdAt,
        counts: {
          members: o._count.members,
          leads: o._count.leads,
          contacts: o._count.contacts, // customers/contacts
          deals: o._count.deals,
          conversations: o._count.conversations,
          messages: o._count.messages,
          tasks: o._count.tasks,
        },
      })),
    });
  })
);

/**
 * GET /api/v1/admin/metrics
 * Platform-wide high-level metrics (BRD §9.1 "View high-level metrics", §24).
 */
router.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    // Cache heavy platform-wide aggregates for 30s (BRD §19.2). Super-Admin
    // dashboards refresh often; this avoids repeated full-table counts.
    const data = await cached('admin:metrics', 30_000, async () => {
      const [orgs, activeOrgs, users, leads, deals, tasks, messages, conversations] =
        await Promise.all([
          prisma.organization.count(),
          prisma.organization.count({ where: { status: 'ACTIVE' } }),
          prisma.user.count(),
          prisma.lead.count(),
          prisma.deal.count(),
          prisma.task.count(),
          prisma.message.count(),
          prisma.conversation.count(),
        ]);
      return {
        totalOrganizations: orgs,
        activeOrganizations: activeOrgs,
        suspendedOrganizations: orgs - activeOrgs,
        totalUsers: users,
        totalLeads: leads,
        totalDeals: deals,
        totalTasks: tasks,
        totalMessages: messages,
        totalConversations: conversations,
      };
    });
    res.json(data);
  })
);

/**
 * GET /api/v1/admin/organizations/:id
 * Single org detail with counts (safe fields only — no secrets, BRD §10.4).
 */
router.get(
  '/organizations/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        _count: {
          select: {
            members: true,
            leads: true,
            contacts: true,
            deals: true,
            conversations: true,
            messages: true,
            tasks: true,
          },
        },
        subscription: true,
      },
    });
    if (!org) throw NotFound('Organization not found');

    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      createdAt: org.createdAt,
      plan: org.subscription?.plan ?? null,
      counts: {
        members: org._count.members,
        leads: org._count.leads,
        contacts: org._count.contacts,
        deals: org._count.deals,
        conversations: org._count.conversations,
        messages: org._count.messages,
        tasks: org._count.tasks,
      },
    });
  })
);

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

/**
 * PATCH /api/v1/admin/organizations/:id/status
 * Suspend / reactivate an organization (BRD §9.1 "Suspend/reactivate ... if
 * supported"). This changes only the org status flag; it never grants the
 * Super Admin access to org data or credentials.
 */
router.patch(
  '/organizations/:id/status',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = statusSchema.parse(req.body);
    const existing = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!existing) throw NotFound('Organization not found');
    if (existing.status === status) throw BadRequest(`Organization is already ${status}`);

    const updated = await prisma.organization.update({
      where: { id: req.params.id },
      data: { status },
    });
    cacheDelete('admin:metrics'); // keep dashboard counts fresh
    res.json({ id: updated.id, name: updated.name, slug: updated.slug, status: updated.status });
  })
);

/**
 * GET /api/v1/admin/organizations/:id/members
 * Members of an org (safe fields only — name/email/role, no secrets).
 */
router.get(
  '/organizations/:id/members',
  asyncHandler(async (req: AuthedRequest, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw NotFound('Organization not found');
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isSuperAdmin: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members.map((m) => ({
      userId: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      email: m.user.email,
      role: m.role,
      isSuperAdmin: m.user.isSuperAdmin,
      joinedAt: m.createdAt,
    })));
  })
);

const usersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().optional(),
});

/**
 * GET /api/v1/admin/users
 * Platform-wide user directory with membership counts (BRD §9.1 SaaS ops).
 * Never returns password hashes or secrets.
 */
router.get(
  '/users',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { page, pageSize, q } = usersQuery.parse(req.query);
    const where: Record<string, unknown> = {};
    if (q) where.OR = [{ email: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }];

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, firstName: true, lastName: true, email: true, isSuperAdmin: true,
          twoFactorEnabled: true, createdAt: true,
          _count: { select: { memberships: true } },
        },
      }),
    ]);

    res.json({
      page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        isSuperAdmin: u.isSuperAdmin,
        twoFactorEnabled: u.twoFactorEnabled,
        organizations: u._count.memberships,
        createdAt: u.createdAt,
      })),
    });
  })
);

const superAdminSchema = z.object({ isSuperAdmin: z.boolean() });

/**
 * PATCH /api/v1/admin/users/:id/super-admin
 * Grant or revoke platform Super Admin (app-owner power). Guards against a
 * Super Admin revoking their own access (would lock themselves out).
 */
router.patch(
  '/users/:id/super-admin',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { isSuperAdmin } = superAdminSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw NotFound('User not found');
    if (target.id === req.auth!.userId && !isSuperAdmin) {
      throw BadRequest('You cannot revoke your own Super Admin access.');
    }
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isSuperAdmin },
      select: { id: true, email: true, isSuperAdmin: true },
    });
    res.json(updated);
  })
);

/**
 * GET /api/v1/admin/activity
 * Recent platform-wide audit activity across all orgs (app monitoring).
 * Aggregate, non-secret metadata only (BRD §20).
 */
router.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    const [entries, orgs] = await Promise.all([
      prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.organization.findMany({ select: { id: true, name: true } }),
    ]);
    const orgName = Object.fromEntries(orgs.map((o) => [o.id, o.name]));
    res.json(entries.map((e) => ({
      id: e.id,
      action: e.action,
      actorEmail: e.actorEmail,
      organization: orgName[e.organizationId] ?? e.organizationId,
      entityType: e.entityType,
      createdAt: e.createdAt,
    })));
  })
);

/**
 * GET /api/v1/admin/organizations/:id/activity
 * Recent audit activity for one org (Super Admin drill-down). Non-secret only.
 */
router.get(
  '/organizations/:id/activity',
  asyncHandler(async (req: AuthedRequest, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw NotFound('Organization not found');
    const entries = await prisma.auditLog.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json(entries.map((e) => ({
      id: e.id, action: e.action, actorEmail: e.actorEmail, entityType: e.entityType, createdAt: e.createdAt,
    })));
  })
);

/**
 * GET /api/v1/admin/search?q=
 * Platform-wide search across organizations and users (Super Admin). Returns
 * safe, non-secret fields only. Powers the admin quick-find.
 */
router.get(
  '/search',
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) return res.json({ organizations: [], users: [] });
    const take = 8;
    const [organizations, users] = await Promise.all([
      prisma.organization.findMany({
        where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] },
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, slug: true, status: true },
      }),
      prisma.user.findMany({
        where: { OR: [{ email: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] },
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, isSuperAdmin: true },
      }),
    ]);
    res.json({
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug, status: o.status })),
      users: users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, isSuperAdmin: u.isSuperAdmin })),
    });
  })
);

export default router;
