import path from "node:path";
import { readFile } from "node:fs/promises";
import { OUTREACH_GUIDE_ATTACHMENTS_ENABLED } from "@/lib/leadgen/outreach-guide-config";

export type OutreachGuideVariant = "A" | "B";

export type OutreachGuideAssignment = {
  alexanderGuideId: string;
  alexanderGuideVariant: OutreachGuideVariant;
  aiGuideId: string;
  aiGuideVariant: OutreachGuideVariant;
};

type GuideDefinition = {
  id: string;
  owner: "alexander" | "ai";
  variant: OutreachGuideVariant;
  title: string;
  filename: string;
};

const GUIDE_ROOT = path.join(process.cwd(), "private-assets", "outreach-guides");

export const OUTREACH_GUIDES = {
  "alexander-process-map": {
    id: "alexander-process-map", owner: "alexander", variant: "A",
    title: "Шаблон бизнес-процессов", filename: "alexander-business-process-template.pdf",
  },
  "alexander-business-diagnostic": {
    id: "alexander-business-diagnostic", owner: "alexander", variant: "B",
    title: "Чек-лист по диагностике бизнеса", filename: "alexander-business-diagnostic-checklist.pdf",
  },
  "ai-manual-work-cost": {
    id: "ai-manual-work-cost", owner: "ai", variant: "A",
    title: "Где ручной труд забирает ваши деньги", filename: "ai-manual-work-cost.pdf",
  },
  "ai-hiring-risk": {
    id: "ai-hiring-risk", owner: "ai", variant: "B",
    title: "Почему найм новых сотрудников может ухудшить ситуацию", filename: "ai-hiring-risk.pdf",
  },
} as const satisfies Record<string, GuideDefinition>;

function stableBit(value: string, salt: string) {
  let hash = 2166136261;
  for (const character of `${salt}:${value}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2;
}

export function assignOutreachGuides(stableKey: string): OutreachGuideAssignment {
  const alexanderGuideVariant = stableBit(stableKey, "alexander") === 0 ? "A" : "B";
  const aiGuideVariant = stableBit(stableKey, "ai") === 0 ? "A" : "B";
  return {
    alexanderGuideId: alexanderGuideVariant === "A" ? "alexander-process-map" : "alexander-business-diagnostic",
    alexanderGuideVariant,
    aiGuideId: aiGuideVariant === "A" ? "ai-manual-work-cost" : "ai-hiring-risk",
    aiGuideVariant,
  };
}

export function isOutreachGuideAssignment(value: unknown): value is OutreachGuideAssignment {
  if (!value || typeof value !== "object") return false;
  const assignment = value as Partial<OutreachGuideAssignment>;
  const alexander = OUTREACH_GUIDES[assignment.alexanderGuideId as keyof typeof OUTREACH_GUIDES];
  const ai = OUTREACH_GUIDES[assignment.aiGuideId as keyof typeof OUTREACH_GUIDES];
  return Boolean(
    alexander?.owner === "alexander" && alexander.variant === assignment.alexanderGuideVariant &&
    ai?.owner === "ai" && ai.variant === assignment.aiGuideVariant,
  );
}

export function describeOutreachGuideAssignment(assignment: OutreachGuideAssignment) {
  if (!isOutreachGuideAssignment(assignment)) throw new Error("Некорректное назначение outreach-гайдов.");
  return [
    OUTREACH_GUIDES[assignment.alexanderGuideId as keyof typeof OUTREACH_GUIDES],
    OUTREACH_GUIDES[assignment.aiGuideId as keyof typeof OUTREACH_GUIDES],
  ];
}

export async function resolveOutreachGuideAttachments(assignment: OutreachGuideAssignment) {
  if (!OUTREACH_GUIDE_ATTACHMENTS_ENABLED) return [];
  const guides = describeOutreachGuideAssignment(assignment);
  return Promise.all(guides.map(async (guide) => ({
    filename: guide.filename,
    contentType: "application/pdf",
    content: await readFile(path.join(GUIDE_ROOT, guide.filename)),
  })));
}
