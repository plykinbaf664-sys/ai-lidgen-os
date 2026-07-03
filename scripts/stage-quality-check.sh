#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAGE_FILE=".ai/current-stage.md"
OUT=".ai/check-result.md"
mkdir -p .ai

echo >> "$OUT"
echo "# Stage Quality Check" >> "$OUT"

if ! grep -Eiq "People Discovery Quality Audit" "$STAGE_FILE" 2>/dev/null; then
  echo "QUALITY_STATUS=OK" >> "$OUT"
  echo "Skipped: current stage does not request People Discovery Quality Audit." >> "$OUT"
  exit 0
fi

node <<'NODE' >> "$OUT" 2>&1
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const root = process.cwd();
const moduleCache = new Map();

function loadTs(relativePath) {
  const filePath = path.join(root, relativePath);
  if (moduleCache.has(filePath)) return moduleCache.get(filePath).exports;

  const source = fs.readFileSync(filePath, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(filePath, module);

  function localRequire(id) {
    const map = {
      "@/lib/leadgen/mock-people-provider": "lib/leadgen/mock-people-provider.ts",
      "@/lib/leadgen/people-provider-manager": "lib/leadgen/people-provider-manager.ts",
      "@/lib/leadgen/people-provider": "lib/leadgen/people-provider.ts",
      "@/lib/leadgen/types": "lib/leadgen/types.ts",
    };
    if (map[id]) return loadTs(map[id]);
    return require(id);
  }

  vm.runInNewContext(js, {
    require: localRequire,
    module,
    exports: module.exports,
    console,
    process,
    setTimeout,
    clearTimeout,
  }, { filename: relativePath });

  return module.exports;
}

const { PeopleDiscoveryEngine } = loadTs("lib/leadgen/people-discovery-engine.ts");

function person(full_name, role_title, confidence_score) {
  return {
    full_name,
    role_title,
    department: null,
    linkedin_url: null,
    work_email: null,
    phone: null,
    source: "quality-fixture",
    confidence_score,
    evidence: [role_title],
    metadata: {},
  };
}

function decisionMaker(primary, department, keywords) {
  return {
    primary_persona: primary,
    alternative_personas: [],
    department,
    buying_role: "champion",
    influence_level: "high",
    decision_authority: "medium",
    business_problem_owner: department,
    expected_pain: "quality fixture",
    expected_goal: "quality fixture",
    search_keywords: keywords,
    priority: "high",
    reasoning: "quality fixture",
    confidence_score: 80,
    source_reasoning: { signal_type: "GROWTH_SIGNAL" },
  };
}

class FixtureProvider {
  constructor(candidates) {
    this.id = "fixture";
    this.label = "Fixture Provider";
    this.candidates = candidates;
  }
  async findPeople() {
    return {
      provider_id: this.id,
      provider_label: this.label,
      candidates: this.candidates,
    };
  }
}

const strongRoles = [
  ["Founder", ["Founder", "Co-Founder", "CEO"]],
  ["CEO", ["CEO", "Founder"]],
  ["COO", ["COO", "Head of Operations"]],
  ["CRO", ["CRO", "VP Sales", "Head of Sales"]],
  ["CMO", ["CMO", "Head of Marketing"]],
  ["VP Sales", ["VP Sales", "Head of Sales"]],
  ["Head of Sales", ["Head of Sales", "VP Sales"]],
  ["Head of Marketing", ["Head of Marketing", "CMO"]],
  ["Head of Product Marketing", ["Head of Product Marketing", "Product Marketing Director"]],
  ["Head of Customer Success", ["Head of Customer Success", "VP Customer Success"]],
  ["Head of Operations", ["Head of Operations", "COO"]],
];

const weakPeople = [
  person("HR Person", "HR Manager", 99),
  person("Recruiter Person", "Recruiter", 98),
  person("Talent Person", "Talent Acquisition", 97),
  person("Support Person", "Support Agent", 96),
  person("Junior Person", "Junior Manager", 95),
  person("Office Person", "Office Manager", 94),
];

async function runCase(name, dm, candidates, expectedName, rejectRoles = []) {
  const engine = new PeopleDiscoveryEngine([new FixtureProvider(candidates)]);
  const result = await engine.discoverPeople({
    company: { company_name: "FixtureCo" },
    decisionMaker: dm,
  });
  const primary = result.primary_person;
  const role = primary?.role_title ?? "none";
  const okExpected = expectedName ? primary?.full_name === expectedName : primary === null;
  const rejectedPrimary = rejectRoles.some((pattern) => pattern.test(role));
  const ok = okExpected && !rejectedPrimary;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: primary=${primary?.full_name ?? "none"} role=${role}`);
  return ok;
}

(async () => {
  let ok = true;

  for (const [role, keywords] of strongRoles) {
    const good = person(`Good ${role}`, role, 75);
    ok = (await runCase(
      `strong role ${role}`,
      decisionMaker(role, role.includes("Sales") ? "Sales" : "Executive", keywords),
      [...weakPeople, good],
      `Good ${role}`,
      [/HR|Recruiter|Talent Acquisition|Support Agent|Junior Manager|Office Manager/i],
    )) && ok;
  }

  ok = (await runCase(
    "SDR must not beat non-sales target",
    decisionMaker("CMO", "Marketing", ["CMO", "Head of Marketing", "VP Marketing"]),
    [person("SDR Candidate", "SDR", 99), person("CMO Candidate", "CMO", 75)],
    "CMO Candidate",
    [/^SDR$/i],
  )) && ok;

  ok = (await runCase(
    "no strong candidate should not choose weak primary",
    decisionMaker("CMO", "Marketing", ["CMO", "Head of Marketing", "VP Marketing"]),
    weakPeople,
    null,
    [/HR|Recruiter|Talent Acquisition|Support Agent|Junior Manager|Customer Support|Office Manager/i],
  )) && ok;

  console.log(`QUALITY_STATUS=${ok ? "OK" : "FAIL"}`);
  process.exit(ok ? 0 : 1);
})();
NODE

code=$?
if [[ "$code" -eq 0 ]]; then
  exit 0
fi
exit "$code"
