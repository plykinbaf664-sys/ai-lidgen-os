import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { assignOutreachGuides, describeOutreachGuideAssignment, resolveOutreachGuideAttachments } =
  await import("../lib/leadgen/outreach-guides.ts");
const { OUTREACH_GUIDE_ATTACHMENTS_ENABLED } = await import("../lib/leadgen/outreach-guide-config.ts");
const { buildRawEmailMessage } = await import("../lib/leadgen/smtp-client.ts");

const assignment = assignOutreachGuides("contact-42:person@company.ru");
assert.deepEqual(assignment, assignOutreachGuides("contact-42:person@company.ru"));
const guides = describeOutreachGuideAssignment(assignment);
assert.equal(guides.length, 2);
assert.equal(guides.filter((guide) => guide.owner === "alexander").length, 1);
assert.equal(guides.filter((guide) => guide.owner === "ai").length, 1);
assert.equal(OUTREACH_GUIDE_ATTACHMENTS_ENABLED, false);
const attachments = await resolveOutreachGuideAttachments(assignment);
assert.equal(attachments.length, 0);

const config = { host: "smtp.test", port: 465, secure: true, user: "test", password: "test", fromEmail: "sender@example.com", fromName: "Leadgen Test" };
const raw = buildRawEmailMessage({ to: "recipient@example.com", subject: "Test", body: "No send", config, attachments }).rawMessage;
assert.equal((raw.match(/Content-Disposition: attachment/g) ?? []).length, 0);
const plain = buildRawEmailMessage({ to: "recipient@example.com", subject: "Follow-up", body: "No attachments", config }).rawMessage;
assert.equal((plain.match(/Content-Disposition: attachment/g) ?? []).length, 0);
process.stdout.write("OUTREACH_GUIDES_PAUSED stable_assignment=passed mime_attachments=0\n");
