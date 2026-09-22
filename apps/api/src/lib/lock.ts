/**
 * Per-key async mutex: calls with the same key run one after another, in call order.
 * Used to process webhook events for one Instagram user sequentially (so two quick messages
 * can't both create a lead) and to avoid double-sending a comment reply.
 */
const tails = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
