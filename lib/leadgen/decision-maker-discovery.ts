import type {
  BuyingRole,
  DecisionMakerPriority,
  DecisionMakerProfile,
  LeadCandidate,
  SignalType,
} from "@/lib/leadgen/types";

type DecisionMakerInput = {
  candidate: LeadCandidate;
  signalType: SignalType;
};

type DepartmentKey =
  | "customer_success"
  | "marketing"
  | "sales"
  | "operations"
  | "product"
  | "executive";

type DepartmentProfile = {
  key: DepartmentKey;
  department: string;
  primaryPersonas: string[];
  alternativePersonas: string[];
  buyingRole: BuyingRole;
  influenceLevel: DecisionMakerPriority;
  decisionAuthority: DecisionMakerPriority;
  businessProblemOwner: string;
  expectedPain: string;
  expectedGoal: string;
  searchKeywords: string[];
  defaultReasoning: string;
};

type DepartmentScore = {
  key: DepartmentKey;
  score: number;
  matchedTerms: string[];
  reasons: string[];
};

const departmentProfiles: Record<DepartmentKey, DepartmentProfile> = {
  customer_success: {
    key: "customer_success",
    department: "Customer Success",
    primaryPersonas: ["VP Customer Success", "Head of Customer Success"],
    alternativePersonas: [
      "Director of Customer Success",
      "Head of Support",
      "COO",
      "Founder / CEO",
    ],
    buyingRole: "champion",
    influenceLevel: "high",
    decisionAuthority: "medium",
    businessProblemOwner: "Customer success leadership",
    expectedPain:
      "Customer onboarding, support load, retention work, and launch/customer communication can become manual as the company scales.",
    expectedGoal:
      "Reduce manual CS workload and improve customer-facing execution with AI-assisted workflows.",
    searchKeywords: [
      "VP Customer Success",
      "Head of Customer Success",
      "Director Customer Success",
      "Customer Success Lead",
      "Head of Support",
      "Client Success Director",
      "руководитель клиентского успеха",
      "директор клиентского сервиса",
      "руководитель поддержки",
    ],
    defaultReasoning:
      "Company context points to customer success or post-sale execution pressure, so customer success leadership is the most likely problem owner.",
  },
  marketing: {
    key: "marketing",
    department: "Marketing",
    primaryPersonas: ["CMO", "Head of Product Marketing", "VP Marketing"],
    alternativePersonas: [
      "Head of Growth",
      "VP Sales",
      "COO",
      "Founder / CEO",
    ],
    buyingRole: "champion",
    influenceLevel: "high",
    decisionAuthority: "medium",
    businessProblemOwner: "Marketing and go-to-market leadership",
    expectedPain:
      "Launches, campaigns, positioning, and demand generation create coordination load across marketing, sales, and customer-facing teams.",
    expectedGoal:
      "Make go-to-market execution faster and more consistent with AI-assisted planning, content, and workflow automation.",
    searchKeywords: [
      "CMO",
      "Head of Marketing",
      "VP Marketing",
      "Head of Product Marketing",
      "Product Marketing Director",
      "Head of Growth",
      "Demand Generation Director",
      "директор по маркетингу",
      "руководитель маркетинга",
      "директор по развитию",
    ],
    defaultReasoning:
      "The signal is tied to go-to-market execution, so marketing or product marketing leadership is the most relevant first persona.",
  },
  sales: {
    key: "sales",
    department: "Sales",
    primaryPersonas: ["VP Sales", "Head of Sales", "CRO"],
    alternativePersonas: [
      "Sales Director",
      "Head of Revenue",
      "Commercial Director",
      "Founder / CEO",
    ],
    buyingRole: "economic_buyer",
    influenceLevel: "high",
    decisionAuthority: "high",
    businessProblemOwner: "Sales and revenue leadership",
    expectedPain:
      "Sales hiring, revenue growth, or pipeline expansion can create manual prospecting, qualification, follow-up, and reporting work.",
    expectedGoal:
      "Increase sales operating leverage with AI-assisted workflows across prospecting, qualification, and follow-up.",
    searchKeywords: [
      "CRO",
      "VP Sales",
      "Head of Sales",
      "Sales Director",
      "Commercial Director",
      "Revenue Director",
      "Head of Revenue",
      "РОП",
      "руководитель продаж",
      "коммерческий директор",
    ],
    defaultReasoning:
      "The signal contains sales or revenue context, so sales leadership is the most likely owner of the commercial pain.",
  },
  operations: {
    key: "operations",
    department: "Operations",
    primaryPersonas: ["COO", "Head of Operations"],
    alternativePersonas: [
      "Operations Director",
      "Head of Business Operations",
      "Founder / CEO",
    ],
    buyingRole: "economic_buyer",
    influenceLevel: "high",
    decisionAuthority: "high",
    businessProblemOwner: "Operations leadership",
    expectedPain:
      "Growth and cross-functional execution can create manual handoffs, process fragmentation, and operational bottlenecks.",
    expectedGoal:
      "Use AI agents and workflow automation to reduce manual work across internal processes.",
    searchKeywords: [
      "COO",
      "Head of Operations",
      "Operations Director",
      "Head of Business Operations",
      "Business Operations Lead",
      "операционный директор",
      "руководитель операций",
      "директор по операционной деятельности",
    ],
    defaultReasoning:
      "The context points to process load or operational scaling, so operations leadership is the best entry persona.",
  },
  product: {
    key: "product",
    department: "Product",
    primaryPersonas: ["Head of Product", "VP Product"],
    alternativePersonas: [
      "Product Director",
      "Head of Product Marketing",
      "COO",
      "Founder / CEO",
    ],
    buyingRole: "influencer",
    influenceLevel: "medium",
    decisionAuthority: "medium",
    businessProblemOwner: "Product leadership",
    expectedPain:
      "Product launches and feature releases can create coordination load between product, marketing, sales, and customer success.",
    expectedGoal:
      "Improve launch readiness, adoption workflows, and customer communication with AI-assisted execution.",
    searchKeywords: [
      "Head of Product",
      "VP Product",
      "Product Director",
      "Product Marketing Director",
      "руководитель продукта",
      "директор по продукту",
    ],
    defaultReasoning:
      "The signal includes product or release context, so product leadership may own the launch and adoption workflow.",
  },
  executive: {
    key: "executive",
    department: "Executive",
    primaryPersonas: ["Founder", "CEO", "Managing Director"],
    alternativePersonas: ["COO", "Head of Growth", "Head of Sales"],
    buyingRole: "economic_buyer",
    influenceLevel: "high",
    decisionAuthority: "high",
    businessProblemOwner: "Company leadership",
    expectedPain:
      "The signal is commercially relevant, but ownership is not specific enough to assign to a single department with high confidence.",
    expectedGoal:
      "Explore where AI automation can remove manual work from the highest-priority growth or operations process.",
    searchKeywords: [
      "Founder",
      "Co-Founder",
      "CEO",
      "Owner",
      "Managing Director",
      "основатель",
      "генеральный директор",
      "владелец",
      "управляющий директор",
    ],
    defaultReasoning:
      "The signal is broad or under-specified, so company leadership is the safest initial target persona.",
  },
};

