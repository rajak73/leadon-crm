import { describe, expect, it } from 'vitest';
import { createLeadSchema, createPipelineSchema, workflowDefinitionSchema } from './schemas.js';

describe('shared schemas', () => {
  it('treats blank optional fields as null', () => {
    const lead = createLeadSchema.parse({ firstName: 'Asha', email: '', phone: ' ' });
    expect(lead.email).toBeNull();
    expect(lead.phone).toBeNull();
    expect(lead.status).toBe('NEW');
  });

  it('rejects WON on create', () => {
    expect(createLeadSchema.safeParse({ firstName: 'A', status: 'WON' }).success).toBe(false);
  });

  it('requires exactly one won and one lost stage', () => {
    const base = {
      name: 'Sales',
      stages: [{ name: 'New' }, { name: 'Won', isWon: true }, { name: 'Lost' }],
    };
    expect(createPipelineSchema.safeParse(base).success).toBe(false);
  });

  it('validates workflow action configs', () => {
    const ok = workflowDefinitionSchema.safeParse({
      trigger: { type: 'LEAD_CREATED' },
      actions: [
        {
          type: 'outbound_webhook',
          config: { url: 'https://example.com/hook', headers: { 'X-Key': 'a' } },
        },
      ],
    });
    expect(ok.success).toBe(true);
    const bad = workflowDefinitionSchema.safeParse({
      trigger: { type: 'LEAD_CREATED' },
      actions: [
        { type: 'outbound_webhook', config: { url: 'http://example.com', headers: '{"a":1}' } },
      ],
    });
    expect(bad.success).toBe(false);
  });
});
