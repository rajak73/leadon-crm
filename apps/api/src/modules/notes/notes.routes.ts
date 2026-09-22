import { Router } from 'express';
import { z } from 'zod';
import { createNoteSchema, updateNoteSchema } from '@leados/shared';
import { actor } from '../../lib/auth.js';
import { body, created, idParam, ok, query } from '../../lib/http.js';
import { createNote, deleteNote, listNotes, updateNote } from './notes.service.js';

const id = z.string().uuid('Invalid id').optional();
const notesQuerySchema = z.object({ leadId: id, contactId: id, dealId: id });

export const notesRouter = Router();

notesRouter.get('/', async (req, res) => ok(res, await listNotes(query(notesQuerySchema, req))));

notesRouter.post('/', async (req, res) =>
  created(res, await createNote(actor(req), body(createNoteSchema, req))),
);

notesRouter.patch('/:id', async (req, res) =>
  ok(res, await updateNote(actor(req), idParam(req, 'note'), body(updateNoteSchema, req).content)),
);

notesRouter.delete('/:id', async (req, res) => {
  await deleteNote(actor(req), idParam(req, 'note'));
  ok(res, null);
});
