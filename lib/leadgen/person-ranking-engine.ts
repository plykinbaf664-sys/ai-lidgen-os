import { buildPersonIntelligence } from "@/lib/leadgen/person-intelligence";
import type {
  PersonIntelligence,
  PersonCandidate,
  PersonRankingInput,
  PersonRankingResult,
} from "@/lib/leadgen/types";

function normalizeText(value: string | null): string {
  return value?.toLowerCase().trim() ?? "";
}

function getCandidateKey(candidate: PersonCandidate): string {
  if (candidate.linkedin_url) {
    return `linkedin:${candidate.linkedin_url.toLowerCase()}`;
  }

  if (candidate.work_email) {
    return `email:${candidate.work_email.toLowerCase()}`;
  }

  return `name:${candidate.full_name.toLowerCase()}:${normalizeText(
    candidate.role_title,
  )}`;
}

function dedupeCandidates(candidates: PersonCandidate[]): PersonCandidate[] {
  const byKey = new Map<string, PersonCandidate>();

  for (const candidate of candidates) {
    const key = getCandidateKey(candidate);
    const existing = byKey.get(key);

    if (!existing || candidate.confidence_score > existing.confidence_score) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()];
}

function getWhyCandidateRankedLower(
  primaryPerson: PersonIntelligence,
  candidate: PersonIntelligence,
): string {
  const reasons: string[] = [];

  if (candidate.person_score < primaryPerson.person_score) {
    reasons.push(
      `lower person score (${candidate.person_score}/100 vs ${primaryPerson.person_score}/100)`,
    );
  }

  if (candidate.persona_match_score < primaryPerson.persona_match_score) {
    reasons.push("weaker persona match");
  }

  if (candidate.business_problem_ownership !== "high") {
    reasons.push(
      `business problem ownership is ${candidate.business_problem_ownership}`,
    );
  }

  if (candidate.decision_authority === "low") {
    reasons.push("low decision authority");
  }

  if (candidate.weaknesses.length > 0) {
    reasons.push(candidate.weaknesses[0].toLowerCase());
  }

  return `${candidate.candidate.full_name}: ${
    reasons.length > 0
      ? reasons.join("; ")
      : "ranked below primary based on combined score"
  }.`;
}

function attachComparisonReasons(
  rankedPeople: PersonIntelligence[],
): PersonIntelligence[] {
  const primaryPerson = rankedPeople[0];

  if (!primaryPerson) {
    return rankedPeople;
  }

  const whyNotOtherCandidates = rankedPeople
    .slice(1, 4)
    .map((candidate) => getWhyCandidateRankedLower(primaryPerson, candidate));

  return rankedPeople.map((person, index) => ({
    ...person,
    why_not_other_candidates:
      index === 0
        ? whyNotOtherCandidates
        : [getWhyCandidateRankedLower(primaryPerson, person)],
  }));
}

export function rankPersonCandidates({
  candidates,
  decisionMaker,
}: PersonRankingInput): PersonRankingResult {
  const rankedPeople = attachComparisonReasons(
    dedupeCandidates(candidates)
    .map((candidate) => buildPersonIntelligence({ candidate, decisionMaker }))
    .sort(
      (left, right) =>
        right.rank_score - left.rank_score ||
        right.confidence_score - left.confidence_score,
    ),
  );

  return {
    primary_person: rankedPeople[0] ?? null,
    alternative_people: rankedPeople.slice(1, 4),
    ranked_people: rankedPeople,
  };
}
