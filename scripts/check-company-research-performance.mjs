import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { runSignalPipeline } from "../lib/leadgen/signals/signal-pipeline.ts";

const latencyMs = 80;
let calls = 0;
let active = 0;
let maxActive = 0;
const provider = {
  async search() {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    active -= 1;
    return [];
  },
};

const startedAt = performance.now();
await runSignalPipeline({
  signalType: "GROWTH_SIGNAL",
  searchProvider: provider,
  targetCandidates: 100,
  maxQueries: 8,
  maxResultsPerQuery: 5,
  maxPagesPerQuery: 1,
  market: "ru",
  verticalId: "manufacturing",
});
const elapsedMs = Math.round(performance.now() - startedAt);
const sequentialEstimateMs = calls * latencyMs;

assert.ok(calls >= 4, `Expected a batch of search strategies, got ${calls}`);
assert.ok(maxActive >= 3, `Expected controlled parallel search, got ${maxActive}`);
assert.ok(
  elapsedMs < sequentialEstimateMs * 0.75,
  `Batch search ${elapsedMs}ms is too close to sequential ${sequentialEstimateMs}ms`,
);

const engine = await fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8");
assert.match(engine, /prefilterCandidate/);
assert.match(engine, /getCandidateResearchPriority/);
assert.match(engine, /discoveryResearchConcurrency/);
assert.match(engine, /discoverySearchStrategyBudget/);
assert.match(engine, /remainingStrategyBudget/);
assert.match(engine, /mapWithConcurrency\(\s*leadWorkflowCandidateRecords/);
assert.doesNotMatch(engine, /Promise\.all\(leadWorkflowCandidateRecords\.map/);

console.log(JSON.stringify({
  status: "COMPANY_RESEARCH_PERFORMANCE_OK",
  searchAttempts: calls,
  concurrency: maxActive,
  sequentialEstimateMs,
  batchedMs: elapsedMs,
}));
