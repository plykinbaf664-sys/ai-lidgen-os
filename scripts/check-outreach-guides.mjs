import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { assignOutreachGuides, describeOutreachGuideAssignment, resolveOutreachGuideAttachments } =
  await import("../lib/leadgen/outreach-guides.ts");
const { OUTREACH_BONUS_LINKS, OUTREACH_GUIDE_ATTACHMENTS_ENABLED } =
  await import("../lib/leadgen/outreach-guide-config.ts");
const { buildRawEmailMessage } = await import("../lib/leadgen/smtp-client.ts");

const assignment = assignOutreachGuides("contact-42:person@company.ru");
assert.equal(assignment.bundleVersion, 3);
assert.deepEqual(assignment, assignOutreachGuides("another-contact"));
const guides = describeOutreachGuideAssignment(assignment);
assert.deepEqual(guides.map((guide) => guide.filename).sort(), [
  "Бизнес процессы (шаблон).xlsx",
  "Диагностика отдела продаж — PRO продажи просто.xlsx",
].sort());

assert.equal(OUTREACH_GUIDE_ATTACHMENTS_ENABLED, false);
assert.equal(OUTREACH_BONUS_LINKS.length, 2);
const resolved = await resolveOutreachGuideAttachments(assignment);
assert.equal(resolved.length, 0);

const config = { host: "smtp.test", port: 465, secure: true, user: "test", password: "test", fromEmail: "sender@example.com", fromName: "Leadgen Test" };
const raw = buildRawEmailMessage({ to: "recipient@example.com", subject: "Тест", body: OUTREACH_BONUS_LINKS.map((item) => item.url).join("\n"), config }).rawMessage;
assert.equal((raw.match(/Content-Disposition: attachment/g) ?? []).length, 0);
const decodedBody = Buffer.from(raw.split("\r\n\r\n").at(-1).replace(/\r\n/g, ""), "base64").toString("utf8");
for (const bonus of OUTREACH_BONUS_LINKS) assert.ok(decodedBody.includes(bonus.url));

const followUp = buildRawEmailMessage({ to: "recipient@example.com", subject: "Follow-up", body: "No attachments", config }).rawMessage;
assert.equal((followUp.match(/Content-Disposition: attachment/g) ?? []).length, 0);
process.stdout.write("OUTREACH_BONUS_LINKS body=passed attachments=disabled\n");