const contextTerms: Record<DepartmentKey, string[]> = {
  customer_success: [
    "customer success",
    "customer support",
    "support",
    "onboarding",
    "retention",
    "customers",
    "client success",
    "customer experience",
    "клиентский успех",
    "поддержка",
    "онбординг",
    "удержание",
    "клиентский сервис",
  ],
  marketing: [
    "marketing",
    "product marketing",
    "go-to-market",
    "gtm",
    "launch",
    "campaign",
    "demand generation",
    "positioning",
    "brand",
    "релиз",
    "запуск",
    "маркетинг",
    "продуктовый маркетинг",
    "продвижение",
  ],
  sales: [
    "sales",
    "sdr",
    "bdr",
    "account executive",
    "revenue",
    "pipeline",
    "cro",
    "commercial",
    "продажи",
    "роп",
    "выручка",
    "коммерческий",
    "отдел продаж",
  ],
  operations: [
    "operations",
    "ops",
    "process",
    "workflow",
    "manual",
    "automation",
    "scale",
    "scaling",
    "операции",
    "процесс",
    "ручной",
    "автоматизация",
    "масштабирование",
  ],
  product: [
    "product",
    "feature",
    "platform",
    "release",
    "beta",
    "general availability",
    "продукт",
    "функция",
    "платформа",
    "релиз",
  ],
  executive: [],
};

const signalBaseScores: Record<SignalType, Partial<Record<DepartmentKey, number>>> = {
  HIRING_SIGNAL: { sales: 18, operations: 14, executive: 10 },
  GO_TO_MARKET_SIGNAL: { marketing: 28, product: 12, sales: 10 },
  GROWTH_SIGNAL: { sales: 18, marketing: 14, operations: 10 },
  CONTENT_SIGNAL: { marketing: 18, customer_success: 8 },
  TRAFFIC_SIGNAL: { marketing: 18, sales: 12 },
  TECH_SIGNAL: { operations: 20, product: 12, executive: 8 },
};

