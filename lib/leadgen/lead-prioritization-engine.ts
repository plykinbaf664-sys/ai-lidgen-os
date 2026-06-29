import type {
  DecisionMakerProfile,
  LeadCandidate,
  LeadgenCompany,
  LeadgenContact,
  LeadPriority,
  PersonaSearchStatus,
  RecommendedNextAction,
} from "@/lib/leadgen/types";

type PrioritizeLeadInput = {
  candidate: LeadCandidate;
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  personaSearchStatus: PersonaSearchStatus;
};

function clampScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getSignalText(candidate: LeadCandidate): string {
  return [
    candidate.card_signal_title,
    candidate.signal_summary,
    candidate.why_it_matters,
    candidate.why_now,
    candidate.outreach_hypothesis,
    ...candidate.signals.flatMap((signal) => [
      signal.signal_title,
      signal.signal_detail,
      signal.signal_source_label,
      signal.source_url,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getSignalStrength(candidate: LeadCandidate): number {
  const signalConfidence = average(
    candidate.signals.map((signal) => signal.confidence_score),
  );
  let score = signalConfidence || candidate.lead_score;

  if (candidate.evidence_quality === "confirmed_event") {
    score += 14;
  } else if (candidate.evidence_quality === "probable_event") {
    score += 6;
  } else if (candidate.evidence_quality === "topic_only") {
    score -= 24;
  } else if (candidate.evidence_quality === "weak_context") {
    score -= 18;
  }

  if (candidate.confidence_level === "confirmed") {
    score += 8;
  } else if (candidate.confidence_level === "weak_evidence") {
    score -= 18;
  }

  if ((candidate.matched_signal_count ?? candidate.signals.length) > 1) {
    score += 6;
  }

  return clampScore(score);
}

function getBuyingIntent(candidate: LeadCandidate): number {
  const text = getSignalText(candidate);
  let score = 45;

  if (candidate.signal_type === "GO_TO_MARKET_SIGNAL") {
    score += 15;
  }

  if (candidate.signal_type === "HIRING_SIGNAL") {
    score += 12;
  }

  if (candidate.signal_type === "GROWTH_SIGNAL") {
    score += 10;
  }

  if (
    /\b(sales|revenue|customer success|support|onboarding|marketing|growth|ops|operations|automation|crm|launch|release|expansion)\b/i.test(
      text,
    ) ||
    /\b(\u043f\u0440\u043e\u0434\u0430\u0436|\u043a\u043b\u0438\u0435\u043d\u0442|\u043f\u043e\u0434\u0434\u0435\u0440\u0436|\u043c\u0430\u0440\u043a\u0435\u0442|\u0440\u043e\u0441\u0442|\u0437\u0430\u043f\u0443\u0441\u043a|crm|\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446)\b/i.test(
      text,
    )
  ) {
    score += 16;
  }

  if (candidate.evidence_quality === "topic_only") {
    score -= 25;
  }

  return clampScore(score);
}

function getTimingScore(candidate: LeadCandidate): number {
  let score = candidate.why_now ? 62 : 32;
  const whyNow = candidate.why_now?.toLowerCase() ?? "";

  if (
    /\b(now|current|active|recent|launch|released|hiring|expanding|scaling)\b/i.test(
      whyNow,
    ) ||
    /\b(\u0441\u0435\u0439\u0447\u0430\u0441|\u0430\u043a\u0442\u0438\u0432|\u043d\u0435\u0434\u0430\u0432\u043d|\u0437\u0430\u043f\u0443\u0441\u043a|\u043d\u0430\u0439\u043c|\u0440\u0430\u0441\u0448\u0438\u0440)\b/i.test(
      whyNow,
    )
  ) {
    score += 18;
  }

  if (candidate.confidence_level === "weak_evidence") {
    score -= 18;
  }

  if (candidate.evidence_quality === "confirmed_event") {
    score += 8;
  }

  return clampScore(score);
}

function getContactReadiness({
  bestOutreachEntry,
  fallbackEntry,
  personaSearchStatus,
}: Pick<
  PrioritizeLeadInput,
  "bestOutreachEntry" | "fallbackEntry" | "personaSearchStatus"
>): number {
  if (personaSearchStatus === "target_persona_found") {
    return 95;
  }

  if (personaSearchStatus === "alternative_persona_found") {
    return 86;
  }

  if (personaSearchStatus === "department_entry_found") {
    return 76;
  }

  if (bestOutreachEntry?.contact_type === "confirmed_person") {
    return 95;
  }

  if (bestOutreachEntry?.contact_type === "role_based_person") {
    return 86;
  }

  if (bestOutreachEntry?.contact_type === "generic_email") {
    return 58;
  }

  if (bestOutreachEntry?.contact_type === "contact_form") {
    return 64;
  }

  if (bestOutreachEntry?.contact_type === "social_profile") {
    return 52;
  }

  if (fallbackEntry?.contact_type === "company_website") {
    return 24;
  }

  return 10;
}

function getConfidence({
  candidate,
  decisionMaker,
  bestOutreachEntry,
}: Pick<
  PrioritizeLeadInput,
  "candidate" | "decisionMaker" | "bestOutreachEntry"
>): number {
  const signalConfidence = average(
    candidate.signals.map((signal) => signal.confidence_score),
  );
  const contactConfidence = bestOutreachEntry?.confidence_score ?? 35;
  const interpretationConfidence =
    candidate.confidence_level === "confirmed"
      ? 90
      : candidate.confidence_level === "high_confidence_inference"
        ? 78
        : candidate.confidence_level === "medium_confidence_hypothesis"
          ? 58
          : 35;

  return clampScore(
    average([
      signalConfidence || candidate.lead_score,
      decisionMaker.confidence_score,
      contactConfidence,
      interpretationConfidence,
    ]),
  );
}

function getPriorityLevel(score: number): LeadPriority["priority"] {
  if (score >= 85) {
    return "critical";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 50) {
    return "medium";
  }

  return "low";
}

function getRecommendedNextAction({
  priorityScore,
  signalStrength,
  timingScore,
  bestOutreachEntry,
  fallbackEntry,
  personaSearchStatus,
}: {
  priorityScore: number;
  signalStrength: number;
  timingScore: number;
  bestOutreachEntry: LeadgenContact | null;
  fallbackEntry: LeadgenContact | null;
  personaSearchStatus: PersonaSearchStatus;
}): RecommendedNextAction {
  if (personaSearchStatus === "no_entry_found") {
    return priorityScore >= 55 ? "run_enrichment" : "monitor_for_new_signal";
  }

  if (
    personaSearchStatus === "fallback_only" ||
    fallbackEntry?.contact_type === "company_website"
  ) {
    return priorityScore >= 50 ? "run_enrichment" : "monitor_for_new_signal";
  }

  if (!bestOutreachEntry) {
    return priorityScore >= 55 ? "find_target_persona" : "monitor_for_new_signal";
  }

  if (
    bestOutreachEntry.contact_type === "confirmed_person" ||
    bestOutreachEntry.contact_type === "role_based_person"
  ) {
    return priorityScore >= 55 ? "send_outreach" : "review_manually";
  }

  if (bestOutreachEntry.contact_type === "generic_email") {
    return priorityScore >= 75 ? "send_outreach" : "run_enrichment";
  }

  if (bestOutreachEntry.contact_type === "contact_form") {
    return signalStrength >= 75 && timingScore >= 65
      ? "review_manually"
      : "run_enrichment";
  }

  if (bestOutreachEntry.contact_type === "social_profile") {
    return priorityScore >= 70 ? "review_manually" : "run_enrichment";
  }

  return "defer";
}

function buildStrengths({
  components,
  candidate,
  decisionMaker,
  bestOutreachEntry,
}: {
  components: LeadPriority["components"];
  candidate: LeadCandidate;
  decisionMaker: DecisionMakerProfile;
  bestOutreachEntry: LeadgenContact | null;
}): string[] {
  const strengths: string[] = [];

  if (components.icp_score >= 70) {
    strengths.push("Strong ICP fit for the current offer.");
  }

  if (components.signal_strength >= 70) {
    strengths.push(
      `Strong ${candidate.signal_type ?? "business"} signal with usable evidence.`,
    );
  }

  if (components.timing_score >= 70) {
    strengths.push("The signal creates a credible reason to act now.");
  }

  if (decisionMaker.confidence_score >= 70) {
    strengths.push(`Target persona is clear: ${decisionMaker.primary_persona}.`);
  }

  if (bestOutreachEntry) {
    strengths.push(`Available outreach entry: ${bestOutreachEntry.contact_type}.`);
  }

  return strengths.length > 0
    ? strengths
    : ["Lead passed discovery, but no individual factor is especially strong."];
}

function buildRisks({
  components,
  candidate,
  personaSearchStatus,
  bestOutreachEntry,
}: {
  components: LeadPriority["components"];
  candidate: LeadCandidate;
  personaSearchStatus: PersonaSearchStatus;
  bestOutreachEntry: LeadgenContact | null;
}): string[] {
  const risks: string[] = [];

  if (components.icp_score < 55) {
    risks.push("ICP fit is not strong enough to assume high buying probability.");
  }

  if (candidate.evidence_quality === "weak_context") {
    risks.push("Evidence is contextual rather than a confirmed business event.");
  }

  if (!candidate.why_now || components.timing_score < 55) {
    risks.push("Timing reason is weak; outreach may need a softer angle.");
  }

  if (
    personaSearchStatus === "fallback_only" ||
    personaSearchStatus === "no_entry_found"
  ) {
    risks.push("Target persona was not found in available public data.");
  }

  if (!bestOutreachEntry) {
    risks.push("No direct outreach entry is available yet.");
  }

  return risks.length > 0 ? risks : ["No major prioritization risk detected."];
}

function getReasoning({
  priority,
  components,
  decisionMaker,
  recommendedNextAction,
}: {
  priority: LeadPriority["priority"];
  components: LeadPriority["components"];
  decisionMaker: DecisionMakerProfile;
  recommendedNextAction: RecommendedNextAction;
}): string {
  return [
    `Priority is ${priority} because ICP fit is ${components.icp_score}/100, signal strength is ${components.signal_strength}/100, buying intent is ${components.buying_intent}/100, timing is ${components.timing_score}/100, and contact readiness is ${components.contact_readiness}/100.`,
    `The logical owner is ${decisionMaker.primary_persona}.`,
    `Recommended next action: ${recommendedNextAction}.`,
  ].join(" ");
}

export function prioritizeLead(input: PrioritizeLeadInput): LeadPriority {
  const icpScore = clampScore(
    input.company.icp_fit_score || input.candidate.icp_fit_score,
  );
  const signalStrength = getSignalStrength(input.candidate);
  const buyingIntent = getBuyingIntent(input.candidate);
  const timingScore = getTimingScore(input.candidate);
  const contactReadiness = getContactReadiness(input);
  const confidence = getConfidence(input);
  const priorityScore = clampScore(
    icpScore * 0.22 +
      signalStrength * 0.22 +
      buyingIntent * 0.18 +
      timingScore * 0.16 +
      contactReadiness * 0.12 +
      confidence * 0.1,
  );
  const priority = getPriorityLevel(priorityScore);
  const components = {
    icp_score: icpScore,
    signal_strength: signalStrength,
    buying_intent: buyingIntent,
    timing_score: timingScore,
    contact_readiness: contactReadiness,
    confidence,
  };
  const recommendedNextAction = getRecommendedNextAction({
    priorityScore,
    signalStrength,
    timingScore,
    bestOutreachEntry: input.bestOutreachEntry,
    fallbackEntry: input.fallbackEntry,
    personaSearchStatus: input.personaSearchStatus,
  });

  return {
    priority,
    priority_score: priorityScore,
    components,
    strengths: buildStrengths({
      components,
      candidate: input.candidate,
      decisionMaker: input.decisionMaker,
      bestOutreachEntry: input.bestOutreachEntry,
    }),
    risks: buildRisks({
      components,
      candidate: input.candidate,
      personaSearchStatus: input.personaSearchStatus,
      bestOutreachEntry: input.bestOutreachEntry,
    }),
    reasoning: getReasoning({
      priority,
      components,
      decisionMaker: input.decisionMaker,
      recommendedNextAction,
    }),
    recommended_next_action: recommendedNextAction,
  };
}
