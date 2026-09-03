import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getContactLevel } from "../lib/leadgen/contact-quality.ts";
import { resolveBoundedLprRoles } from "../lib/leadgen/lpr-role-resolver.ts";

const decisionMaker = {
  primary_persona: "VP Sales",
  alternative_personas: [
    "Исполнительный директор",
    "Главный врач",
    "Коммерческий директор",
    "Head of Sales",
  ],
  department: "Sales",
  buying_role: "economic_buyer",
  influence_level: "high",
  decision_authority: "high",
  business_problem_owner: "Sales and revenue leadership",
  expected_pain: "Рост отдела продаж создаёт ручную нагрузку.",
  expected_goal: "Ускорить продажи.",
  search_keywords: ["VP Sales", "РОП", "коммерческий директор"],
  priority: "high",
  reasoning: "Сигнал относится к продажам.",
  confidence_score: 85,
};
const rolePlan = resolveBoundedLprRoles(decisionMaker);
assert.ok(rolePlan.primary.aliases.length > 0);
assert.ok(rolePlan.alternatives.length <= 2);
assert.deepEqual(getContactLevel({
  confirmedPerson: false,
  classification: "GENERAL",
}), { level: "E", ready: true });

const providerSource = await readFile(
  new URL("../lib/leadgen/ru-public-people-provider.ts", import.meta.url),
  "utf8",
);
const engineSource = await readFile(
  new URL("../lib/leadgen/people-discovery-engine.ts", import.meta.url),
  "utf8",
);
assert.match(providerSource, /if \(input\.roleSearchPlan\) \{\s*return this\.findPeopleBounded\(input\)/);
assert.match(engineSource, /resolveBoundedLprRoles\(decisionMaker\)/);
assert.match(engineSource, /roleSearchPlan:/);

console.log(JSON.stringify({
  status: "PASS",
  production_bounded_resolver: true,
  alternative_role_limit: rolePlan.alternatives.length,
  no_person_fallback_level: "E",
  ready_preserved: true,
}));
