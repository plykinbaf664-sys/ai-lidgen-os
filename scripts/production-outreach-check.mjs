import assert from "node:assert/strict";
import fs from "node:fs/promises";

const identity = await import("../lib/leadgen/company-identity.ts");
const policy = await import("../lib/leadgen/outreach-policy.ts");

assert.equal(
  identity.normalizeDomain("HTTPS://WWW.Example.RU/path?q=1#part"),
  "example.ru",
);
assert.equal(identity.normalizeRecipientEmail(" SALES@Example.RU "), "sales@example.ru");
assert.equal(
  identity.getCompanyIdentity({
    company_name: "ООО «Альфа»",
    company_domain: "https://www.alpha.ru/about",
  }).identityKey,
  "domain:alpha.ru",
);
assert.notEqual(
  identity.getCompanyIdentity({
    company_name: "ООО Альфа",
    region: "Москва",
  }).identityKey,
  identity.getCompanyIdentity({
    company_name: "ООО Альфа",
    region: "Казань",
  }).identityKey,
);
const firstSeen = identity.getCompanyIdentity({
  company_name: "ООО Первая",
  company_domain: "first.example",
});
assert.equal(
  identity.getDuplicateReason(
    identity.getCompanyIdentity({
      company_name: "Первая",
      website: "https://www.first.example/contacts",
    }),
    firstSeen,
  ),
  "duplicate_domain",
);
assert.equal(
  identity.getDuplicateReason(
    identity.getCompanyIdentity({
      company_name: "Альфа",
      region: "Казань",
    }),
    identity.getCompanyIdentity({
      company_name: "Альфа",
      region: "Москва",
    }),
  ),
  null,
);
assert.equal(
  policy.calculateBatchCapacity({
    requested: 20,
    approved: 20,
    sentToday: 14,
    queuedForToday: 6,
    dailyLimit: 20,
    batchLimit: 20,
  }),
  0,
);
assert.equal(
  policy.calculateBatchCapacity({
    requested: 5,
    approved: 20,
    sentToday: 0,
    queuedForToday: 0,
    dailyLimit: 20,
    batchLimit: 20,
  }),
  5,
);
assert.equal(
  policy.getNextScheduledAt({
    currentTimestamp: 0,
    minimumDelaySeconds: 300,
    maximumDelaySeconds: 600,
    randomDelay: () => 510,
  }),
  510_000,
);
assert.equal(
  policy.resolveDeliveryRecipient({
    testMode: true,
    testRecipient: "test@example.com",
    actualRecipient: "real@example.com",
  }),
  "test@example.com",
);
assert.equal(
  policy.resolveDeliveryRecipient({
    testMode: false,
    testRecipient: "test@example.com",
    actualRecipient: "real@example.com",
  }),
  "real@example.com",
);

const sql = await fs.readFile("supabase/production_outreach_launch.sql", "utf8");
assert.match(sql, /for update skip locked/i);
assert.match(sql, /leadgen_outreach_queue_active_email_uidx/);
assert.match(sql, /leadgen_outreach_queue_sent_email_uidx/);
assert.match(sql, /status = 'sending'/);

const processor = await fs.readFile("lib/leadgen/outreach-processor.ts", "utf8");
assert.doesNotMatch(processor, /Promise\.all|setTimeout|sleep\s*\(/);
assert.match(processor, /claimDueOutreachItem/);

const storage = await fs.readFile("lib/leadgen/outreach-storage.ts", "utf8");
assert.match(storage, /emailDailySendLimit/);
assert.match(storage, /randomDelay/);
assert.match(storage, /status:\s*"queued"/);
assert.doesNotMatch(storage, /Promise\.all\([^]*sendEmail/);

const provider = await fs.readFile("lib/leadgen/email-provider.ts", "utf8");
assert.match(provider, /EMAIL_TEST_MODE/);
assert.match(provider, /EMAIL_TEST_RECIPIENT/);
assert.match(provider, /actualRecipient:\s*entry\.email/);

process.stdout.write("production-outreach-check: OK\n");
