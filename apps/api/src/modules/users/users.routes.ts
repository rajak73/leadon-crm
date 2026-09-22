import { Router } from 'express';
import { createUserSchema, resetUserPasswordSchema, updateUserSchema } from '@leados/shared';
import { requireAdmin } from '../../lib/auth.js';
import { body, created, idParam, ok } from '../../lib/http.js';
import { createUser, listUsers, resetUserPassword, updateUser } from './users.service.js';

export const usersRouter = Router();

usersRouter.get('/', async (_req, res) => ok(res, await listUsers()));

usersRouter.post('/', requireAdmin, async (req, res) =>
  created(res, await createUser(body(createUserSchema, req))),
);

usersRouter.patch('/:id', requireAdmin, async (req, res) =>
  ok(res, await updateUser(req.user!.id, idParam(req, 'team member'), body(updateUserSchema, req))),
);

usersRouter.post('/:id/password', requireAdmin, async (req, res) => {
  await resetUserPassword(idParam(req, 'team member'), body(resetUserPasswordSchema, req).password);
  ok(res, null);
});
