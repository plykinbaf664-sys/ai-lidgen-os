import type {
  DecisionMakerProfile,
  LeadgenCompany,
  PeopleProviderInput,
  PersonCandidate,
} from "@/lib/leadgen/types";

export function getCompanyDomain(company: LeadgenCompany): string | null {
  const rawDomain = company.company_domain?.trim();

  if (!rawDomain) {
    return null;
  }

  try {
    const parsedUrl = new URL(
      rawDomain.startsWith("http") ? rawDomain : `https://${rawDomain}`,
    );

    return parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return rawDomain.replace(/^www\./, "").toLowerCase();
  }
}

export function getTargetTitles(
  decisionMaker: DecisionMakerProfile,
): string[] {
  return [
    decisionMaker.primary_persona,
    ...decisionMaker.alternative_personas,
    ...decisionMaker.search_keywords,
  ]
    .map((title) => title.trim())
    .filter(Boolean)
    .filter((title, index, titles) => titles.indexOf(title) === index);
}

export function normalizeText(value: string | null | undefined): string {
  return value?.toLowerCase().trim() ?? "";
}

export function getCandidateRoleText(candidate: PersonCandidate): string {
  return [candidate.role_title, candidate.department, ...candidate.evidence]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function hasTargetRoleMatch(
  candidate: PersonCandidate,
  decisionMaker: DecisionMakerProfile,
): boolean {
  const roleText = getCandidateRoleText(candidate);
  const titles = getTargetTitles(decisionMaker).map((title) =>
    title.toLowerCase(),
  );
  const department = decisionMaker.department.toLowerCase();

  return (
    titles.some((title) => roleText.includes(title)) ||
    roleText.includes(department) ||
    hasExecutiveFallbackRole(roleText) ||
    getRoleKeywordGroups(decisionMaker).some((group) =>
      group.some((keyword) => roleText.includes(keyword)),
    )
  );
}

function hasExecutiveFallbackRole(roleText: string): boolean {
  return /(?:founder|owner|ceo|general director|chief executive|генеральный директор|директор|основатель|владелец|руководитель организации)/i.test(
    roleText,
  );
}

export function getRoleKeywordGroups(
  decisionMaker: DecisionMakerProfile,
): string[][] {
  const text = [
    decisionMaker.primary_persona,
    decisionMaker.department,
    ...decisionMaker.alternative_personas,
    ...decisionMaker.search_keywords,
  ]
    .join(" ")
    .toLowerCase();
  const groups: string[][] = [];

  if (/(marketing|growth|cmo|маркетинг|развити)/i.test(text)) {
    groups.push([
      "marketing",
      "growth",
      "cmo",
      "директор по маркетингу",
      "руководитель маркетинга",
      "директор по развитию",
      "маркетинг",
    ]);
  }

  if (/(sales|revenue|commercial|продаж|роп|коммерческ)/i.test(text)) {
    groups.push([
      "sales",
      "revenue",
      "commercial",
      "cro",
      "head of sales",
      "руководитель продаж",
      "директор по продажам",
      "коммерческий директор",
      "роп",
    ]);
  }

  if (/(operations|ops|coo|операц|процесс)/i.test(text)) {
    groups.push([
      "operations",
      "ops",
      "coo",
      "операционный директор",
      "директор по операционной",
      "руководитель операций",
    ]);
  }

  if (/(product|продукт)/i.test(text)) {
    groups.push([
      "product",
      "head of product",
      "product director",
      "директор по продукту",
      "руководитель продукта",
      "продакт",
    ]);
  }

  if (/(customer|support|success|клиент|поддерж)/i.test(text)) {
    groups.push([
      "customer success",
      "support",
      "head of support",
      "client service",
      "клиентский сервис",
      "руководитель поддержки",
      "директор клиентского",
    ]);
  }

  if (/(founder|ceo|owner|основатель|генеральный|владелец)/i.test(text)) {
    groups.push([
      "founder",
      "ceo",
      "owner",
      "генеральный директор",
      "основатель",
      "владелец",
    ]);
  }

  return groups;
}

export function getRoleFitConfidence({
  candidate,
  decisionMaker,
  hasDirectContact,
  baseConfidence,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
  hasDirectContact: boolean;
  baseConfidence: number;
}): number {
  const roleBonus = hasTargetRoleMatch(candidate, decisionMaker) ? 18 : 0;
  const contactBonus = hasDirectContact ? 10 : 0;

  return Math.min(Math.max(Math.round(baseConfidence + roleBonus + contactBonus), 0), 100);
}

export function buildProviderUnavailableResult({
  providerId,
  providerLabel,
  reason,
}: {
  providerId: string;
  providerLabel: string;
  reason?: string;
}) {
  return {
    provider_id: providerId,
    provider_label: providerLabel,
    candidates: [],
    unavailable: true,
    diagnostics: reason
      ? [
          {
            level: "warning" as const,
            message: reason,
          },
        ]
      : [],
  };
}

export function buildPeopleSearchPayload(input: PeopleProviderInput) {
  return {
    company: {
      name: input.company.company_name,
      domain: getCompanyDomain(input.company),
      source_url: input.company.source_url,
      linkedin_url: input.company.linkedin_url,
    },
    decision_maker: input.decisionMaker,
    search_keywords: input.searchKeywords,
    target_titles: getTargetTitles(input.decisionMaker),
  };
}
