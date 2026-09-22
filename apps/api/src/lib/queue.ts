import { logger } from './logger.js';

/**
 * Tiny in-process job queue (no Redis). Jobs run with bounded concurrency; failures are
 * logged, never thrown back to the caller. `debounce` coalesces repeated jobs per key.
 * Tests call `flush()` to run debounced jobs immediately and wait for everything to settle.
 */
type Job = { name: string; run: () => Promise<unknown> };

const CONCURRENCY = 4;
const pending: Job[] = [];
let running = 0;
let idleWaiters: Array<() => void> = [];
const debounced = new Map<string, { timer: NodeJS.Timeout; job: Job }>();
let accepting = true;

function pump(): void {
  while (running < CONCURRENCY && pending.length > 0) {
    const job = pending.shift()!;
    running++;
    void job
      .run()
      .catch((err: unknown) => logger.error({ err, job: job.name }, 'Background job failed'))
      .finally(() => {
        running--;
        pump();
        if (running === 0 && pending.length === 0) {
          const waiters = idleWaiters;
          idleWaiters = [];
          waiters.forEach((w) => w());
        }
      });
  }
}

export function enqueue(name: string, run: () => Promise<unknown>): void {
  if (!accepting) return;
  pending.push({ name, run });
  // Start on the next tick so the caller's response isn't delayed by job setup.
  setImmediate(pump);
}

/** Runs `run` once, `ms` after the last call with the same key. */
export function debounce(key: string, ms: number, name: string, run: () => Promise<unknown>): void {
  if (!accepting) return;
  const existing = debounced.get(key);
  if (existing) clearTimeout(existing.timer);
  const job = { name, run };
  const timer = setTimeout(() => {
    debounced.delete(key);
    enqueue(job.name, job.run);
  }, ms);
  timer.unref();
  debounced.set(key, { timer, job });
}

/** Drops a pending debounced job (no-op if it already ran or was never scheduled). */
export function cancelDebounce(key: string): boolean {
  const existing = debounced.get(key);
  if (!existing) return false;
  clearTimeout(existing.timer);
  debounced.delete(key);
  return true;
}

/** Drops every pending debounced job whose key starts with `prefix`. */
export function cancelDebouncePrefix(prefix: string): number {
  let n = 0;
  for (const key of [...debounced.keys()]) if (key.startsWith(prefix) && cancelDebounce(key)) n++;
  return n;
}

export const isDebounced = (key: string) => debounced.has(key);

/** Resolves once no job is queued or running (debounced jobs not yet due are ignored). */
export function idle(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      if (running === 0 && pending.length === 0) resolve();
      else idleWaiters.push(resolve);
    });
  });
}

/** Fires all debounced jobs now and waits until the queue is fully drained (jobs may enqueue more). */
export async function flush(): Promise<void> {
  // Let already-queued jobs (e.g. event handlers that are about to schedule a debounced job)
  // finish first, so one flush fires each debounced key once.
  await idle();
  for (let i = 0; i < 50; i++) {
    for (const [key, { timer, job }] of debounced) {
      clearTimeout(timer);
      debounced.delete(key);
      enqueue(job.name, job.run);
    }
    await idle();
    if (debounced.size === 0 && running === 0 && pending.length === 0) return;
  }
}

/** Stops accepting new jobs, drops debounced ones and waits (bounded) for running jobs. */
export async function shutdownQueue(timeoutMs = 10_000): Promise<void> {
  accepting = false;
  for (const { timer } of debounced.values()) clearTimeout(timer);
  debounced.clear();
  await Promise.race([idle(), new Promise((r) => setTimeout(r, timeoutMs).unref())]);
}
