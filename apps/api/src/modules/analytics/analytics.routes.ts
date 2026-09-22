import { Router } from 'express';
import { analyticsQuerySchema } from '@leados/shared';
import { ok, query } from '../../lib/http.js';
import { getDashboard } from './analytics.service.js';

export const analyticsRouter = Router();

analyticsRouter.get('/dashboard', async (req, res) =>
  ok(res, await getDashboard(query(analyticsQuerySchema, req).range)),
);
