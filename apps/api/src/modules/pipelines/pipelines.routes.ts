import { Router } from 'express';
import { createPipelineSchema, updatePipelineSchema } from '@leados/shared';
import { requireAdmin } from '../../lib/auth.js';
import { body, created, idParam, ok } from '../../lib/http.js';
import {
  createPipeline,
  deletePipeline,
  getBoard,
  listPipelines,
  updatePipeline,
} from './pipelines.service.js';

export const pipelinesRouter = Router();

pipelinesRouter.get('/', async (_req, res) => ok(res, await listPipelines()));

pipelinesRouter.post('/', requireAdmin, async (req, res) =>
  created(res, await createPipeline(body(createPipelineSchema, req))),
);

pipelinesRouter.get('/:id/board', async (req, res) =>
  ok(res, await getBoard(idParam(req, 'pipeline'))),
);

pipelinesRouter.patch('/:id', requireAdmin, async (req, res) =>
  ok(res, await updatePipeline(idParam(req, 'pipeline'), body(updatePipelineSchema, req))),
);

pipelinesRouter.delete('/:id', requireAdmin, async (req, res) => {
  await deletePipeline(idParam(req, 'pipeline'));
  ok(res, null);
});
