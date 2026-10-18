import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const checks = [
  "check-discovery-continuation", "check-free-multisource-discovery", "check-discovery-source-extraction",
  "check-commercial-signal", "check-candidate-identity", "check-public-web-search",
  "check-direct-ai-reasoning", "check-direct-ai-company-resolution", "check-source-campaign-downstream",
  "check-company-research-agent", "check-offline-fallback", "check-company-research-performance", "check-lpr-production-integration",
  "check-contact-quality", "check-adaptive-contact-intelligence", "check-email-discovery", "check-people-evidence", "check-iterative-research", "check-personal-email-research",
  "check-first-email-v2", "check-offer-grounding", "check-outreach-guides", "check-approval-stability", "check-initial-queue-boundary",
  "check-local-outreach-store", "check-followup-engine", "check-outbound-thread-isolation",
  "check-outreach-summary", "check-production-consistency", "check-leadgen-ui-navigation",
  "check-network-abort", "check-network-retry", "check-storage-compaction", "check-production-limits", "check-research-economy",
];
let cursor = 0;
let failed = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < checks.length) {
    const check = checks[cursor++];
    const isolated = await mkdtemp(path.join(tmpdir(), "leadgen-regression-"));
    const env = { ...process.env, LEADGEN_LOCAL_DATA_DIR: isolated, EMAIL_TEST_MODE: "true", NODE_NO_WARNINGS: "1",
      LEADGEN_AI_PROVIDER: "openai", LEADGEN_AI_DAILY_BUDGET_USD: "100", LEADGEN_AI_COMPANY_BUDGET_USD: "100" };
    for (const key of Object.keys(env)) if (/SMTP|IMAP|TELEGRAM|OPENAI|QWEN|TAVILY|SUPABASE/.test(key)) env[key] = "";
    try {
      const result = await new Promise(resolve => {
        const child = spawn(process.execPath, ["--experimental-transform-types", "--import", "./scripts/register-ts-paths.mjs", `scripts/${check}.mjs`], { env, windowsHide: true });
        let output = "";
        child.stdout.on("data", chunk => output += chunk);
        child.stderr.on("data", chunk => output += chunk);
        const deadline = setTimeout(() => child.kill(), 90_000);
        child.on("exit", code => { clearTimeout(deadline); resolve({ code, output }); });
      });
      if (result.code !== 0) failed += 1;
      console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${check}${result.code === 0 ? "" : `\n${result.output}`}`);
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  }
}));
console.log(JSON.stringify({ checks: checks.length, passed: checks.length - failed, failed }));
process.exitCode = failed ? 1 : 0;
