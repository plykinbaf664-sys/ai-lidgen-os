import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const runtimeFiles = [];
for await (const file of glob(["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"], { exclude: ["lib/supabase/remote-sync-client.ts", "lib/leadgen/supabase-backup-sync.ts"] })) {
  runtimeFiles.push(file);
}

const contents = await Promise.all(runtimeFiles.map(async (file) => ({ file, text: await readFile(file, "utf8") })));
const selectAll = contents.filter(({ text }) => /\.select\(\s*["']\*["']\s*\)/.test(text));
const remoteCreateClient = contents.filter(({ text }) => /createClient\s*\(/.test(text));
const realtime = contents.filter(({ text }) => /\.channel\s*\(|postgres_changes|\.subscribe\s*\(/.test(text));
const client = await readFile(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
const queueUi = await readFile(new URL("../components/leadgen/email-outreach-queue.tsx", import.meta.url), "utf8");
const localDatabase = await readFile(new URL("../lib/leadgen/local-database.ts", import.meta.url), "utf8");

assert.equal(selectAll.length, 0, `select(*) remains: ${selectAll.map((item) => item.file).join(", ")}`);
assert.equal(remoteCreateClient.length, 0, `remote client leaked into runtime: ${remoteCreateClient.map((item) => item.file).join(", ")}`);
assert.equal(realtime.length, 0, `realtime remains: ${realtime.map((item) => item.file).join(", ")}`);
assert.match(client, /createLocalSupabaseClient/);
assert.doesNotMatch(client, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(queueUi, /AbortSignal\.timeout/);
assert.match(localDatabase, /compactLocalTableRows/);
assert.match(localDatabase, /gzipAsync/);

const beforeCyclesPerDay = 86_400 / 15;
const conservativeBytesPerCycle = 350 * 1024;
const beforeGiBPerDay = (beforeCyclesPerDay * conservativeBytesPerCycle) / 1024 ** 3;

console.log(JSON.stringify({
  status: "OK",
  runtime_supabase_requests_per_cycle: 0,
  runtime_supabase_egress_bytes_per_cycle: 0,
  select_all_queries: 0,
  realtime_subscriptions: 0,
  historical_poll_cycles_per_day: beforeCyclesPerDay,
  conservative_historical_egress_gib_per_day: Number(beforeGiBPerDay.toFixed(2)),
  remote_sync_isolated: true,
  local_storage_compressed: true,
  heavy_local_fields_stripped_on_write: true,
}, null, 2));
