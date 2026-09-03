import assert from "node:assert/strict";
import { runAbortableOperation } from "../lib/network/abortable-operation.ts";
import { fetchWithTransientRetry } from "../lib/network/fetch-with-transient-retry.ts";

let activeOperations = 0;
let abortEvents = 0;
let backgroundTicks = 0;

const fallback = await runAbortableOperation({
  timeoutMs: 25,
  fallback: "timed_out",
  operation: (signal) => new Promise((resolve, reject) => {
    activeOperations += 1;
    const interval = setInterval(() => {
      backgroundTicks += 1;
    }, 5);
    signal.addEventListener("abort", () => {
      abortEvents += 1;
      activeOperations -= 1;
      clearInterval(interval);
      reject(signal.reason);
    }, { once: true });
    void resolve;
  }),
});

assert.equal(fallback, "timed_out");
assert.equal(abortEvents, 1);
assert.equal(activeOperations, 0);
const ticksAfterAbort = backgroundTicks;
await new Promise((resolve) => setTimeout(resolve, 40));
assert.equal(backgroundTicks, ticksAfterAbort);

let fetchAbortEvents = 0;
let activeFetches = 0;
const fetchImpl = async (_input, init) => new Promise((_resolve, reject) => {
    activeFetches += 1;
    init?.signal?.addEventListener("abort", () => {
      fetchAbortEvents += 1;
      activeFetches -= 1;
      reject(init.signal.reason);
    }, { once: true });
  });

const searchResult = await runAbortableOperation({
  timeoutMs: 25,
  fallback: [],
  operation: (signal) => fetchWithTransientRetry(
    "https://example.invalid/slow",
    { signal },
    { fetchImpl, timeoutMs: 5_000, maxAttempts: 1 },
  ).then(() => []),
});

assert.deepEqual(searchResult, []);
assert.equal(fetchAbortEvents, 1);
assert.equal(activeFetches, 0);

console.log(JSON.stringify({
  status: "PASS",
  orphan_operations_after_timeout: activeOperations,
  orphan_fetches_after_timeout: activeFetches,
  abort_events: abortEvents + fetchAbortEvents,
}));
