import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';

/**
 * Global search across leads, contacts, and deals (org-scoped, BRD §20).
 * Powers the ⌘K command palette. Returns a small, capped result set per type.
 */
const router = Router();
router.use(requireAuth, requireOrg());

const query = z.object({ q: z.string().trim().min(1).max(100) });

/** GET /api/v1/search?q=... */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return res.json({ leads: [], contacts: [], deals: [] });
    const q = parsed.data.q;
    const orgId = req.org!.organizationId;
    const take = 6;

    const [leads, contacts, deals] = await Promise.all([
      prisma.lead.findMany({
        where: { organizationId: orgId, OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] },
        take,
        orderBy: { lastActivityAt: 'desc' },
        select: { id: true, name: true, status: true, phone: true, email: true },
      }),
      prisma.contact.findMany({
        where: { organizationId: orgId, OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }, { company: { contains: q } }] },
        take,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, company: true },
      }),
      prisma.deal.findMany({
        where: { organizationId: orgId, title: { contains: q } },
        take,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, title: true, value: true, status: true },
      }),
    ]);

    res.json({
      leads: leads.map((l) => ({ id: l.id, label: l.name, sub: l.phone || l.email || l.status, link: `/app/leads` })),
      contacts: contacts.map((c) => ({ id: c.id, label: c.name, sub: c.company || 'Contact', link: `/app/contacts/${c.id}` })),
      deals: deals.map((d) => ({ id: d.id, label: d.title, sub: `${d.status} · ${d.value}`, link: `/app/pipeline` })),
    });
  })
);

export default router;
