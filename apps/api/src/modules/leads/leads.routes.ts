import { Router } from 'express';
import multer from 'multer';
import {
  ErrorCode,
  bulkLeadsSchema,
  convertLeadSchema,
  createLeadSchema,
  leadListQuerySchema,
  updateLeadSchema,
} from '@leados/shared';
import { actor } from '../../lib/auth.js';
import { AppError } from '../../lib/errors.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import { listScores, scoreLead } from '../ai/index.js';
import { MAX_IMPORT_BYTES, exportLeads, importLeads } from './leads.csv.js';
import {
  bulkLeads,
  convertLead,
  createLead,
  deleteLead,
  getLeadDetail,
  listLeadTags,
  listLeads,
  updateLead,
} from './leads.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

export const leadsRouter = Router();

leadsRouter.get('/', async (req, res) => {
  const { data, meta } = await listLeads(actor(req), query(leadListQuerySchema, req));
  ok(res, data, meta);
});

leadsRouter.post('/', async (req, res) =>
  created(res, await createLead(actor(req), body(createLeadSchema, req))),
);

leadsRouter.get('/tags', async (_req, res) => ok(res, await listLeadTags()));

leadsRouter.get('/export', async (req, res) => {
  const csv = await exportLeads(actor(req), query(leadListQuerySchema, req));
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${date}.csv"`);
  res.send(csv);
});

leadsRouter.post('/import', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file)
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Choose a CSV file to upload.', {
      file: ['Choose a CSV file to upload'],
    });
  const looksLikeCsv =
    /\.csv$/i.test(file.originalname) || /csv|text\/plain|excel/.test(file.mimetype);
  if (!looksLikeCsv)
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Upload a .csv file.', {
      file: ['Upload a .csv file'],
    });
  ok(res, await importLeads(actor(req), file.buffer));
});

leadsRouter.post('/bulk', async (req, res) =>
  ok(res, await bulkLeads(actor(req), body(bulkLeadsSchema, req))),
);

leadsRouter.get('/:id', async (req, res) => ok(res, await getLeadDetail(idParam(req, 'lead'))));

leadsRouter.patch('/:id', async (req, res) =>
  ok(res, await updateLead(actor(req), idParam(req, 'lead'), body(updateLeadSchema, req))),
);

leadsRouter.delete('/:id', async (req, res) => {
  await deleteLead(idParam(req, 'lead'));
  ok(res, null);
});

leadsRouter.post('/:id/convert', async (req, res) =>
  ok(res, await convertLead(actor(req), idParam(req, 'lead'), body(convertLeadSchema, req))),
);

leadsRouter.post('/:id/score', async (req, res) =>
  ok(res, await scoreLead(idParam(req, 'lead'), 'manual')),
);

leadsRouter.get('/:id/scores', async (req, res) => ok(res, await listScores(idParam(req, 'lead'))));
