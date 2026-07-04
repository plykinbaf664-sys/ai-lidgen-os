import type { PersonCandidate, PersonConfidenceLevel } from "@/lib/leadgen/types";

export function clampPersonConfidence(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

export function getPersonConfidenceLevel(
  candidate: PersonCandidate,
): PersonConfidenceLevel {
  const confidenceScore = clampPersonConfidence(candidate.confidence_score);
  const hasDirectContact = Boolean(
    candidate.work_email || candidate.linkedin_url || candidate.phone,
  );

  if (confidenceScore >= 85 && hasDirectContact) {
    return "confirmed";
  }

  if (confidenceScore >= 70) {
    return "high_confidence";
  }

  if (confidenceScore >= 45) {
    return "medium_confidence";
  }

  if (confidenceScore > 0) {
    return "low_confidence";
  }

  return "unknown";
}
