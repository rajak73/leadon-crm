/**
 * Workflow execution engine (BRD §8.1). Evaluates an org's active workflows
 * against an event (lead created / status changed) and runs their actions.
 * Runs inline (free mode, no paid worker needed); best-effort and never throws
 * to the caller.
 */
import { prisma } from '../prisma.js';
import { logActivity } from '../lib/helpers.js';
import { createNotification } from './notifications.js';

export interface WorkflowEvent {
  organizationId: string;
  event: 'LEAD_CREATED' | 'LEAD_STATUS_CHANGED';
  leadId: string;
  newStatus?: string;
}

export async function runWorkflows(evt: WorkflowEvent): Promise<void> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { organizationId: evt.organizationId, isActive: true },
    });
    for (const wf of workflows) {
      if (!wf.definition) continue;
      let def: any;
      try {
        def = JSON.parse(wf.definition);
      } catch {
        continue;
      }
      if (def.trigger?.event !== evt.event) continue;
      if (evt.event === 'LEAD_STATUS_CHANGED' && def.trigger.status && def.trigger.status !== evt.newStatus) continue;

      // Execute the action.
      if (def.action?.type === 'CREATE_TASK') {
        await prisma.task.create({
          data: {
            organizationId: evt.organizationId,
            title: def.action.taskTitle || `Follow up (workflow: ${wf.name})`,
            priority: def.action.taskPriority || 'MEDIUM',
            status: 'OPEN',
            leadId: evt.leadId,
          },
        });
      } else if (def.action?.type === 'SET_LEAD_SCORE' && typeof def.action.score === 'number') {
        await prisma.lead.update({ where: { id: evt.leadId }, data: { score: def.action.score } });
      }

      await logActivity({
        organizationId: evt.organizationId,
        type: 'WORKFLOW_RUN',
        message: `Workflow "${wf.name}" executed (${def.action?.type})`,
        leadId: evt.leadId,
      });
      await createNotification({
        organizationId: evt.organizationId,
        type: 'WORKFLOW_RUN',
        title: `Workflow ran: ${wf.name}`,
        body: `Action: ${def.action?.type}`,
        link: '/app/tasks',
      });
    }
  } catch {
    // automation is non-critical; swallow errors
  }
}
