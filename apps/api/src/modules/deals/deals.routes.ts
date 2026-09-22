import { Router } from 'express';
import {
  createDealSchema,
  dealListQuerySchema,
  moveDealSchema,
  updateDealSchema,
} from '@leados/shared';
import { actor } from '../../lib/auth.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import {
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  moveDeal,
  updateDeal,
} from './deals.service.js';

export const dealsRouter = Router();

dealsRouter.get('/', async (req, res) => {
  const { data, meta } = await listDeals(actor(req), query(dealListQuerySchema, req));
  ok(res, data, meta);
});

dealsRouter.post('/', async (req, res) =>
  created(res, await createDeal(actor(req), body(createDealSchema, req))),
);

dealsRouter.get('/:id', async (req, res) => ok(res, await getDeal(idParam(req, 'deal'))));

dealsRouter.patch('/:id', async (req, res) =>
  ok(res, await updateDeal(actor(req), idParam(req, 'deal'), body(updateDealSchema, req))),
);

dealsRouter.post('/:id/move', async (req, res) =>
  ok(res, await moveDeal(actor(req), idParam(req, 'deal'), body(moveDealSchema, req))),
);

dealsRouter.delete('/:id', async (req, res) => {
  await deleteDeal(idParam(req, 'deal'));
  ok(res, null);
});
