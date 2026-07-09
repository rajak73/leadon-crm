import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { errorHandler } from './middleware/error.js';
import { globalRateLimit, authRateLimit, aiRateLimit } from './middleware/rateLimit.js';
import { requestLogger, metrics } from './middleware/requestLog.js';

import authRoutes from './routes/auth.js';
import twoFactorRoutes from './routes/twofactor.js';
import ssoRoutes from './routes/sso.js';
import organizationRoutes from './routes/organizations.js';
import adminRoutes from './routes/admin.js';
import dashboardRoutes from './routes/dashboard.js';
import leadRoutes from './routes/leads.js';
import contactRoutes from './routes/contacts.js';
import dealRoutes from './routes/deals.js';
import taskRoutes from './routes/tasks.js';
import conversationRoutes from './routes/conversations.js';
import simulationRoutes from './routes/simulation.js';
import cronRoutes from './routes/cron.js';
import aiRoutes from './routes/ai.js';
import billingRoutes from './routes/billing.js';
import integrationRoutes from './routes/integrations.js';
import metaWebhookRoutes from './routes/meta-webhook.js';
import formRoutes from './routes/forms.js';
import workflowRoutes from './routes/workflows.js';
import calendarRoutes from './routes/calendar.js';
import notificationRoutes from './routes/notifications.js';
import auditRoutes from './routes/audit.js';
import savedViewRoutes from './routes/savedViews.js';
import searchRoutes from './routes/search.js';
import reportsRoutes from './routes/reports.js';
import docsRoutes from './routes/docs.js';

export function createApp() {
  const app = express();

  // Trust the proxy (Render/most PaaS) so req.ip reflects the real client for
  // rate limiting. Single hop is safe.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(compression()); // gzip responses — saves free-tier bandwidth (BRD §19.2)
  app.use(
    cors({
      origin: config.webOrigin === '*' ? true : config.webOrigin.split(','),
      credentials: true,
    })
  );

  // Meta webhook is mounted BEFORE express.json() because signature
  // verification needs the raw request bytes (the route uses its own raw
  // body parser). BRD §16.
  app.use('/api/v1/webhooks', metaWebhookRoutes);

  app.use(express.json({ limit: '1mb' }));

  // Structured request logging + metrics (BRD §19.3).
  app.use(requestLogger);

  // Health / readiness — cheap, never rate-limited (free hosts ping these).
  app.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      service: 'leados-api',
      env: config.nodeEnv,
      flags: config.flags,
      time: new Date().toISOString(),
    })
  );

  // Lightweight metrics (BRD §19.3) — uptime, request counts, avg latency.
  app.get('/metrics', (_req, res) => {
    const avgLatencyMs = metrics.totalRequests ? metrics.sumLatencyMs / metrics.totalRequests : 0;
    res.json({
      uptimeSec: Math.floor((Date.now() - metrics.startedAt) / 1000),
      totalRequests: metrics.totalRequests,
      byStatusClass: metrics.byStatusClass,
      errors: metrics.errors,
      avgLatencyMs: Math.round(avgLatencyMs * 10) / 10,
    });
  });

  // API docs (public Swagger UI + raw spec) — before rate limiting.
  app.use('/api/docs', docsRoutes);

  // Global rate limit for all API routes (BRD §19.3). Applied after /health.
  app.use('/api', globalRateLimit);

  // API v1 — auth gets a stricter limiter to blunt brute-force/abuse.
  app.use('/api/v1/auth', authRateLimit, authRoutes);
  app.use('/api/v1/2fa', twoFactorRoutes);
  app.use('/api/v1/sso', ssoRoutes);
  app.use('/api/v1/organizations', organizationRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/dashboard', dashboardRoutes);
  app.use('/api/v1/leads', leadRoutes);
  app.use('/api/v1/contacts', contactRoutes);
  app.use('/api/v1/deals', dealRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/simulation', simulationRoutes);
  app.use('/api/v1/ai', aiRateLimit, aiRoutes);
  app.use('/api/v1/billing', billingRoutes);
  app.use('/api/v1/integrations', integrationRoutes);
  app.use('/api/v1/forms', formRoutes);
  app.use('/api/v1/workflows', workflowRoutes);
  app.use('/api/v1/calendar', calendarRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/saved-views', savedViewRoutes);
  app.use('/api/v1/search', searchRoutes);
  app.use('/api/v1/reports', reportsRoutes);
  app.use('/api/internal/cron', cronRoutes);

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler (last)
  app.use(errorHandler);

  return app;
}
