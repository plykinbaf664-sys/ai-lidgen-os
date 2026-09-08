import type { LeadOrigin } from "@/lib/leadgen/types";

export const leadOriginLabels: Record<LeadOrigin, string> = {
  DISCOVERY: "Бизнес-сигналы",
  AI_HIRING: "Прямая потребность в AI",
  IMPORTED: "Своя база",
};

export function getLeadOriginLabel(origin?: LeadOrigin | null) {
  return leadOriginLabels[origin ?? "DISCOVERY"];
}
