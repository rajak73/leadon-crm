import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { Router, type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ErrorCode } from '@leados/shared';
import { env, isProduction } from './config/env.js';
import { authenticate } from './lib/auth.js';
import { errorHandler, notFoundHandler } from './lib/error-handler.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { registerAiSubscribers } from './modules/ai/index.js';
import { activitiesRouter } from './modules/activities/index.js';
import { analyticsRouter } from './modules/analytics/index.js';
import { authRouter, meRouter } from './modules/auth/index.js';
import { contactsRouter } from './modules/contacts/index.js';
import { dealsRouter } from './modules/deals/index.js';
import {
  autoReplyRouter,
  instagramRouter,
  instagramWebhookRouter,
} from './modules/instagram/index.js';
import { leadsRouter } from './modules/leads/index.js';
import { notesRouter } from './modules/notes/index.js';
import {
  notificationsRouter,
  registerNotificationSubscribers,
} from './modules/notifications/index.js';
import { pipelinesRouter } from './modules/pipelines/index.js';
import { searchRouter } from './modules/search/index.js';
import { settingsRouter } from './modules/settings/index.js';
import { tasksRouter } from './modules/tasks/index.js';
import { usersRouter } from './modules/users/index.js';
import { registerWorkflowEngine, workflowsRouter } from './modules/workflows/index.js';

export interface AppOptions {
  /** Max login/setup attempts per IP per minute. */
  authRateLimit?: number;
  /** Max API requests per IP per minute. */
  globalRateLimit?: number;
}

const rateLimited = (message: string) => ({
  success: false,
  error: { code: ErrorCode.RATE_LIMITED, message },
});

/** Background subscribers (workflows, AI auto-scoring, notifications). Registration is idempotent. */
export function registerSubscribers(): void {
  registerNotificationSubscribers();
  registerAiSubscribers();
  registerWorkflowEngine();
}

export function createApp(options: AppOptions = {}): Express {
  registerSubscribers();
  const app = express();
  app.disable('x-powered-by');
  // true = one proxy hop (Render's load balancer); a number = that many hops.
  app.set('trust proxy', env.TRUST_PROXY === true ? 1 : env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Radix/Recharts set inline styles
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      strictTransportSecurity: isProduction,
    }),
  );
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  // Meta webhooks: public, raw body (signature is computed over the exact bytes), and not
  // behind the per-IP rate limit (Meta delivers bursts from a few addresses).
  app.use('/api/webhooks/instagram', instagramWebhookRouter);

  const api = Router();
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: options.globalRateLimit ?? 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: rateLimited('You are sending requests too quickly. Please wait a moment.'),
    }),
  );
  api.use(express.json({ limit: '1mb' }));
  api.use(cookieParser());

  api.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', db: 'error' });
    }
  });

  const credentialLimiter = rateLimit({
    windowMs: 60_000,
    limit: options.authRateLimit ?? 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: rateLimited('Too many attempts. Please wait a minute and try again.'),
  });
  api.use('/auth', authRouter(credentialLimiter));
  api.use('/me', meRouter);

  // Everything below requires a signed-in user.
  const secured = Router();
  secured.use(authenticate);
  secured.use('/users', usersRouter);
  secured.use('/settings', settingsRouter);
  secured.use('/leads', leadsRouter);
  secured.use('/contacts', contactsRouter);
  secured.use('/pipelines', pipelinesRouter);
  secured.use('/deals', dealsRouter);
  secured.use('/tasks', tasksRouter);
  secured.use('/notes', notesRouter);
  secured.use('/activities', activitiesRouter);
  secured.use('/notifications', notificationsRouter);
  secured.use('/workflows', workflowsRouter);
  secured.use('/search', searchRouter);
  secured.use('/analytics', analyticsRouter);
  secured.use('/instagram', instagramRouter);
  secured.use('/auto-reply', autoReplyRouter);
  api.use(secured);
  api.use(notFoundHandler);

  app.use('/api', api);

  if (isProduction) serveWebApp(app);

  app.use(errorHandler);
  return app;
}

/** Serves the built SPA from the same origin; unknown non-API GETs get index.html. */
function serveWebApp(app: Express): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = env.WEB_DIST_DIR
    ? path.resolve(env.WEB_DIST_DIR)
    : path.resolve(here, '../../web/dist');
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) {
    logger.warn({ dir }, 'Web app build not found; only the API will be served');
    return;
  }
  app.use(
    express.static(dir, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, file) => {
        if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
