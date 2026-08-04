import assert from "node:assert/strict";
import {
  fetchWithTransientRetry,
  isTransientNetworkError,
} from "../lib/network/fetch-with-transient-retry.ts";

const resetCause = Object.assign(new Error("read ECONNRESET"), {
  code: "ECONNRESET",
});
const resetError = new TypeError("terminated", { cause: resetCause });
assert.equal(isTransientNetworkError(resetError), true);

let getAttempts = 0;
const recovered = await fetchWithTransientRetry(
  "https://example.test/data",
  { method: "GET" },
  {
    timeoutMs: 1_000,
    retryDelaysMs: [1, 1],
    fetchImpl: async () => {
      getAttempts += 1;
      if (getAttempts === 1) throw resetError;
      return new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  },
);
assert.equal(getAttempts, 2);
assert.deepEqual(await recovered.json(), { ok: true });

let postAttempts = 0;
await assert.rejects(
  fetchWithTransientRetry(
    "https://example.test/write",
    { method: "POST", body: "{}" },
    {
      timeoutMs: 1_000,
      retryDelaysMs: [1, 1],
      fetchImpl: async () => {
        postAttempts += 1;
        throw resetError;
      },
    },
  ),
  /terminated/,
);
assert.equal(postAttempts, 1, "mutations must never be retried automatically");

console.log("NETWORK_RETRY_OK safe_reads=recovered mutations=single_attempt");