function normalizeText(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function createInitialScores(signalType: SignalType): DepartmentScore[] {
  const scores = Object.keys(departmentProfiles).map((key) => ({
    key: key as DepartmentKey,
    score: key === "executive" ? 20 : 0,
    matchedTerms: [] as string[],
    reasons: [] as string[],
  }));

  const baseScores = signalBaseScores[signalType];

  for (const score of scores) {
    const baseScore = baseScores[score.key] ?? 0;

    if (baseScore > 0) {
      score.score += baseScore;
      score.reasons.push(`signal_type:${signalType}`);
    }
  }

  return scores;
}

function applyContextScores(scores: DepartmentScore[], contextText: string) {
  for (const score of scores) {
    const terms = contextTerms[score.key];
    const matchedTerms = terms.filter((term) => contextText.includes(term));

    if (matchedTerms.length === 0) {
      continue;
    }

    score.score += 16 + matchedTerms.length * 5;
    score.matchedTerms.push(...matchedTerms);
    score.reasons.push(`${score.key}_context`);
  }
}

function getPriority(score: number): DecisionMakerPriority {
  if (score >= 76) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function clampConfidence(score: number): number {
  return Math.max(38, Math.min(94, Math.round(score)));
}

function adjustConfidenceForAmbiguity(
  primaryScore: DepartmentScore,
  competingScore: DepartmentScore | undefined,
): number {
  const scoreGap = primaryScore.score - (competingScore?.score ?? 0);
  const baseConfidence = clampConfidence(primaryScore.score);

  if (scoreGap < 8) {
    return Math.max(42, baseConfidence - 14);
  }

  if (scoreGap < 16) {
    return Math.max(45, baseConfidence - 7);
  }

  return baseConfidence;
}

function selectPrimaryPersona(profile: DepartmentProfile): string {
  return profile.primaryPersonas[0];
}

function buildReasoning(profile: DepartmentProfile, score: DepartmentScore): string {
  if (score.matchedTerms.length === 0) {
    return profile.defaultReasoning;
  }

  return `${profile.defaultReasoning} Matched context: ${[
    ...new Set(score.matchedTerms),
  ].join(", ")}.`;
}

function buildConfidenceReason(
  primaryScore: DepartmentScore,
  competingScore: DepartmentScore | undefined,
): string {
  const scoreGap = primaryScore.score - (competingScore?.score ?? 0);

  if (scoreGap < 8 && competingScore) {
    return `The persona choice is directionally useful but not definitive because ${primaryScore.key} and ${competingScore.key} both fit the available context.`;
  }

  if (scoreGap < 16 && competingScore) {
    return `The primary persona is the best current hypothesis, with ${competingScore.key} still a meaningful alternative.`;
  }

  return "The selected persona has the strongest fit across signal type, signal interpretation, and matched business context.";
}

export function discoverDecisionMaker({
  candidate,
  signalType,
}: DecisionMakerInput): DecisionMakerProfile {
  const contextText = normalizeText(
    candidate.company_segment,
    candidate.card_signal_title,
    candidate.signal_summary,
    candidate.why_it_matters,
    candidate.why_now,
    candidate.outreach_hypothesis,
    JSON.stringify(candidate.icp_fit_breakdown),
    candidate.signals.map((signal) => signal.signal_detail).join(" "),
  );
  const scores = createInitialScores(signalType);

  applyContextScores(scores, contextText);

  const sortedScores = scores.sort((left, right) => right.score - left.score);
  const primaryScore = sortedScores[0];
  const competingScore = sortedScores[1];
  const profile = departmentProfiles[primaryScore.key];
  const confidenceScore = adjustConfidenceForAmbiguity(
    primaryScore,
    competingScore,
  );
  const alternativePersonas = [
    ...profile.primaryPersonas.slice(1),
    ...profile.alternativePersonas,
    ...sortedScores
      .slice(1, 3)
      .flatMap((score) => departmentProfiles[score.key].primaryPersonas),
  ].filter((persona, index, personas) => personas.indexOf(persona) === index);

  return {
    primary_persona: selectPrimaryPersona(profile),
    alternative_personas: alternativePersonas.slice(0, 6),
    department: profile.department,
    buying_role: profile.buyingRole,
    influence_level: profile.influenceLevel,
    decision_authority: profile.decisionAuthority,
    business_problem_owner: profile.businessProblemOwner,
    expected_pain: profile.expectedPain,
    expected_goal: profile.expectedGoal,
    search_keywords: profile.searchKeywords,
    priority: getPriority(confidenceScore),
    reasoning: buildReasoning(profile, primaryScore),
    confidence_score: confidenceScore,
    source_reasoning: {
      signal_type: signalType,
      company_segment: candidate.company_segment,
      card_signal_title: candidate.card_signal_title,
      signal_summary: candidate.signal_summary,
      why_it_matters: candidate.why_it_matters,
      why_now: candidate.why_now,
      icp_fit_score: candidate.icp_fit_score,
      matched_context_terms: [...new Set(primaryScore.matchedTerms)],
      confidence_reason: buildConfidenceReason(primaryScore, competingScore),
      competing_departments: sortedScores
        .slice(1, 4)
        .map((score) => departmentProfiles[score.key].department),
    },
  };
}
