import path from "node:path";
import { readFile } from "node:fs/promises";
import { OUTREACH_GUIDE_ATTACHMENTS_ENABLED } from "@/lib/leadgen/outreach-guide-config";

export type OutreachGuideVariant = "A" | "B";

export type OutreachGuideAssignment = {
  alexanderGuideId: string;
  alexanderGuideVariant: OutreachGuideVariant;
  aiGuideId: string;
  aiGuideVariant: OutreachGuideVariant;
  bundleVersion?: 3;
};

type GuideDefinition = {
  id: string;
  owner: "alexander" | "ai";
  variant: OutreachGuideVariant;
  title: string;
  filename: string;
  contentType: string;
};

const GUIDE_ROOT = path.join(process.cwd(), "private-assets", "outreach-guides");

export const OUTREACH_GUIDES = {
  "alexander-process-map": {
    id: "alexander-process-map", owner: "alexander", variant: "A",
    title: "Шаблон бизнес-процессов", filename: "alexander-business-process-template.pdf", contentType: "application/pdf",
  },
  "alexander-business-diagnostic": {
    id: "alexander-business-diagnostic", owner: "alexander", variant: "B",
    title: "Чек-лист по диагностике бизнеса", filename: "alexander-business-diagnostic-checklist.pdf", contentType: "application/pdf",
  },
  "ai-manual-work-cost": {
    id: "ai-manual-work-cost", owner: "ai", variant: "A",
    title: "Где ручной труд забирает ваши деньги", filename: "ai-manual-work-cost.pdf", contentType: "application/pdf",
  },
  "ai-hiring-risk": {
    id: "ai-hiring-risk", owner: "ai", variant: "B",
    title: "Почему найм новых сотрудников может ухудшить ситуацию", filename: "ai-hiring-risk.pdf", contentType: "application/pdf",
  },
  "business-process-template-xlsx": {
    id: "business-process-template-xlsx", owner: "alexander", variant: "A",
    title: "Бизнес процессы (шаблон)", filename: "Бизнес процессы (шаблон).xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  "sales-diagnostic-xlsx": {
    id: "sales-diagnostic-xlsx", owner: "ai", variant: "A",
    title: "Диагностика отдела продаж — PRO продажи просто", filename: "Диагностика отдела продаж — PRO продажи просто.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
} as const satisfies Record<string, GuideDefinition>;

export function assignOutreachGuides(stableKey: string): OutreachGuideAssignment {
  // Keep the parameter in the contract so persisted assignment remains stable,
  // while every new cold email receives the same required two-file bundle.
  void stableKey;
  return {
    alexanderGuideId: "business-process-template-xlsx",
    alexanderGuideVariant: "A",
    aiGuideId: "sales-diagnostic-xlsx",
    aiGuideVariant: "A",
    bundleVersion: 3,
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
    contentType: guide.contentType,
    content: await readFile(path.join(GUIDE_ROOT, guide.filename)),
  })));
}
