#!/usr/bin/env bash
set -u

export LANG=C.UTF-8
export LC_ALL=C.UTF-8
if command -v chcp.com >/dev/null 2>&1; then
  chcp.com 65001 >/dev/null 2>&1 || true
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [[ -z "$ROOT" ]]; then
  echo "Not inside a git repository."
  exit 1
fi
cd "$ROOT" || exit 1

node <<'NODE'
const fs = require("fs");
const { execFileSync } = require("child_process");

const sourcePath = ".ai/current-stage.md";
const taskPath = ".ai/current-task.md";
const backupPath = ".ai/current-task.backup.md";
const reportPath = ".ai/task-generation-report.md";
const promptPath = ".ai/prompts/generate-current-task-from-stage.md";

fs.mkdirSync(".ai", { recursive: true });

function writeFail(reason) {
  fs.writeFileSync(
    reportPath,
    [
      "VERDICT: FAILED",
      `REASON: ${reason}`,
      "NEXT_ACTION: Fill .ai/current-stage.md and rerun ./scripts/ai-run-current-stage.sh",
      "",
    ].join("\n"),
    "utf8",
  );
  console.error(reason);
}

if (!fs.existsSync(sourcePath)) {
  writeFail("Missing .ai/current-stage.md");
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, "utf8");
if (!source.trim()) {
  writeFail(".ai/current-stage.md is empty");
  process.exit(1);
}

if (fs.existsSync(taskPath)) {
  fs.copyFileSync(taskPath, backupPath);
}

function extractSection(name) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let capture = false;
  for (const line of lines) {
    if (new RegExp(`^####\\s+${name}\\s*$`, "i").test(line)) {
      capture = true;
      continue;
    }
    if (capture && /^####\s+/.test(line)) break;
    if (capture) out.push(line);
  }
  return out.join("\n").trim();
}

function extractAnySection(names) {
  for (const name of names) {
    const value = extractSection(name);
    if (value) return value;
  }
  return "";
}

function generatedByCodex() {
  if ((process.env.AI_TASK_GENERATION_MODE || "deterministic") !== "codex") {
    return null;
  }
  const prompt = [
    fs.existsSync(promptPath) ? fs.readFileSync(promptPath, "utf8") : "",
    "",
    "# .ai/current-stage.md",
    source,
  ].join("\n");
  const command = process.env.CODEX_CMD || "codex";
  try {
    const output = execFileSync(command, ["exec", "-"], {
      encoding: "utf8",
      input: prompt,
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 1024 * 1024 * 4,
    });
    const start = output.indexOf("# Current Task");
    if (start === -1) return null;
    return output.slice(start).replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```\s*$/, "").trim() + "\n";
  } catch {
    return null;
  }
}

const title = source.split(/\r?\n/)[0]?.replace(/^#+\s*/, "").trim() || "Current Stage";
const goal = extractSection("Goal") || "Complete the source stage without expanding scope.";
const scope = extractSection("Scope") || "- Use only files explicitly allowed by the source stage.";
const acceptance = extractSection("Acceptance Criteria") || "- Source stage acceptance criteria are satisfied.";
const mustNotChange =
  extractAnySection(["What Must Not Change", "Safety Rules", "Restrictions"]) ||
  "- Do not touch env files, node_modules, .next, package.json, commits, pushes, deploys, or unrelated business logic.";

function stageBlock(number, name, stageGoal, stageAcceptance, routes = "- none", api = "- none", behavior = "No UI behavior changes unless explicitly required by the source stage.") {
  return `### Stage ${number}  ${name}

#### Goal

${stageGoal}

#### Scope

${scope}

#### Acceptance Criteria

${stageAcceptance}

#### Routes To Check

${routes}

#### API To Check

${api}

#### Expected UI / Behavior

${behavior}`;
}

const deterministicTask = `# Current Task

## Goal

${title}

${goal}

## Business Meaning

Reduce manual duplication in the autonomous development workflow and execute the source stage through a validated five-stage task plan.

## Global Acceptance Criteria

${acceptance}

## Stages

${stageBlock(
  1,
  "Architecture / Core Contract",
  "Define the minimal contract and file boundaries required by the source stage.",
  "- The implementation approach follows the source stage goal.\n- Scope is not expanded beyond the source stage.\n- Existing workflow compatibility is preserved.",
)}

${stageBlock(
  2,
  "Ranking / Scoring / Confidence",
  "Implement or adjust the ranking, scoring, confidence, or decision logic required by the source stage.",
  acceptance,
  "- none",
  "- none",
  "Behavior reflects the source stage acceptance criteria without unrelated changes.",
)}

${stageBlock(
  3,
  "Provider / Integration Layer",
  "Connect the core logic to existing provider or integration boundaries allowed by the source stage.",
  "- Existing provider abstractions remain compatible.\n- No real external service is added unless explicitly required by the source stage.\n- No fake people, fake contacts, fake emails, or invented data are introduced.",
  "- none",
  "- none",
  "Provider behavior remains deterministic and explainable.",
)}

${stageBlock(
  4,
  "Pipeline + UI Integration",
  "Wire the stage result into the existing pipeline and UI surfaces allowed by the source stage.",
  "- Pipeline behavior remains backward compatible.\n- UI changes are limited to the source stage requirements.\n- Existing routes and legacy outputs are not broken.",
  "- /leadgen",
  "- none",
  "The user can see or use the completed stage behavior where the source stage requires it.",
)}

${stageBlock(
  5,
  "Quality Audit / Diagnostics",
  "Verify the stage behavior with deterministic checks, diagnostics, and final quality review.",
  "- The source stage acceptance criteria pass.\n- Diagnostics explain failures clearly.\n- TypeScript, lint, and build checks pass when required by the supervisor config.",
  "- /leadgen",
  "- none",
  "No regressions are visible in the checked surfaces.",
)}

## What Must Not Change

${mustNotChange}
- Do not change files outside the source stage Scope.
- Do not touch .env files.
- Do not touch node_modules.
- Do not touch .next.
- Do not change package.json unless explicitly required.
- Do not commit, push, or deploy.
`;

const task = generatedByCodex() || deterministicTask;
fs.writeFileSync(taskPath, task, "utf8");

const stages = [...task.matchAll(/^### Stage\s+[1-5]\s+(.+)$/gm)].map((match) => `Stage ${match[0].replace(/^### Stage\s+/, "")}`);
const report = [
  "VERDICT: OK",
  `SOURCE_STAGE_TITLE: ${source.split(/\r?\n/)[0] || ""}`,
  "DETECTED_GOAL:",
  ...goal.split(/\r?\n/).map((line) => `- ${line}`),
  "DETECTED_SCOPE:",
  ...scope.split(/\r?\n/).map((line) => `- ${line}`),
  `GENERATED_TASK_PATH: ${taskPath}`,
  "GENERATED_STAGES:",
  ...(stages.length ? stages.map((stage) => `- ${stage}`) : ["- none"]),
  "WARNINGS:",
  stages.length === 5 ? "- none" : `- Generated stage count is ${stages.length}; validation must fail.`,
  "",
].join("\n");

fs.writeFileSync(reportPath, report, "utf8");
NODE
