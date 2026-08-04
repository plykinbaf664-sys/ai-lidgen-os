import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractPublicEmailsDetailed } from "../lib/leadgen/public-email-parser.ts";

function parse(text, companyDomain = "company.ru") {
  return extractPublicEmailsDetailed({
    text,
    sourceUrl: "https://company.ru/contacts",
    companyDomain,
  });
}

for (const [label, text, expected] of [
  ["homepage", "<footer>info@company.ru</footer>", "info@company.ru"],
  ["mailto", '<a href="mailto:sales@company.ru">Продажи</a>', "sales@company.ru"],
  [
    "json-ld",
    '<script type="application/ld+json">{"email":"office@company.ru"}</script>',
    "office@company.ru",
  ],
  ["at-dot", "marketing (at) company (dot) ru", "marketing@company.ru"],
  ["dog-full-domain", "hello собака company.ru", "hello@company.ru"],
  ["html-entities", "contact&#64;company&#46;ru", "contact@company.ru"],
]) {
  const result = parse(text);
  assert.equal(result.emails[0]?.email, expected, label);
}

const general = parse("reception@company.ru");
assert.equal(general.emails[0]?.classification, "company_generic_verified");

const department = parse("commercial@company.ru");
assert.equal(department.emails[0]?.classification, "department_verified");

const technical = parse("noreply@company.ru dpo@company.ru");
assert.equal(technical.emails.length, 0);
assert.equal(technical.rejected.length, 2);

const scriptArtifacts = parse(
  "<script>fonts.gstatic.com api.whatsapp.com</script>",
);
assert.equal(scriptArtifacts.emails.length, 0);

const alreadyJoinedArtifacts = parse(
  "<script>fonts.gst@ic.com api.wh@sapp.com</script>",
);
assert.equal(alreadyJoinedArtifacts.emails.length, 0);
assert.equal(
  alreadyJoinedArtifacts.rejected.every(
    (item) => item.reason === "technical_asset_artifact",
  ),
  true,
);

const wrongDomain = parse("sales@other-company.ru");
assert.equal(wrongDomain.emails.length, 0);
assert.equal(wrongDomain.rejected[0]?.reason, "wrong_domain");

const duplicate = parse("info@company.ru mailto:info@company.ru INFO@company.ru");
assert.equal(duplicate.emails.length, 1);

const engineSource = await readFile(
  new URL("../lib/leadgen/email-discovery-engine.ts", import.meta.url),
  "utf8",
);
assert.match(engineSource, /email_discovery_official_site_contract_violation/);
assert.doesNotMatch(
  engineSource,
  /normalizeHostname\(input\.commercialSignalSourceUrl\)\s*===\s*websiteDomain/,
  "A verified signal on the official company domain must not violate the Email Discovery contract",
);
assert.match(engineSource, /resolveMx/);
assert.match(engineSource, /sitemap\.xml/);
assert.match(engineSource, /robots\.txt/);
assert.match(engineSource, /kind !== "hr"/);
assert.doesNotMatch(engineSource, /SMTP|sendMail|RCPT/i);

console.log(
  JSON.stringify({
    status: "OK",
    extraction_cases: 6,
    classification_cases: 2,
    rejection_cases: 2,
    deduplication: "OK",
    official_site_contract: "OK",
    mx_validation: "OK",
    no_smtp_probe: "OK",
  }),
);
