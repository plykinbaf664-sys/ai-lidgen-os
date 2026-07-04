import type {
  LeadCandidate,
  LeadgenSignal,
  OpportunityAssessment,
  OpportunityRecommendedAction,
  OpportunityType,
  OpportunityUrgency,
  SignalType,
} from "@/lib/leadgen/types";
import { looksLikeJobTitleOrLocationShell } from "@/lib/leadgen/signals/company-quality-validator";

export const DEFAULT_OPPORTUNITY_THRESHOLD = 60;
const MIN_READY_ICP_FIT_SCORE = 45;

type AssessOpportunityInput = {
  candidate: LeadCandidate;
  threshold?: number;
};

const evergreenContextPattern =
  /\b(about us|company overview|pricing|blog|company news|resources|product page|technology page|ai page|automation page|crm page|guide|how to|checklist|tips|best practices|playbook|framework|\u043e \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438|\u0446\u0435\u043d\u044b|\u0431\u043b\u043e\u0433|\u043d\u043e\u0432\u043e\u0441\u0442\u0438|\u0440\u0443\u043a\u043e\u0432\u043e\u0434\u0441\u0442\u0432\u043e|\u043a\u0430\u043a |\u0447\u0435\u043a\u043b\u0438\u0441\u0442|\u0441\u043e\u0432\u0435\u0442\u044b)\b/i;

function clampScore(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function hasUsefulText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length >= 20;
}

function getPrimarySignal(candidate: LeadCandidate): LeadgenSignal | null {
  return [...candidate.signals].sort(
    (left, right) => right.confidence_score - left.confidence_score,
  )[0] ?? null;
}

function getSignalType(candidate: LeadCandidate): SignalType | null {
  return candidate.signal_type ?? getPrimarySignal(candidate)?.signal_type ?? null;
}

function getEvidenceStrength(candidate: LeadCandidate): number {
  const primarySignal = getPrimarySignal(candidate);
  const signalConfidence = primarySignal?.confidence_score ?? 0;
  let score = Math.min(signalConfidence, 85);

  if (candidate.evidence_quality === "confirmed_event") {
    score += 18;
  } else if (candidate.evidence_quality === "probable_event") {
    score += 8;
  } else if (candidate.evidence_quality === "topic_only") {
    score -= 35;
  } else if (candidate.evidence_quality === "weak_context") {
    score -= 25;
  }

  if (candidate.confidence_level === "confirmed") {
    score += 10;
  } else if (candidate.confidence_level === "high_confidence_inference") {
    score += 5;
  } else if (candidate.confidence_level === "weak_evidence") {
    score -= 25;
  }

  if ((candidate.matched_signal_count ?? candidate.signals.length) > 1) {
    score += 6;
  }

  return clampScore(score);
}

function getTimingScore(candidate: LeadCandidate): number {
  if (!hasUsefulText(candidate.why_now)) {
    return 15;
  }

  let score = 58;
  const text = [
    candidate.why_now,
    candidate.signal_summary,
    candidate.card_signal_title,
    candidate.outreach_hypothesis,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /\b(now|current|active|recent|launch|released|announced|hiring|expanding|scaling|new market|new product|capacity|\u0441\u0435\u0439\u0447\u0430\u0441|\u0442\u0435\u043a\u0443\u0449|\u0430\u043a\u0442\u0438\u0432|\u043d\u0430\u0439\u043c|\u0437\u0430\u043f\u0443\u0441\u043a|\u0440\u0435\u043b\u0438\u0437|\u0440\u0430\u0441\u0448\u0438\u0440|\u043c\u0430\u0441\u0448\u0442\u0430\u0431)\b/i.test(
      text,
    )
  ) {
    score += 22;
  }

  if (candidate.evidence_quality === "topic_only") {
    score -= 35;
  }

  return clampScore(score);
}

function getBuyingIntentScore(candidate: LeadCandidate): number {
  const signalType = getSignalType(candidate);
  let score = 35;

  if (signalType === "GO_TO_MARKET_SIGNAL") {
    score += candidate.gtm_signal_type === "confirmed_event" ? 35 : -20;
  }

  if (signalType === "HIRING_SIGNAL") {
    score += 28;
  }

  if (signalType === "GROWTH_SIGNAL") {
    score += 24;
  }

  if (signalType === "TECH_SIGNAL") {
    score += candidate.evidence_quality === "probable_event" ? 14 : 6;
  }

  if (candidate.evidence_quality === "confirmed_event") {
    score += 12;
  }

  if (candidate.evidence_quality === "topic_only") {
    score -= 35;
  }

  return clampScore(score);
}

