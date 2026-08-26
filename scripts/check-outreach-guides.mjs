import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { assignOutreachGuides, describeOutreachGuideAssignment, resolveOutreachGuideAttachments } =
  await import("../lib/leadgen/outreach-guides.ts");
const { buildRawEmailMessage } = await import("../lib/leadgen/smtp-client.ts");

const assignment = assignOutreachGuides("contact-42:person@company.ru");
assert.equal(assignment.bundleVersion, 3);
assert.deepEqual(assignment, assignOutreachGuides("another-contact"));
const guides = describeOutreachGuideAssignment(assignment);
assert.deepEqual(guides.map((guide) => guide.filename).sort(), [
  "Бизнес процессы (шаблон).xlsx",
  "Диагностика отдела продаж — PRO продажи просто.xlsx",
].sort());

let assetsReady = true;
try {
  const resolved = await resolveOutreachGuideAttachments(assignment);
  assert.equal(resolved.length, 2);
} catch (error) {
  assetsReady = false;
  assert.match(String(error), /ENOENT|no such file/i);
}

const attachments = guides.map((guide) => ({
  filename: guide.filename,
  contentType: guide.contentType,
  content: Buffer.from("PK-test-only"),
}));
const config = { host: "smtp.test", port: 465, secure: true, user: "test", password: "test", fromEmail: "sender@example.com", fromName: "Leadgen Test" };
const raw = buildRawEmailMessage({ to: "recipient@example.com", subject: "Тест", body: "Без отправки", config, attachments }).rawMessage;
assert.equal((raw.match(/Content-Disposition: attachment/g) ?? []).length, 2);
assert.match(raw, /filename\*=UTF-8''/);

const followUp = buildRawEmailMessage({ to: "recipient@example.com", subject: "Follow-up", body: "No attachments", config }).rawMessage;
assert.equal((followUp.match(/Content-Disposition: attachment/g) ?? []).length, 0);
process.stdout.write(`OUTREACH_XLSX_BUNDLE mime=passed assets=${assetsReady ? "ready" : "missing"}\n`);
