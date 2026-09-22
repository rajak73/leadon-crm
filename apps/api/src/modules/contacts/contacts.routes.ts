import { Router } from 'express';
import { contactListQuerySchema, createContactSchema, updateContactSchema } from '@leados/shared';
import { actor } from '../../lib/auth.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import {
  createContact,
  deleteContact,
  getContactDetail,
  listContacts,
  updateContact,
} from './contacts.service.js';

export const contactsRouter = Router();

contactsRouter.get('/', async (req, res) => {
  const { data, meta } = await listContacts(actor(req), query(contactListQuerySchema, req));
  ok(res, data, meta);
});

contactsRouter.post('/', async (req, res) =>
  created(res, await createContact(actor(req), body(createContactSchema, req))),
);

contactsRouter.get('/:id', async (req, res) =>
  ok(res, await getContactDetail(idParam(req, 'contact'))),
);

contactsRouter.patch('/:id', async (req, res) =>
  ok(res, await updateContact(actor(req), idParam(req, 'contact'), body(updateContactSchema, req))),
);

contactsRouter.delete('/:id', async (req, res) => {
  await deleteContact(idParam(req, 'contact'));
  ok(res, null);
});
