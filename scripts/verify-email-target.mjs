import http from "node:http";

const baseUrl = (
  process.env.LEADGEN_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const startedAt = Date.now();
const requestBody = JSON.stringify({
    name: "Dry Run 20 Email Verification",
    requestedBy: "Leadgen OS verification",
    dryRun: true,
    market: "ru",
});
const { statusCode, responseBody } = await new Promise((resolve, reject) => {
  const target = new URL(`${baseUrl}/api/leadgen/run`);
  const request = http.request({
    hostname: target.hostname,
    port: target.port,
    path: target.pathname,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(requestBody),
    },
  }, (response) => {
    let responseBody = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      responseBody += chunk;
    });
    response.on("end", () => {
      resolve({
        statusCode: response.statusCode ?? 0,
        responseBody,
      });
    });
  });
  request.on("error", reject);
  request.end(requestBody);
});
const payload = JSON.parse(responseBody);
const contacts = payload.contacts ?? [];
const uniqueEmails = new Set(
  contacts
    .map((contact) => contact.email?.trim().toLowerCase())
    .filter(Boolean),
);

process.stdout.write(
  `${JSON.stringify({
    http_status: statusCode,
    success: payload.success,
    error: payload.success ? null : payload.error,
    elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    companies: payload.companies?.length ?? 0,
    leads: payload.leads?.length ?? 0,
    contacts: contacts.length,
    unique_emails: uniqueEmails.size,
    stats: payload.production_discovery_stats ?? null,
    audit: payload.dry_run_audit ?? [],
  })}\n`,
);

if (statusCode < 200 || statusCode >= 300 || !payload.success || uniqueEmails.size < 20) {
  process.exitCode = 1;
}
