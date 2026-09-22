import type { LeadStatus } from '@leados/shared';
import { enqueue } from './queue.js';

/**
 * Domain events. Services emit them only after their database write has committed.
 * `depth` counts how many automation hops led here (0 = a person did it); the workflow
 * engine uses it as a loop guard.
 */
export type DomainEvent =
  | {
      type: 'lead.created';
      leadId: string;
      actorId: string | null;
      depth: number;
      imported?: boolean;
    }
  | {
      type: 'lead.status_changed';
      leadId: string;
      fromStatus: LeadStatus;
      toStatus: LeadStatus;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'lead.scored';
      leadId: string;
      score: number;
      previousScore: number | null;
      depth: number;
    }
  | {
      type: 'lead.assigned';
      leadIds: string[];
      assigneeId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'note.created';
      noteId: string;
      leadId: string | null;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'deal.created';
      dealId: string;
      pipelineId: string;
      stageId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'deal.stage_moved';
      dealId: string;
      pipelineId: string;
      fromStageId: string;
      stageId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'deal.won';
      dealId: string;
      pipelineId: string;
      stageId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'deal.lost';
      dealId: string;
      pipelineId: string;
      stageId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'deal.assigned';
      dealId: string;
      assigneeId: string;
      actorId: string | null;
      depth: number;
    }
  | {
      type: 'task.assigned';
      taskId: string;
      assigneeId: string;
      actorId: string | null;
      depth: number;
    }
  | { type: 'task.completed'; taskId: string; actorId: string | null; depth: number };

export type EventType = DomainEvent['type'];
type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;
type Handler<T extends EventType> = (event: EventOf<T>) => Promise<void>;

const handlers = new Map<EventType, Array<{ name: string; fn: Handler<EventType> }>>();

export function on<T extends EventType>(type: T, name: string, fn: Handler<T>): void {
  const list = handlers.get(type) ?? [];
  if (list.some((h) => h.name === name)) return; // idempotent registration
  list.push({ name, fn: fn as unknown as Handler<EventType> });
  handlers.set(type, list);
}

/** Hands the event to every subscriber as a background job. Never throws. */
export function emit(event: DomainEvent): void {
  for (const h of handlers.get(event.type) ?? []) {
    enqueue(`${event.type}:${h.name}`, () => h.fn(event));
  }
}

export function emitAll(events: DomainEvent[]): void {
  events.forEach(emit);
}
