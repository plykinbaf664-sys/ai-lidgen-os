import type {
  LeadReadyCandidate,
  LeadReadyContactType,
  LeadReadinessStatus,
} from "@/lib/leadgen/types";

function clampScore(value: number): number {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function getContactReadinessScore(
  contactType: LeadReadyContactType,
  verified: boolean,
): number {
  if (contactType === "work_email" && verified) {
    return 100;
  }

  if (contactType === "generic_email") {
    return 55;
  }

  return 0;
}

function getDecisionAuthorityScore(candidate: LeadReadyCandidate): number {
  if (candidate.person.decision_authority === "high") {
    return 90;
  }

  if (candidate.person.decision_authority === "medium") {
    return 65;
  }

  if (candidate.person.decision_authority === "low") {
    return 35;
  }

  const role = candidate.person.role_title?.toLowerCase() ?? "";

  if (
    /founder|owner|ceo|general director|chief executive|генеральный директор|основатель|владелец/.test(
      role,
    )
  ) {
    return 90;
  }

  if (/director|head|vp|руководитель|директор|роп/.test(role)) {
    return 68;
  }

  return candidate.person.full_name ? 45 : 0;
}

function getReadinessStatus({
  candidate,
  contactReadiness,
  decisionAuthority,
}: {
  candidate: LeadReadyCandidate;
  contactReadiness: number;
  decisionAuthority: number;
}): { status: LeadReadinessStatus; reason: string } {
  const hasCompany = Boolean(candidate.company.name);
  const hasPerson = Boolean(candidate.person.full_name);
  const hasSignal = candidate.signal.strength >= 45 || Boolean(candidate.signal.why_now);
  const hasVerifiedDirectContact =
    contactReadiness >= 80 && Boolean(candidate.contact.value);
  const hasFallbackContact =
    candidate.contact.type === "generic_email" &&
    Boolean(candidate.contact.value);
  const providersAttempted = candidate.providers_used.length > 0;

  if (!hasCompany) {
    return {
      status: "rejected",
      reason: "No usable company identity was found.",
    };
  }

  if (hasVerifiedDirectContact && hasPerson && hasSignal) {
    return {
      status: "outreach_ready",
      reason: "Confirmed person, direct contact channel, and signal are present.",
    };
  }

  if (hasVerifiedDirectContact && !hasSignal) {
    return {
      status: "enrichment_required",
      reason:
        "Reachable contact exists, but no why-now signal is attached yet.",
    };
  }

  if (hasVerifiedDirectContact && hasSignal) {
    return {
      status: "outreach_ready",
      reason: "Direct contact channel and signal are present.",
    };
  }

  if (hasFallbackContact && hasSignal) {
    return {
      status: "fallback_ready",
      reason:
        "Only a company-level fallback channel is available; direct person contact was not confirmed.",
    };
  }

  if (hasPerson && !hasVerifiedDirectContact && providersAttempted) {
    return {
      status: "enrichment_required",
      reason:
        "Confirmed person exists, but no reachable direct channel was found yet.",
    };
  }

  if (!hasPerson && hasSignal && candidate.company.domain) {
    return {
      status: "enrichment_required",
      reason: "Company and signal exist, but person/contact enrichment is missing.",
    };
  }

  if (hasPerson && !hasFallbackContact && providersAttempted) {
    return {
      status: "manual_research_required",
      reason:
        "Person was verified, but automatic configured sources did not produce a reachable channel.",
    };
  }

  if (decisionAuthority === 0 && candidate.scores.icp_fit < 35) {
    return {
      status: "rejected",
      reason: "Candidate has weak ICP fit and no confirmed decision maker.",
    };
  }

  return {
    status: "provider_exhausted",
    reason:
      "Configured discovery providers and search strategies did not produce a reachable channel.",
  };
}

export function assessLeadReadiness(
  candidate: LeadReadyCandidate,
): LeadReadyCandidate {
  const contactReadiness = getContactReadinessScore(
    candidate.contact.type,
    candidate.contact.verified,
  );
  const decisionAuthority = getDecisionAuthorityScore(candidate);
  const signalStrength = clampScore(candidate.signal.strength);
  const icpFit = clampScore(candidate.scores.icp_fit);
  const overall = clampScore(
    contactReadiness * 0.38 +
      decisionAuthority * 0.24 +
      signalStrength * 0.24 +
      icpFit * 0.14,
  );
  const { status, reason } = getReadinessStatus({
    candidate,
    contactReadiness,
    decisionAuthority,
  });

  return {
    ...candidate,
    scores: {
      ...candidate.scores,
      contact_readiness: contactReadiness,
      signal_strength: signalStrength,
      decision_authority: decisionAuthority,
      overall,
    },
    readiness_status: status,
    readiness_reason: reason,
  };
}
