import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth, requireOrg, type AuthedRequest } from '../middleware/auth.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { hasRealMetaCreds, config, isInstagramOAuthConfigured } from '../config.js';
import { encryptSecret } from '../lib/crypto.js';
import {
  getInstagramConnectUrl,
  connectInstagramAccount,
  unsubscribePageWebhook,
  subscribePageWebhook,
  getSubscribedFields,
  type EligiblePage,
} from '../services/meta/oauth.js';
import { decryptSecret } from '../lib/crypto.js';
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
        instagramOAuthConfigured: isInstagramOAuthConfigured(),
        whatsapp: hasRealMetaCreds('WHATSAPP'),
        facebook: hasRealMetaCreds('FACEBOOK'),
        webhookVerifyTokenSet: Boolean(config.meta.webhookVerifyToken),
        appSecretSet: Boolean(config.meta.appSecret),
      },
    });
  })
);

/** GET /api/v1/integrations/instagram/connect — begin Meta OAuth (owner/admin). */
router.get(
  '/instagram/connect',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!isInstagramOAuthConfigured()) {
      throw BadRequest('Instagram OAuth is not configured (missing app id/secret/redirect URI)');
    }
    const state = jwt.sign(
      { organizationId: req.org!.organizationId, userId: req.auth!.userId, typ: 'ig-connect' },
      config.jwtSecret,
      { expiresIn: '10m' }
    );
    const authUrl = getInstagramConnectUrl(state);
    res.json({ authUrl });
  })
);

const selectSchema = z.object({
  pickToken: z.string().min(1),
  pageId: z.string().min(1),
});

/**
 * POST /api/v1/integrations/instagram/select — complete connection when the
 * OAuth callback found multiple Instagram-linked Pages (owner/admin).
 */
router.post(
  '/instagram/select',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { pickToken, pageId } = selectSchema.parse(req.body);
    let decoded: {
      organizationId: string;
      pages: EligiblePage[];
      longLivedToken: string;
      expiresInSeconds?: number;
      typ: string;
    };
    try {
      decoded = jwt.verify(pickToken, config.jwtSecret) as typeof decoded;
      if (decoded.typ !== 'ig-pick') throw new Error('bad token');
    } catch {
      throw BadRequest('Invalid or expired selection token');
    }
    if (decoded.organizationId !== req.org!.organizationId) {
      throw BadRequest('Selection token does not match the current organization');
    }
    const page = decoded.pages.find((p) => p.pageId === pageId);
    if (!page) throw BadRequest('Selected page was not in the original list');

    await connectInstagramAccount(decoded.organizationId, page, decoded.longLivedToken, decoded.expiresInSeconds);
    res.json({ ok: true });
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
    const encryptedToken = data.accessToken ? encryptSecret(data.accessToken) : undefined;

    const account = existing
      ? await prisma.integrationAccount.update({
          where: { id: existing.id },
          data: {
            displayName: data.displayName ?? existing.displayName,
            accessToken: encryptedToken ?? existing.accessToken,
            isConnected: true,
          },
        })
      : await prisma.integrationAccount.create({
          data: {
            organizationId: orgId,
            provider: data.provider,
            externalId: data.externalId,
            displayName: data.displayName ?? null,
            accessToken: encryptedToken ?? null,
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

const correctIdSchema = z.object({ externalId: z.string().min(1) });

/**
 * PATCH /api/v1/integrations/:id/external-id — manual correction for the id
 * used to match inbound webhook events to this account. Needed because
 * Instagram's Login-flow /me id does not always match the id Meta sends in
 * webhook entry.id for the same account (confirmed empirically) — until
 * that's resolved generically, an org can correct it directly here using
 * the id seen in a real delivered webhook event.
 */
router.patch(
  '/:id/external-id',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { externalId } = correctIdSchema.parse(req.body);
    const account = await prisma.integrationAccount.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!account) throw NotFound('Integration not found');
    const updated = await prisma.integrationAccount.update({
      where: { id: account.id },
      data: { externalId },
    });
    res.json({ id: updated.id, externalId: updated.externalId });
  })
);

/**
 * GET /api/v1/integrations/:id/webhook-status — which fields (messages,
 * comments) this account is actually subscribed to right now, straight from
 * Meta. Accounts connected before `comments` support was added may only have
 * `messages` — this is how to tell without guessing.
 */
router.get(
  '/:id/webhook-status',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const account = await prisma.integrationAccount.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!account) throw NotFound('Integration not found');
    if (account.provider !== 'INSTAGRAM' || !account.pageId || !account.accessToken) {
      throw BadRequest('Not a connected Instagram account');
    }
    const token = decryptSecret(account.accessToken);
    if (!token) throw BadRequest('No access token stored for this account');
    const subscribedFields = await getSubscribedFields(account.pageId, token);
    res.json({ subscribedFields, hasComments: subscribedFields.includes('comments'), hasMessages: subscribedFields.includes('messages') });
  })
);

/**
 * POST /api/v1/integrations/:id/resubscribe — re-run the webhook field
 * subscription (messages + comments) for an already-connected account.
 * Needed for accounts connected before comment support existed, or if Meta
 * ever drops the subscription silently.
 */
router.post(
  '/:id/resubscribe',
  requireOrg(OrgRole.OWNER, OrgRole.ADMIN),
  asyncHandler(async (req: AuthedRequest, res) => {
    const account = await prisma.integrationAccount.findFirst({
      where: { id: req.params.id, organizationId: req.org!.organizationId },
    });
    if (!account) throw NotFound('Integration not found');
    if (account.provider !== 'INSTAGRAM' || !account.pageId || !account.accessToken) {
      throw BadRequest('Not a connected Instagram account');
    }
    const token = decryptSecret(account.accessToken);
    if (!token) throw BadRequest('No access token stored for this account');
    await subscribePageWebhook(account.pageId, token);
    await prisma.integrationAccount.update({ where: { id: account.id }, data: { webhookSubscribed: true } });
    const subscribedFields = await getSubscribedFields(account.pageId, token);
    res.json({ ok: true, subscribedFields });
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
    if (account.provider === 'INSTAGRAM' && account.pageId && account.accessToken) {
      const pageToken = decryptSecret(account.accessToken);
      if (pageToken) await unsubscribePageWebhook(account.pageId, pageToken);
    }
    await prisma.integrationAccount.update({
      where: { id: account.id },
      data: { isConnected: false, webhookSubscribed: false },
    });
    res.json({ ok: true });
  })
);

export default router;
