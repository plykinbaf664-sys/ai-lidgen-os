import assert from "node:assert/strict";

const { calculateDailyLeadCapacity } = await import(
  "../lib/leadgen/daily-lead-policy.ts"
);

assert.deepEqual(
  calculateDailyLeadCapacity({ createdToday: 0, dailyLimit: 20 }),
  { createdToday: 0, dailyLimit: 20, remaining: 20 },
);
assert.deepEqual(
  calculateDailyLeadCapacity({ createdToday: 14, dailyLimit: 20 }),
  { createdToday: 14, dailyLimit: 20, remaining: 6 },
);
assert.deepEqual(
  calculateDailyLeadCapacity({ createdToday: 25, dailyLimit: 20 }),
  { createdToday: 25, dailyLimit: 20, remaining: 0 },
);

console.log("Daily lead limit checks: OK");
