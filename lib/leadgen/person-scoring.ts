import { clampPersonConfidence } from "@/lib/leadgen/person-confidence";
import type {
  DecisionMakerPriority,
  DecisionMakerProfile,
  PersonCandidate,
} from "@/lib/leadgen/types";

function normalizeText(value: string | null): string {
  return value?.toLowerCase().trim() ?? "";
}

function hasMetadataUrl(candidate: PersonCandidate, key: string): boolean {
  return typeof candidate.metadata[key] === "string";
}

export function getMatchedPersonKeywords({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): string[] {
  const searchText = [
    candidate.full_name,
    candidate.role_title,
    candidate.department,
    candidate.source,
    candidate.evidence.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    decisionMaker.primary_persona,
    decisionMaker.department,
    ...decisionMaker.search_keywords,
    ...decisionMaker.alternative_personas,
  ].filter((keyword) => searchText.includes(keyword.toLowerCase()));
}

function scorePriority(priority: DecisionMakerPriority): number {
  const scores: Record<DecisionMakerPriority, number> = {
    high: 90,
    medium: 60,
    low: 30,
  };

  return scores[priority];
}

function toPriority(score: number): DecisionMakerPriority {
  if (score >= 75) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function includesAny(searchText: string, values: string[]): boolean {
  return values.some((value) => searchText.includes(value.toLowerCase()));
}

const highAuthorityTitles = [
  "founder",
  "co-founder",
  "owner",
  "chief",
  "ceo",
  "coo",
  "cro",
  "cmo",
  "vp",
  "vice president",
  "head",
  "генеральный директор",
  "основатель",
  "сооснователь",
  "коммерческий директор",
  "операционный директор",
];

const mediumAuthorityTitles = [
  "director",
  "lead",
  "manager",
  "principal",
  "senior",
  "revenue operations",
  "sales operations",
  "marketing operations",
  "руководитель",
  "директор",
  "менеджер",
];

const lowAuthorityTitles = [
  "recruiter",
  "human resources",
  "talent acquisition",
  "sales development representative",
  "account executive",
  "support agent",
  "customer support",
  "office manager",
  "junior",
  "specialist",
  "специалист",
  "рекрутер",
  "подбор персонала",
  "кадры",
];

export function hasLowAuthorityRole(candidate: PersonCandidate): boolean {
  return includesAny(getCandidateSearchText(candidate), lowAuthorityTitles);
}

function hasTargetContext({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): boolean {
  const searchText = getCandidateSearchText(candidate);

  return (
    searchText.includes(decisionMaker.department.toLowerCase()) ||
    includesAny(searchText, decisionMaker.search_keywords) ||
    includesAny(searchText, decisionMaker.alternative_personas) ||
    searchText.includes(decisionMaker.primary_persona.toLowerCase())
  );
}

function getCandidateSearchText(candidate: PersonCandidate): string {
  return [
    candidate.full_name,
    candidate.role_title,
    candidate.department,
    candidate.source,
    candidate.evidence.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function scorePersonaMatch({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): number {
  const roleText = normalizeText(candidate.role_title);
  const departmentText = normalizeText(candidate.department);
  const matchedKeywords = getMatchedPersonKeywords({ candidate, decisionMaker });
  let score = 0;

  if (roleText.includes(decisionMaker.primary_persona.toLowerCase())) {
    score += 40;
  }

  if (departmentText.includes(decisionMaker.department.toLowerCase())) {
    score += 25;
  }

  score += Math.min(matchedKeywords.length * 8, 30);

  if (
    includesAny(roleText, decisionMaker.alternative_personas) ||
    includesAny(roleText, decisionMaker.search_keywords)
  ) {
    score += 15;
  }

  if (hasLowAuthorityRole(candidate) && !hasTargetContext({ candidate, decisionMaker })) {
    score -= 35;
  }

  return clampPersonConfidence(score);
}

export function assessBusinessProblemOwnership({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): DecisionMakerPriority {
  const searchText = getCandidateSearchText(candidate);
  let score = scorePriority(decisionMaker.priority) * 0.35;

  if (searchText.includes(decisionMaker.department.toLowerCase())) {
    score += 25;
  }

  if (includesAny(searchText, decisionMaker.search_keywords)) {
    score += 20;
  }

  if (searchText.includes(decisionMaker.business_problem_owner.toLowerCase())) {
    score += 20;
  }

  if (hasLowAuthorityRole(candidate)) {
    score -= hasTargetContext({ candidate, decisionMaker }) ? 20 : 45;
  }

  return toPriority(score);
}

export function assessDecisionAuthority({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): DecisionMakerPriority {
  const roleText = normalizeText(candidate.role_title);

  if (hasLowAuthorityRole(candidate)) {
    return "low";
  }

  if (includesAny(roleText, highAuthorityTitles)) {
    return "high";
  }

  if (includesAny(roleText, ["director", "директор"])) {
    return hasTargetContext({ candidate, decisionMaker }) ? "medium" : "low";
  }

  if (includesAny(roleText, mediumAuthorityTitles)) {
    return "medium";
  }

  return "low";
}

export function assessInfluenceLevel({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): DecisionMakerPriority {
  const authority = assessDecisionAuthority({ candidate, decisionMaker });
  const personaMatchScore = scorePersonaMatch({ candidate, decisionMaker });
  const ownership = assessBusinessProblemOwnership({ candidate, decisionMaker });
  const score =
    scorePriority(authority) * 0.4 +
    personaMatchScore * 0.35 +
    scorePriority(ownership) * 0.25;

  return toPriority(score);
}

export function scorePersonConfidence({
  candidate,
  personaMatchScore,
}: {
  candidate: PersonCandidate;
  personaMatchScore: number;
}): number {
  let score = clampPersonConfidence(candidate.confidence_score) * 0.65;

  score += personaMatchScore * 0.2;

  if (candidate.evidence.length > 0) {
    score += 8;
  }

  if (candidate.work_email) {
    score += 12;
  }

  if (candidate.linkedin_url) {
    score += 5;
  }

  if (candidate.phone) {
    score += 3;
  }

  if (hasMetadataUrl(candidate, "telegram_url")) {
    score += 4;
  }

  if (hasMetadataUrl(candidate, "vk_url")) {
    score += 2;
  }

  return clampPersonConfidence(score);
}

export function scorePersonCandidate({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): number {
  const personaMatchScore = scorePersonaMatch({ candidate, decisionMaker });
  const ownership = assessBusinessProblemOwnership({ candidate, decisionMaker });
  const authority = assessDecisionAuthority({ candidate, decisionMaker });
  const influence = assessInfluenceLevel({ candidate, decisionMaker });
  const confidenceScore = scorePersonConfidence({
    candidate,
    personaMatchScore,
  });

  return clampPersonConfidence(
    personaMatchScore * 0.35 +
      scorePriority(ownership) * 0.2 +
      scorePriority(authority) * 0.18 +
      scorePriority(influence) * 0.17 +
      confidenceScore * 0.1 -
      (hasLowAuthorityRole(candidate) ? 25 : 0) +
      (candidate.work_email ? 12 : 0),
  );
}