function getOpportunityType(candidate: LeadCandidate): OpportunityType {
  const signalType = getSignalType(candidate);

  if (
    candidate.evidence_quality === "topic_only" ||
    candidate.gtm_signal_type === "topic_only"
  ) {
    return "evergreen_content";
  }

  if (signalType === "HIRING_SIGNAL") {
    return "hiring";
  }

  if (signalType === "GO_TO_MARKET_SIGNAL") {
    return candidate.evidence_quality === "confirmed_event"
      ? "product_launch"
      : "weak_context";
  }

  if (signalType === "GROWTH_SIGNAL") {
    return "expansion";
  }

  if (signalType === "TECH_SIGNAL") {
    return candidate.evidence_quality === "probable_event"
      ? "operational_pressure"
      : "weak_context";
  }

  if (candidate.evidence_quality === "confirmed_event") {
    return "confirmed_business_event";
  }

  if (candidate.evidence_quality === "probable_event") {
    return "strong_buying_window";
  }

  return "no_actionable_opportunity";
}

function getUrgency(score: number): OpportunityUrgency {
  if (score >= 82) {
    return "immediate";
  }

  if (score >= 70) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function getRecommendedAction({
  shouldCreateLead,
  score,
  opportunityType,
}: {
  shouldCreateLead: boolean;
  score: number;
  opportunityType: OpportunityType;
}): OpportunityRecommendedAction {
  if (shouldCreateLead) {
    return "create_lead";
  }

  if (
    opportunityType === "evergreen_content" ||
    opportunityType === "no_actionable_opportunity"
  ) {
    return score >= 45 ? "monitor" : "discard";
  }

  return score >= 50 ? "run_enrichment" : "monitor";
}

function hasEvergreenDominance(candidate: LeadCandidate): boolean {
  const text = [
    candidate.company_source_url,
    ...candidate.signals.map((signal) => signal.signal_detail),
    ...candidate.signals.map((signal) => signal.signal_title),
    ...candidate.signals.map((signal) => signal.signal_source_label),
    ...candidate.signals.map((signal) => signal.source_url),
  ]
    .filter(Boolean)
    .join(" ");

  return (
    evergreenContextPattern.test(text) &&
    candidate.evidence_quality !== "confirmed_event" &&
    candidate.confidence_level !== "confirmed"
  );
}

function buildPositiveFactors(candidate: LeadCandidate): string[] {
  const factors: string[] = [];
  const signalType = getSignalType(candidate);

  if (candidate.evidence_quality === "confirmed_event") {
    factors.push("Evidence is interpreted as a confirmed business event.");
  }

  if (candidate.evidence_quality === "probable_event") {
    factors.push("Evidence suggests a probable business change.");
  }

  if (signalType === "HIRING_SIGNAL") {
    factors.push("Hiring activity can indicate added capacity and workflow pressure.");
  }

  if (
    signalType === "GO_TO_MARKET_SIGNAL" &&
    candidate.gtm_signal_type === "confirmed_event"
  ) {
    factors.push("Go-to-market evidence points to a concrete launch or release window.");
  }

  if (signalType === "GROWTH_SIGNAL") {
    factors.push("Growth or expansion signal can create operational load.");
  }

  if ((candidate.matched_signal_count ?? candidate.signals.length) > 1) {
    factors.push("Multiple valid signals support the opportunity.");
  }

  if (candidate.icp_fit_score >= 70) {
    factors.push(`ICP fit is strong at ${candidate.icp_fit_score}/100.`);
  }

  if (hasUsefulText(candidate.why_now)) {
    factors.push("Why-now reasoning is present.");
  }

  return factors;
}

function buildNegativeFactors(candidate: LeadCandidate): string[] {
  const factors: string[] = [];

  if (looksLikeJobTitleOrLocationShell(candidate.company_name)) {
    factors.push(
      "Company identity looks like a job title, UI text, or location shell rather than a buyer company.",
    );
  }

  if (candidate.evidence_quality === "topic_only") {
    factors.push("Evidence is topic-only and does not prove a business change.");
  }

  if (candidate.evidence_quality === "weak_context") {
    factors.push("Evidence is weak context rather than a clear business event.");
  }

  if (!hasUsefulText(candidate.why_now)) {
    factors.push("Why-now reasoning is missing or too weak.");
  }

  if (candidate.confidence_level === "weak_evidence") {
    factors.push("Signal confidence level is weak.");
  }

  if ((candidate.icp_fit_score ?? 0) < MIN_READY_ICP_FIT_SCORE) {
    factors.push(
      `ICP fit is below the ready-lead threshold at ${candidate.icp_fit_score}/100.`,
    );
  }

  if (hasEvergreenDominance(candidate)) {
    factors.push("The source context looks evergreen or page-level rather than event-driven.");
  }

  return factors;
}

function buildMissingInformation(candidate: LeadCandidate): string[] {
  const missing: string[] = [];

  if (looksLikeJobTitleOrLocationShell(candidate.company_name)) {
    missing.push("A verified buyer company name.");
  }

  if (!hasUsefulText(candidate.why_now)) {
    missing.push("A specific timing reason for outreach.");
  }

  if (!hasUsefulText(candidate.why_it_matters)) {
    missing.push("A clear commercial impact explanation.");
  }

  if (!hasUsefulText(candidate.signal_summary)) {
    missing.push("A concise summary of what changed.");
  }

  if ((candidate.matched_signal_count ?? candidate.signals.length) <= 1) {
    missing.push("Additional corroborating signal evidence.");
  }

  return missing;
}

export function assessOpportunity({
  candidate,
  threshold = DEFAULT_OPPORTUNITY_THRESHOLD,
}: AssessOpportunityInput): OpportunityAssessment {
  const evidenceStrength = getEvidenceStrength(candidate);
  const timingScore = getTimingScore(candidate);
  const buyingIntentScore = getBuyingIntentScore(candidate);
  const confidence = clampScore(
    evidenceStrength * 0.7 + (candidate.icp_fit_score ?? 0) * 0.3,
  );
  const positiveFactors = buildPositiveFactors(candidate);
  const negativeFactors = buildNegativeFactors(candidate);
  const missingInformation = buildMissingInformation(candidate);
  let opportunityType = getOpportunityType(candidate);
  let score = clampScore(
    evidenceStrength * 0.32 +
      timingScore * 0.28 +
      buyingIntentScore * 0.25 +
      candidate.icp_fit_score * 0.15,
  );

  if (hasEvergreenDominance(candidate)) {
    opportunityType = "evergreen_content";
    score = Math.min(score, 45);
  }

  const hasValidBuyerCompanyIdentity = !looksLikeJobTitleOrLocationShell(
    candidate.company_name,
  );

  if (!hasValidBuyerCompanyIdentity) {
    opportunityType = "no_actionable_opportunity";
    score = Math.min(score, 35);
  }

  const hasActionableReasoning =
    hasUsefulText(candidate.why_now) &&
    hasUsefulText(candidate.why_it_matters) &&
    hasUsefulText(candidate.signal_summary);
  const shouldCreateLead =
    score >= threshold &&
    hasValidBuyerCompanyIdentity &&
    (candidate.icp_fit_score ?? 0) >= MIN_READY_ICP_FIT_SCORE &&
    hasActionableReasoning &&
    opportunityType !== "evergreen_content" &&
    opportunityType !== "weak_context" &&
    opportunityType !== "no_actionable_opportunity";
  const recommendedAction = getRecommendedAction({
    shouldCreateLead,
    score,
    opportunityType,
  });

  return {
    should_create_lead: shouldCreateLead,
    opportunity_score: score,
    opportunity_type: opportunityType,
    urgency: getUrgency(score),
    business_reasoning: shouldCreateLead
      ? (candidate.why_it_matters ?? "")
      : negativeFactors[0] ??
        "The available evidence does not show a strong enough commercial opportunity.",
    why_now: candidate.why_now ?? "",
    why_this_company:
      candidate.signal_summary ??
      `${candidate.company_name} matched the discovery pipeline, but the specific business change is unclear.`,
    evidence_strength: evidenceStrength,
    confidence,
    positive_factors: positiveFactors,
    negative_factors: negativeFactors,
    missing_information: missingInformation,
    recommended_action: recommendedAction,
  };
}
