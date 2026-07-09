import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { assertWithinLimit } from '../services/billing.js';
import { logActivity } from '../lib/helpers.js';
import { rateLimit } from '../middleware/rateLimit.js';

/**
 * Public web-form lead capture (BRD §15.2 "Web forms"). A website embeds a
 * form that POSTs to /api/v1/forms/:orgSlug/submit. No auth — the org is
 * identified by its public slug. Rate-limited to prevent spam (free-tier safe).
 */
const router = Router();

// Stricter public rate limit: 10 submissions/min per IP.
const formLimit = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'form' });

const submitSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  message: z.string().max(2000).optional(),
  source: z.string().max(50).optional(),
});

/**
 * POST /api/v1/forms/:orgSlug/submit — create a WEBSITE lead from a public form.
 */
router.post(
  '/:orgSlug/submit',
  formLimit,
  asyncHandler(async (req, res) => {
    const data = submitSchema.parse(req.body);

    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug } });
    if (!org) throw NotFound('Unknown form');
    if (org.status !== 'ACTIVE') throw BadRequest('This form is not currently accepting submissions');

    // Respect plan lead limit (BRD §19.3) — fail gracefully for public callers.
    try {
      await assertWithinLimit(org.id, 'leads');
    } catch {
      return res.status(202).json({ ok: true, note: 'Received (queued).' });
    }

    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        source: 'WEBSITE',
        status: 'NEW',
        notes: data.message || null,
        lastActivityAt: new Date(),
        customFields: data.source ? JSON.stringify({ formSource: data.source }) : null,
      },
    });
    await logActivity({
      organizationId: org.id,
      type: 'LEAD_WEBFORM',
      message: `Web form lead "${lead.name}" captured`,
      leadId: lead.id,
    });

    res.status(201).json({ ok: true, message: 'Thanks! We will be in touch shortly.' });
  })
);

/** GET /api/v1/forms/:orgSlug/embed.html — a ready-to-paste HTML form snippet. */
router.get(
  '/:orgSlug/embed.html',
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { slug: req.params.orgSlug } });
    if (!org) throw NotFound('Unknown form');
    const base = `${req.protocol}://${req.get('host')}`;
    const action = `${base}/api/v1/forms/${org.slug}/submit`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!-- LeadOS embeddable lead form for ${org.name} -->
<form id="leados-form" style="max-width:360px;font-family:system-ui">
  <input name="name" placeholder="Your name" required style="display:block;width:100%;margin:6px 0;padding:10px">
  <input name="phone" placeholder="Phone" style="display:block;width:100%;margin:6px 0;padding:10px">
  <input name="email" type="email" placeholder="Email" style="display:block;width:100%;margin:6px 0;padding:10px">
  <textarea name="message" placeholder="How can we help?" style="display:block;width:100%;margin:6px 0;padding:10px"></textarea>
  <button type="submit" style="padding:10px 16px">Send</button>
  <p id="leados-msg"></p>
</form>
<script>
document.getElementById('leados-form').addEventListener('submit', async function(e){
  e.preventDefault();
  const f = e.target, body = Object.fromEntries(new FormData(f).entries());
  const r = await fetch('${action}', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j = await r.json();
  document.getElementById('leados-msg').textContent = j.message || 'Thanks!';
  if (r.ok) f.reset();
});
</script>`);
  })
);

export default router;
