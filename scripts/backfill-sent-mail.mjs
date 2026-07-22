import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

loadEnvFile(resolve(process.cwd(), ".env.local"));

const secret =
  process.env.OUTREACH_PROCESSOR_SECRET || process.env.CRON_SECRET;
if (!secret) {
  process.stderr.write("OUTREACH_PROCESSOR_SECRET не задан.\n");
  process.exit(1);
}

const baseUrl = (
  process.env.LEADGEN_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const action = process.argv.includes("--deduplicate")
  ? "?action=deduplicate"
  : process.argv.includes("--audit")
    ? "?action=audit"
    : "";
const response = await fetch(
  `${baseUrl}/api/leadgen/outreach/backfill-sent${action}`,
  {
    method: "POST",
    headers: {
      "x-outreach-processor-token": Buffer.from(secret, "utf8").toString(
        "base64url",
      ),
    },
  },
);
const payload = await response.json();
if (!response.ok || !payload.success) {
  process.stderr.write(`${payload.error || `HTTP ${response.status}`}\n`);
  process.exit(1);
}
process.stdout.write(
  `${JSON.stringify(
    action === "?action=deduplicate"
      ? { removed: payload.removed }
      : action === "?action=audit"
        ? { total: payload.total, copies: payload.copies }
      : {
          total: payload.total,
          saved: payload.saved,
          already_present: payload.already_present,
          failed: payload.failed.length,
        },
  )}\n`,
);
