import { getPersonConfidenceLevel } from "@/lib/leadgen/person-confidence";
import {
  assessBusinessProblemOwnership,
  assessDecisionAuthority,
  assessInfluenceLevel,
  getMatchedPersonKeywords,
  hasLowAuthorityRole,
  scorePersonaMatch,
  scorePersonCandidate,
  scorePersonConfidence,
} from "@/lib/leadgen/person-scoring";
import type {
  DecisionMakerProfile,
  PersonCandidate,
  PersonIntelligence,
  PersonRecommendedNextAction,
} from "@/lib/leadgen/types";

function getTelegramAvailability(candidate: PersonCandidate): boolean {
  return typeof candidate.metadata.telegram_url === "string";
}

function formatPriority(value: string): string {
  return value.replace(/_/g, " ");
}

function buildSelectionReason({
  candidate,
  decisionMaker,
  personaMatchScore,
  businessProblemOwnership,
  decisionAuthority,
  influenceLevel,
  confidenceScore,
  matchedKeywords,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
  personaMatchScore: number;
  businessProblemOwnership: string;
  decisionAuthority: string;
  influenceLevel: string;
  confidenceScore: number;
  matchedKeywords: string[];
}): string {
  const role = candidate.role_title ?? "role is not available";
  const keywordReason = matchedKeywords.length
    ? `matched ${matchedKeywords.join(", ")}`
    : `no direct keyword match, compared against ${decisionMaker.primary_persona}`;
  const confidencePrefix =
    confidenceScore >= 70
      ? `${candidate.full_name} is the strongest available candidate`
      : `${candidate.full_name} is the best available hypothesis`;

  return [
    `${confidencePrefix} because ${role} ${keywordReason}.`,
    `Persona match ${personaMatchScore}/100, ownership ${formatPriority(
      businessProblemOwnership,
    )}, authority ${formatPriority(decisionAuthority)}, influence ${formatPriority(
      influenceLevel,
    )}, confidence ${confidenceScore}/100.`,
  ].join(" ");
}

function getStrengths({
  candidate,
  matchedKeywords,
  personaMatchScore,
  businessProblemOwnership,
  decisionAuthority,
  influenceLevel,
}: {
  candidate: PersonCandidate;
  matchedKeywords: string[];
  personaMatchScore: number;
  businessProblemOwnership: string;
  decisionAuthority: string;
  influenceLevel: string;
}): string[] {
  const strengths: string[] = [];

  if (matchedKeywords.length > 0) {
    strengths.push(`Matched context: ${matchedKeywords.join(", ")}`);
  }

  if (personaMatchScore >= 60) {
    strengths.push(`Strong persona match (${personaMatchScore}/100)`);
  }

  if (businessProblemOwnership === "high") {
    strengths.push("Likely owner of the business problem");
  }

  if (decisionAuthority === "high") {
    strengths.push("High decision authority");
  }

  if (influenceLevel === "high") {
    strengths.push("High influence in the buying process");
  }

  if (candidate.work_email || candidate.linkedin_url || candidate.phone) {
    strengths.push("Has at least one usable public contact signal");
  }

  return strengths;
}

function getWeaknesses({
  candidate,
  matchedKeywords,
  personaMatchScore,
  confidenceScore,
}: {
  candidate: PersonCandidate;
  matchedKeywords: string[];
  personaMatchScore: number;
  confidenceScore: number;
}): string[] {
  const weaknesses: string[] = [];

  if (hasLowAuthorityRole(candidate)) {
    weaknesses.push("Role appears to have low buying authority");
  }

  if (matchedKeywords.length === 0) {
    weaknesses.push("No direct persona keyword match in available evidence");
  }

  if (personaMatchScore < 45) {
    weaknesses.push(`Weak persona match (${personaMatchScore}/100)`);
  }

  if (confidenceScore < 45) {
    weaknesses.push(`Low confidence (${confidenceScore}/100)`);
  }

  if (!candidate.work_email && !candidate.linkedin_url && !candidate.phone) {
    weaknesses.push("No direct personal contact channel found");
  }

  return weaknesses;
}

function getRecommendedNextAction({
  personScore,
  confidenceScore,
  hasDirectContact,
  weaknesses,
}: {
  personScore: number;
  confidenceScore: number;
  hasDirectContact: boolean;
  weaknesses: string[];
}): PersonRecommendedNextAction {
  if (personScore >= 70 && confidenceScore >= 60 && hasDirectContact) {
    return "contact_primary_person";
  }

  if (personScore >= 55 && hasDirectContact) {
    return "contact_alternative_person";
  }

  if (weaknesses.some((weakness) => weakness.includes("low buying authority"))) {
    return "manual_review";
  }

  if (!hasDirectContact) {
    return "run_enrichment";
  }

  return "monitor_changes";
}

export function buildPersonIntelligence({
  candidate,
  decisionMaker,
}: {
  candidate: PersonCandidate;
  decisionMaker: DecisionMakerProfile;
}): PersonIntelligence {
  const matchedKeywords = getMatchedPersonKeywords({ candidate, decisionMaker });
  const personScore = scorePersonCandidate({ candidate, decisionMaker });
  const personaMatchScore = scorePersonaMatch({ candidate, decisionMaker });
  const businessProblemOwnership = assessBusinessProblemOwnership({
    candidate,
    decisionMaker,
  });
  const decisionAuthority = assessDecisionAuthority({ candidate, decisionMaker });
  const influenceLevel = assessInfluenceLevel({ candidate, decisionMaker });
  const confidenceScore = scorePersonConfidence({
    candidate,
    personaMatchScore,
  });
  const hasDirectContact = Boolean(
    candidate.work_email || candidate.linkedin_url || candidate.phone,
  );
  const strengths = getStrengths({
    candidate,
    matchedKeywords,
    personaMatchScore,
    businessProblemOwnership,
    decisionAuthority,
    influenceLevel,
  });
  const weaknesses = getWeaknesses({
    candidate,
    matchedKeywords,
    personaMatchScore,
    confidenceScore,
  });
  const selectionReason = buildSelectionReason({
    candidate,
    decisionMaker,
    personaMatchScore,
    businessProblemOwnership,
    decisionAuthority,
    influenceLevel,
    confidenceScore,
    matchedKeywords,
  });
  const recommendedNextAction = getRecommendedNextAction({
    personScore,
    confidenceScore,
    hasDirectContact,
    weaknesses,
  });

  return {
    candidate,
    rank_score: personScore,
    person_score: personScore,
    persona_match_score: personaMatchScore,
    business_problem_ownership: businessProblemOwnership,
    decision_authority: decisionAuthority,
    influence_level: influenceLevel,
    confidence_score: confidenceScore,
    confidence_level: getPersonConfidenceLevel(candidate),
    contact_availability: {
      has_work_email: Boolean(candidate.work_email),
      has_linkedin: Boolean(candidate.linkedin_url),
      has_phone: Boolean(candidate.phone),
      has_telegram: getTelegramAvailability(candidate),
    },
    matched_keywords: matchedKeywords,
    reasoning: matchedKeywords.length
      ? `Matched person context: ${matchedKeywords.join(", ")}.`
      : "No direct persona keyword match in available person context.",
    selection_reason: selectionReason,
    strengths,
    weaknesses,
    why_not_other_candidates: [],
    recommended_next_action: recommendedNextAction,
  };
}
