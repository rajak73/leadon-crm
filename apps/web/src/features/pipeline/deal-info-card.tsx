import type { ReactNode } from 'react';
import type { Deal } from '@leados/shared';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { TextLink } from '@/components/ui/link';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, personName } from '@/lib/format';
import { isDealOverdue } from './deal-card';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="type-small text-fg-muted sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 type-body text-fg">{children}</dd>
    </div>
  );
}

const none = <span className="text-fg-subtle">—</span>;

export function DealInfoCard({ deal }: { deal: Deal }) {
  const overdue = isDealOverdue(deal);
  return (
    <Card>
      <CardHeader title="Details" />
      <CardBody>
        <dl className="divide-y divide-border">
          <Row label="Contact">
            {deal.contact ? (
              <TextLink to={`/contacts/${deal.contact.id}`}>
                {personName(deal.contact)}
                {deal.contact.company && (
                  <span className="font-normal text-fg-muted"> · {deal.contact.company}</span>
                )}
              </TextLink>
            ) : (
              none
            )}
          </Row>
          <Row label="Lead">
            {deal.lead ? (
              <TextLink to={`/leads/${deal.lead.id}`}>{personName(deal.lead)}</TextLink>
            ) : (
              none
            )}
          </Row>
          <Row label="Owner">
            {deal.assignedTo ? (
              <span className="inline-flex items-center gap-2">
                <Avatar name={personName(deal.assignedTo)} size="sm" />
                {personName(deal.assignedTo)}
              </span>
            ) : (
              <span className="text-fg-subtle">Unassigned</span>
            )}
          </Row>
          <Row label="Expected close date">
            {deal.expectedCloseDate ? (
              <span className={cn(overdue && 'font-medium text-danger-fg')}>
                {formatDate(deal.expectedCloseDate)}
                {overdue && ' · Overdue'}
              </span>
            ) : (
              none
            )}
          </Row>
          <Row label="Created">
            {formatDateTime(deal.createdAt)} by {personName(deal.createdBy)}
          </Row>
          {deal.closedAt && <Row label="Closed">{formatDateTime(deal.closedAt)}</Row>}
          {deal.lostReason && (
            <Row label="Lost reason">
              <span className="whitespace-pre-wrap">{deal.lostReason}</span>
            </Row>
          )}
        </dl>
      </CardBody>
    </Card>
  );
}
