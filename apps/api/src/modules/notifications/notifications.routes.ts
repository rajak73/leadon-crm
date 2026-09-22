import { Router } from 'express';
import { notificationListQuerySchema } from '@leados/shared';
import { idParam, ok, query } from '../../lib/http.js';
import { listNotifications, markAllRead, markRead, unreadCount } from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const { data, meta } = await listNotifications(
    req.user!.id,
    query(notificationListQuerySchema, req),
  );
  ok(res, data, meta);
});

notificationsRouter.get('/unread-count', async (req, res) =>
  ok(res, { count: await unreadCount(req.user!.id) }),
);

notificationsRouter.post('/read-all', async (req, res) => {
  await markAllRead(req.user!.id);
  ok(res, null);
});

notificationsRouter.post('/:id/read', async (req, res) => {
  await markRead(req.user!.id, idParam(req, 'notification'));
  ok(res, null);
});
