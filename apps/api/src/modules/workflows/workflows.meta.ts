import {
  DEAL_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type WorkflowTrigger,
} from '@leados/shared';

export interface MetaField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'enum' | 'tags';
  options?: string[];
}

const leadFields: MetaField[] = [
  { key: 'firstName', label: 'First name', type: 'string' },
  { key: 'lastName', label: 'Last name', type: 'string' },
  { key: 'email', label: 'Email', type: 'string' },
  { key: 'phone', label: 'Phone', type: 'string' },
  { key: 'company', label: 'Company', type: 'string' },
  { key: 'source', label: 'Source', type: 'enum', options: [...LEAD_SOURCES] },
  { key: 'status', label: 'Status', type: 'enum', options: [...LEAD_STATUSES] },
  { key: 'tags', label: 'Tags', type: 'tags' },
  { key: 'aiScore', label: 'AI score', type: 'number' },
];

const dealFields: MetaField[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'value', label: 'Value', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'string' },
  { key: 'status', label: 'Status', type: 'enum', options: [...DEAL_STATUSES] },
  { key: 'stageName', label: 'Stage', type: 'string' },
  { key: 'pipelineName', label: 'Pipeline', type: 'string' },
];

const taskFields: MetaField[] = [
  { key: 'title', label: 'Title', type: 'string' },
  { key: 'type', label: 'Type', type: 'enum', options: [...TASK_TYPES] },
  { key: 'priority', label: 'Priority', type: 'enum', options: [...TASK_PRIORITIES] },
  { key: 'status', label: 'Status', type: 'enum', options: [...TASK_STATUSES] },
];

/** Fields usable in conditions, per trigger (the keys match the engine's entity snapshots). */
export const WORKFLOW_FIELDS: Record<WorkflowTrigger, MetaField[]> = {
  LEAD_CREATED: leadFields,
  LEAD_STATUS_CHANGED: leadFields,
  LEAD_SCORED: leadFields,
  DEAL_CREATED: dealFields,
  DEAL_STAGE_MOVED: dealFields,
  DEAL_WON: dealFields,
  DEAL_LOST: dealFields,
  TASK_COMPLETED: taskFields,
};
