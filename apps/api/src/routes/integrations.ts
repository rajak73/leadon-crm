import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { NotFound } from '../lib/errors.js';
import { hasRealMetaCreds, config } from '../config.js';
import { OrgRole } from '@leados/shared';

/**
 * Integration accounts (BRD §16). Lets an org connect Instagram/WhatsApp/
 * Facebook by registering the business account id (used to map inbound Meta
 * webhooks to this org) and a page access token (used for real sends).
 *
 * Secrets are never returned to the client (BRD §10.4, §19.1) — we expose only
 * whether a token is present.
 */
const router = Router();
router.use(requireAuth, requireOrg());

/** GET /api/v1/integrations — list connected accounts (no secrets). */
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const accounts = await prisma.integrationAccount.findMany({
      where: { organizationId: req.org!.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        provider: a.provider,
        externalId: a.externalId,
        displayName: a.displayName,
        isConnected: a.isConnected,
        hasAccessToken: Boolean(a.accessToken), // never expose the token itself
        createdAt: a.createdAt,
      })),
      // Platform-level Meta config presence (app secret / verify token), safe booleans only.
      platform: {
        instagram: hasRealMetaCreds('INSTAGRAM'),
        whatsapp: hasRealMetaCreds('WHATSAPP'),
        facebook: hasRealMetaCreds('FACEBOOK'),
        webhookVerifyTokenSet: Boolean(config.meta.webhookVerifyToken),
        appSecretSet: Boolean(config.meta.appSecret),
      },
    });
  })
);

const connectSchema = z.object({
  provider: z.enum(['INSTAGRAM', 'WHATSAPP', 'FACEBOOK']),
  externalId: z.string().min(1), // phone-number id / page id / ig account id
  displayName: z.string().optional(),
  accessToken: z.string().optional(), // page access token for real sends
});

/** POST /api/v1/integrations/connect — connect / update an account (owner/admin). */
router.post(
  '/connect',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = connectSchema.parse(req.body);
    const orgId = req.org!.organizationId;

    const existing = await prisma.integrationAccount.findFirst({
      where: { organizationId: orgId, provider: data.provider, externalId: data.externalId },
    });

    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            displayName: data.displayName ?? existing.displayName,
            accessToken: data.accessToken ?? existing.accessToken,
            isConnected: true,
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: orgId,
            provider: data.provider,
            externalId: data.externalId,
            displayName: data.displayName ?? null,
            accessToken: data.accessToken ?? null,
            isConnected: true,
          },
        });

    res.status(201).json({
      id: account.id,
      provider: account.provider,
      externalId: account.externalId,
      displayName: account.displayName,
      isConnected: account.isConnected,
      hasAccessToken: Boolean(account.accessToken),
    });
  })
);

/** POST /api/v1/integrations/:id/disconnect */
router.post(
  '/:id/disconnect',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const account = await prisma.integrationAccount.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!account) throw NotFound('Integration not found');
    await prisma.integrationAccount.update({ where: { id: account.id }, data: { isConnected: false } });
    res.json({ ok: true });
  })
);

export default router;
