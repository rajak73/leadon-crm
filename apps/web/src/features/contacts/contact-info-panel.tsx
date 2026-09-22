import type { z } from 'zod';
import { createContactSchema, type ContactDetail, type updateContactSchema } from '@leados/shared';
import { useUpdateContact } from '@/api/contacts';
import { TagInput } from '@/components/domain/tag-input';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TextLink } from '@/components/ui/link';
import { Empty, InfoRow, InlineField, zodMessage } from '@/features/leads/inline-field';
import { TagList } from '@/features/leads/lead-info-panel';
import { formatDate, personName } from '@/lib/format';
import { notify } from '@/lib/toast';

const shape = createContactSchema.shape;
type TextKey = 'email' | 'phone' | 'company' | 'jobTitle';

export function ContactInfoPanel({ contact }: { contact: ContactDetail }) {
  const update = useUpdateContact();

  async function save(patch: z.input<typeof updateContactSchema>, message: string) {
    await update.mutateAsync({ id: contact.id, ...patch });
    notify.success(message);
  }

  const textField = (key: TextKey, label: string, type: 'text' | 'email' | 'tel' = 'text') => {
    const value = contact[key];
    const display = !value ? (
      <Empty />
    ) : key === 'email' ? (
      <a href={`mailto:${value}`} className="text-primary-text hover:underline">
        {value}
      </a>
    ) : key === 'phone' ? (
      <a href={`tel:${value}`} className="text-primary-text hover:underline">
        {value}
      </a>
    ) : (
      value
    );
    return (
      <InlineField
        label={label}
        field={key}
        value={value ?? ''}
        display={display}
        validate={zodMessage(shape[key])}
        editor={(p) => (
          <Input
            type={type}
            autoFocus
            value={p.value}
            onChange={(e) => p.onChange(e.target.value)}
          />
        )}
        onSave={(v) => save({ [key]: v.trim() === '' ? null : v.trim() }, `${label} updated`)}
      />
    );
  };

  return (
    <Card>
      <CardHeader title="Details" />
      <CardBody>
        <dl className="divide-y divide-border">
          {textField('email', 'Email', 'email')}
          {textField('phone', 'Phone', 'tel')}
          {textField('company', 'Company')}
          {textField('jobTitle', 'Job title')}
          <InlineField<string[]>
            label="Tags"
            field="tags"
            value={contact.tags}
            display={<TagList tags={contact.tags} />}
            validate={zodMessage(shape.tags)}
            editor={(p) => <TagInput value={p.value} onChange={p.onChange} />}
            onSave={(v) => save({ tags: v }, 'Tags updated')}
          />
          {contact.convertedFromLeadId && (
            <InfoRow label="Source">
              <TextLink to={`/leads/${contact.convertedFromLeadId}`}>Converted from lead</TextLink>
            </InfoRow>
          )}
          <InfoRow label="Created">{formatDate(contact.createdAt)}</InfoRow>
          <InfoRow label="Created by">{personName(contact.createdBy)}</InfoRow>
        </dl>
      </CardBody>
    </Card>
  );
}
