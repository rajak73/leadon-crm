import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  searchQuerySchema,
  type DealStatus,
  type LeadStatus,
  type SearchResults,
} from '@leados/shared';
import { ok, query } from '../../lib/http.js';
import { fullName } from '../../lib/labels.js';
import { prisma } from '../../lib/prisma.js';
import { textSearch } from '../leads/index.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const { q, limit } = query(searchQuerySchema, req);
  const [leads, contacts, deals] = await Promise.all([
    prisma.lead.findMany({
      where: {
        deletedAt: null,
        AND: textSearch<Prisma.LeadWhereInput>(
          ['firstName', 'lastName', 'email', 'phone', 'company'],
          q,
        ),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
    prisma.contact.findMany({
      where: {
        deletedAt: null,
        AND: textSearch<Prisma.ContactWhereInput>(
          ['firstName', 'lastName', 'email', 'phone', 'company'],
          q,
        ),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
    prisma.deal.findMany({
      where: { deletedAt: null, AND: textSearch<Prisma.DealWhereInput>(['title'], q) },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }),
  ]);
  const results: SearchResults = {
    leads: leads.map((l) => ({
      id: l.id,
      name: fullName(l),
      email: l.email,
      status: l.status as LeadStatus,
    })),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: fullName(c),
      email: c.email,
      company: c.company,
    })),
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: d.value,
      currency: d.currency,
      status: d.status as DealStatus,
    })),
  };
  ok(res, results);
});
