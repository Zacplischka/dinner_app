// The politeness budget (ADR 0010): every cold Woolworths lookup passes
// through one global queue — app-wide concurrency 1, 500 ms floor between
// request *starts* — so the whole app never asks more of Woolworths than one
// browsing human, regardless of user count. A requirement, not an
// optimisation: #242 found no ceiling to stay under, so the budget is chosen
// restraint.

export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>;

export function createPolitenessQueue(floorMs: number): Enqueue {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const wait = lastStart + floorMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      return task();
    });
    // A failed task must not wedge the queue.
    tail = run.catch(() => {});
    return run;
  };
}

/** The one global queue all outbound Woolworths calls flow through. */
export const woolworthsQueue = createPolitenessQueue(500);
