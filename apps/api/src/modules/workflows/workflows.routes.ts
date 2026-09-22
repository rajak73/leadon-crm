import { Router } from 'express';
import { createWorkflowSchema, paginationSchema, updateWorkflowSchema } from '@leados/shared';
import { requireAdmin } from '../../lib/auth.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import { WORKFLOW_FIELDS } from './workflows.meta.js';
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listRuns,
  listWorkflows,
  updateWorkflow,
} from './workflows.service.js';

export const workflowsRouter = Router();

workflowsRouter.get('/', async (_req, res) => ok(res, await listWorkflows()));

workflowsRouter.get('/meta', (_req, res) => ok(res, { fields: WORKFLOW_FIELDS }));

workflowsRouter.post('/', requireAdmin, async (req, res) =>
  created(res, await createWorkflow(req.user!.id, body(createWorkflowSchema, req))),
);

workflowsRouter.get('/:id', async (req, res) =>
  ok(res, await getWorkflow(idParam(req, 'workflow'))),
);

workflowsRouter.patch('/:id', requireAdmin, async (req, res) =>
  ok(res, await updateWorkflow(idParam(req, 'workflow'), body(updateWorkflowSchema, req))),
);

workflowsRouter.delete('/:id', requireAdmin, async (req, res) => {
  await deleteWorkflow(idParam(req, 'workflow'));
  ok(res, null);
});

workflowsRouter.get('/:id/runs', async (req, res) => {
  const { page, limit } = query(paginationSchema, req);
  const { data, meta } = await listRuns(idParam(req, 'workflow'), page, limit);
  ok(res, data, meta);
});
