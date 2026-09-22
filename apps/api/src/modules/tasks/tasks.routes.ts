import { Router } from 'express';
import { createTaskSchema, taskListQuerySchema, updateTaskSchema } from '@leados/shared';
import { actor } from '../../lib/auth.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import { createTask, deleteTask, listTasks, updateTask } from './tasks.service.js';

export const tasksRouter = Router();

tasksRouter.get('/', async (req, res) => {
  const { data, meta } = await listTasks(actor(req), query(taskListQuerySchema, req));
  ok(res, data, meta);
});

tasksRouter.post('/', async (req, res) =>
  created(res, await createTask(actor(req), body(createTaskSchema, req))),
);

tasksRouter.patch('/:id', async (req, res) =>
  ok(res, await updateTask(actor(req), idParam(req, 'task'), body(updateTaskSchema, req))),
);

tasksRouter.delete('/:id', async (req, res) => {
  await deleteTask(idParam(req, 'task'));
  ok(res, null);
});
