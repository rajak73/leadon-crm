import { createLeadSchema, LEAD_SOURCES, type LeadDetail, type LeadSource } from '@leados/shared';
import { useLeadTags, useUpdateLead, type LeadUpdate } from '@/api/leads';
import { TagInput } from '@/components/domain/tag-input';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, optionsFrom } from '@/components/ui/select';
import { formatDate, personName } from '@/lib/format';
import { leadSourceLabels } from '@/lib/labels';
import { notify } from '@/lib/toast';
import { Empty, InfoRow, InlineField, zodMessage } from './inline-field';

const shape = createLeadSchema.shape;

export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return <Empty />;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
      {tags.map((t) => (
        <li key={t}>
          <Badge>{t}</Badge>
        </li>
      ))}
    </ul>
  );
}

export function LeadInfoPanel({ lead }: { lead: LeadDetail }) {
  const update = useUpdateLead();
  const { data: tagSuggestions = [] } = useLeadTags();

  async function save(patch: LeadUpdate, message: string) {
    await update.mutateAsync({ id: lead.id, ...patch });
    notify.success(message);
  }
  const text = (v: string) => (v.trim() === '' ? null : v.trim());

  return (
    <Card>
      <CardHeader title="Details" />
      <CardBody>
        <dl className="divide-y divide-border">
          <InlineField
            label="Email"
            field="email"
            value={lead.email ?? ''}
            display={
              lead.email ? (
                <a href={`mailto:${lead.email}`} className="text-primary-text hover:underline">
                  {lead.email}
                </a>
              ) : (
                <Empty />
              )
            }
            validate={zodMessage(shape.email)}
            editor={(p) => (
              <Input
                type="email"
                autoFocus
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
              />
            )}
            onSave={(v) => save({ email: text(v) }, 'Email updated')}
          />
          <InlineField
            label="Phone"
            field="phone"
            value={lead.phone ?? ''}
            display={
              lead.phone ? (
                <a href={`tel:${lead.phone}`} className="text-primary-text hover:underline">
                  {lead.phone}
                </a>
              ) : (
                <Empty />
              )
            }
            validate={zodMessage(shape.phone)}
            editor={(p) => (
              <Input
                type="tel"
                autoFocus
                value={p.value}
                onChange={(e) => p.onChange(e.target.value)}
              />
            )}
            onSave={(v) => save({ phone: text(v) }, 'Phone updated')}
          />
          <InlineField
            label="Company"
            field="company"
            value={lead.company ?? ''}
            display={lead.company ?? <Empty />}
            validate={zodMessage(shape.company)}
            editor={(p) => (
              <Input autoFocus value={p.value} onChange={(e) => p.onChange(e.target.value)} />
            )}
            onSave={(v) => save({ company: text(v) }, 'Company updated')}
          />
          <InlineField<LeadSource>
            label="Source"
            field="source"
            value={lead.source}
            display={leadSourceLabels[lead.source]}
            editor={(p) => (
              <Select
                value={p.value}
                onValueChange={(v) => p.onChange(v as LeadSource)}
                options={optionsFrom(LEAD_SOURCES, leadSourceLabels)}
              />
            )}
            onSave={(v) => save({ source: v }, 'Source updated')}
          />
          <InlineField<string[]>
            label="Tags"
            field="tags"
            value={lead.tags}
            display={<TagList tags={lead.tags} />}
            validate={zodMessage(shape.tags)}
            editor={(p) => (
              <TagInput value={p.value} onChange={p.onChange} suggestions={tagSuggestions} />
            )}
            onSave={(v) => save({ tags: v }, 'Tags updated')}
          />
          {lead.status === 'LOST' && (
            <InlineField
              label="Lost reason"
              field="lostReason"
              value={lead.lostReason ?? ''}
              display={lead.lostReason ?? <Empty />}
              validate={(v) =>
                !v.trim()
                  ? 'Say why this lead was lost'
                  : v.length > 500
                    ? 'Must be 500 characters or fewer'
                    : undefined
              }
              editor={(p) => (
                <Input
                  autoFocus
                  value={p.value}
                  maxLength={500}
                  onChange={(e) => p.onChange(e.target.value)}
                />
              )}
              onSave={(v) => save({ lostReason: v.trim() }, 'Lost reason updated')}
            />
          )}
          <InfoRow label="Created">{formatDate(lead.createdAt)}</InfoRow>
          <InfoRow label="Created by">{personName(lead.createdBy)}</InfoRow>
        </dl>
      </CardBody>
    </Card>
  );
}
