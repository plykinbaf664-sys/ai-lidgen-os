import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import "./register-ts-paths.mjs";

// One copy call on previously discovered public evidence; no repeat searches.
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) process.env[key] = "";
const { generateFirstEmailWithAi } = await import("../lib/leadgen/first-email-ai-generator.ts");
const { validatePeopleAssessment } = await import("../lib/leadgen/people-evidence-agent.ts");
const previous = JSON.parse(await readFile(".ai/final-live-person.json", "utf8"));
const email = previous.companies[0].metadata.company_research.bestOutreachContact.email;
const people = previous.modelCalls.filter(call => call.schema === "people_evidence").flatMap(call => {
  const text = call.assessment.output?.flatMap(item => item.content ?? []).find(item => item.type === "output_text")?.text;
  return text ? validatePeopleAssessment(JSON.parse(text), call.evidence).people : [];
});
const selectedName = previous.companies[0].metadata.company_research.bestOutreachContact.personName;
const person = people.find(person => person.name === selectedName);
assert.ok(person, "Use only the role and name in the validated public quote");
const signal = previous.signals[0];
const replay = process.argv.includes("--replay");
if (replay) {
  const saved = JSON.parse(await readFile(".ai/final-live-copy.json", "utf8")).copy;
  const core = saved.body.slice(saved.body.indexOf("\n\n") + 2).split("\n\nЯ AI-архитектор.")[0];
  globalThis.fetch = async () => new Response(JSON.stringify({ output_text: JSON.stringify({
    subject: saved.subject, body: core, cta: saved.blocks.cta,
    quality: { reason_now: true, grounded_hypothesis: true, russian_only: true, personal_cta: true },
  }) }));
}
const copy = await generateFirstEmailWithAi({
  companyName: previous.companies[0].company_name,
  decisionMakerName: person.name, decisionMakerRole: person.role, contactEmail: email,
  messageMode: "personal", signalType: signal.signal_type, signalEvidence: signal.signal_detail,
  signalSourceUrl: signal.source_url,
});
await writeFile(".ai/final-live-copy.json", JSON.stringify({
  checkedAt: new Date().toISOString(), source: "Previously discovered live evidence; copy-only rerun", assemblyReplayed: replay,
  person, copy, productionSmtpCalls: 0,
}, null, 2));
assert.equal(copy.generationSource, "ai", copy.fallbackReason);
assert.ok(copy.qualityGatePassed);
assert.match(copy.body, /^Данила, добрый день\./);
console.log(JSON.stringify({ source: copy.generationSource, qualityGatePassed: copy.qualityGatePassed, person: person.name, role: person.role, artifact: ".ai/final-live-copy.json" }));
