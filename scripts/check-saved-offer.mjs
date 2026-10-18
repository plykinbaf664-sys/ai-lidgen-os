import { readFile, writeFile } from "node:fs/promises";
import "./register-ts-paths.mjs";
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|SUPABASE/.test(key)) process.env[key] = "";
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error("Provide existing benchmark JSON and new output JSON");
const { generateFirstEmailWithAi } = await import("../lib/leadgen/first-email-ai-generator.ts");
const { withAiSpendScope } = await import("../lib/leadgen/ai-spend-budget.ts");
const report = JSON.parse(await readFile(source, "utf8"));
const records = [];
for (const record of report.records) {
  const input = record.trace.find(t => t.schema?.startsWith("leadgen_outreach_"))?.input;
  if (!input) continue;
  const copy = await withAiSpendScope(() => generateFirstEmailWithAi({ companyName: input.company,
    companyDescription: input.company_specifics, website: input.company_source,
    decisionMakerName: input.lpr.name, decisionMakerRole: input.lpr.role,
    publicPersonContext: input.lpr.public_evidence, whyThisPerson: input.lpr.why_this_person,
    messageMode: input.contact_type === "PERSONAL" ? "personal" : "generic_routing",
    signalType: input.signal.type, signalEvidence: input.signal.evidence, signalSourceUrl: input.signal.source,
    businessProblemHypothesis: input.business_context.problem_hypothesis,
    targetResponsibility: input.business_context.target_responsibility,
  }));
  records.push({ company: input.company, person: input.lpr, sourceSignal: input.signal,
    contact: record.bundle.bestOutreachContact, copy });
  console.log(JSON.stringify({ company: input.company, source: copy.generationSource, ready: copy.qualityGatePassed,
    attempts: copy.generationAttempts, reason: copy.fallbackReason, core: [copy.blocks.observation, copy.blocks.hypothesis, copy.blocks.insight] }));
}
await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), source, searchCalls: 0, productionSmtpCalls: 0, records }, null, 2));
