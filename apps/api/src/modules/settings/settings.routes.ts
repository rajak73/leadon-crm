import { Router } from 'express';
import { updateSettingsSchema } from '@leados/shared';
import { requireAdmin } from '../../lib/auth.js';
import { body, ok } from '../../lib/http.js';
import { getSettings, toSettings, updateSettings } from './settings.service.js';

export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => ok(res, toSettings(await getSettings())));

settingsRouter.patch('/', requireAdmin, async (req, res) =>
  ok(res, await updateSettings(body(updateSettingsSchema, req))),
);
