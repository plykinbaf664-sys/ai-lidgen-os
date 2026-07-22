import assert from "node:assert/strict";

const { buildRawEmailMessage } = await import(
  new URL("../lib/leadgen/smtp-client.ts", import.meta.url).href
);
const { getPersonalizedOutboundSubject } = await import(
  new URL("../lib/leadgen/first-email-generator.ts", import.meta.url).href
);

const config = {
  host: "smtp.invalid",
  port: 465,
  secure: true,
  user: "sender@example.com",
  password: "not-used",
  fromEmail: "sender@example.com",
  fromName: "Leadgen OS",
};
const companies = ["Supervent", "Somon", "Sokol Rostov"];
const messages = companies.map((companyName, index) => {
  const subject = getPersonalizedOutboundSubject({
    companyName,
    uniquenessKey: `campaign-${index + 1}`,
  });
  return {
    companyName,
    subject,
    ...buildRawEmailMessage({
      to: `company-${String.fromCharCode(97 + index)}@example.com`,
      subject,
      body: `Тестовое письмо для ${companyName}.`,
      config,
      sentAt: new Date("2026-07-20T12:00:00.000Z"),
    }),
  };
});

assert.equal(new Set(messages.map((message) => message.messageId)).size, 3);
assert.equal(
  new Set(
    messages.map(
      (message) => message.rawMessage.match(/^Subject:\s*(.+)$/m)?.[1],
    ),
  ).size,
  3,
);

for (const [index, message] of messages.entries()) {
  assert.match(message.rawMessage, /^Message-ID:\s*<[^>]+>$/m);
  assert.match(message.rawMessage, /^To:\s*<company-[a-c]@example\.com>$/m);
  assert.equal(/^In-Reply-To:/im.test(message.rawMessage), false);
  assert.equal(/^References:/im.test(message.rawMessage), false);
  assert.equal(/^Thread-ID:/im.test(message.rawMessage), false);
  assert.equal(
    message.subject.includes(companies[index]),
    true,
    "Subject or body must remain company-specific",
  );
}

const retry = buildRawEmailMessage({
  to: "company-a@example.com",
  subject: getPersonalizedOutboundSubject({
    companyName: "Supervent",
    uniquenessKey: "campaign-1",
  }),
  body: "Повторная SMTP-попытка.",
  config,
});
assert.notEqual(retry.messageId, messages[0].messageId);
assert.equal(/^In-Reply-To:/im.test(retry.rawMessage), false);
assert.equal(/^References:/im.test(retry.rawMessage), false);

console.log("Outbound thread isolation checks passed.");
