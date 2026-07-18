const baseUrl = (process.env.LEADGEN_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
const secret =
  process.env.OUTREACH_PROCESSOR_SECRET || process.env.CRON_SECRET;

if (!secret) {
  process.stderr.write("OUTREACH_PROCESSOR_SECRET не задан.\n");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/leadgen/outreach/process`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});
const payload = await response.json();

if (!response.ok || !payload.success) {
  process.stderr.write(
    `${payload.error || `Processor HTTP ${response.status}`}\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify({
    status: payload.status,
    entry_id: payload.entry?.id ?? null,
  })}\n`,
);
