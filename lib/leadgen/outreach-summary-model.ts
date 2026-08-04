export type CanonicalOutreachStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "rejected";

export type OutreachStatusCounters = {
  draft: number;
  needsReview: number;
  approved: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  rejected: number;
};

export type OutreachSummary = {
  campaignId: string;
  initial: OutreachStatusCounters & {
    candidates: number;
    workingEmails: number;
    generated: number;
    skipped: number;
    eligibleForBulkApproval: number;
  };
  followUps: OutreachStatusCounters & {
    candidates: number;
    generated: number;
    eligible: number;
    unavailableNow: number;
    eligibleForBulkApproval: number;
    approvalBlocked: number;
  };
  today: {
    initialQueued: number;
    initialSent: number;
    followUpQueued: number;
    followUpSent: number;
    totalQueued: number;
    totalSent: number;
    dailyLimit: number;
    dailyRemaining: number;
    dailyAvailableToQueue: number;
  };
  diagnostics: {
    healthy: boolean;
    issues: string[];
  };
};

export function normalizeOutreachStatus(
  value: string,
): CanonicalOutreachStatus {
  if (value === "ready" || value === "ready_for_review") return "needs_review";
  if (value === "confirmed" || value === "accepted") return "approved";
  if (
    value === "company_email_ready" ||
    value === "personal_email_ready" ||
    value === "eligible" ||
    value === "generating"
  ) {
    return "draft";
  }
  if (
    value === "skipped" ||
    value === "cancelled" ||
    value === "paused" ||
    value === "replied" ||
    value === "completed" ||
    value === "follow_up_due"
  ) {
    return "rejected";
  }
  if (
    value === "draft" ||
    value === "needs_review" ||
    value === "approved" ||
    value === "queued" ||
    value === "sending" ||
    value === "sent" ||
    value === "failed" ||
    value === "rejected"
  ) {
    return value;
  }
  return "rejected";
}

export function countCanonicalStatuses(
  entries: Array<{ status: string }>,
): OutreachStatusCounters {
  const counters: OutreachStatusCounters = {
    draft: 0,
    needsReview: 0,
    approved: 0,
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    rejected: 0,
  };
  for (const entry of entries) {
    const status = normalizeOutreachStatus(entry.status);
    if (status === "needs_review") counters.needsReview += 1;
    else counters[status] += 1;
  }
  return counters;
}

export function isGeneratedOutreachStatus(status: string): boolean {
  return normalizeOutreachStatus(status) !== "rejected";
}

export function validateOutreachSummary(
  summary: Omit<OutreachSummary, "diagnostics">,
): string[] {
  const issues: string[] = [];
  for (const [kind, counters] of [
    ["initial", summary.initial],
    ["follow_up", summary.followUps],
  ] as const) {
    const accounted =
      counters.draft +
      counters.needsReview +
      counters.approved +
      counters.queued +
      counters.sending +
      counters.sent +
      counters.failed +
      counters.rejected;
    if (counters.approved > counters.generated) {
      issues.push(`${kind}: approved (${counters.approved}) > generated (${counters.generated})`);
    }
    if (accounted !== counters.generated) {
      issues.push(`${kind}: status total (${accounted}) != generated (${counters.generated})`);
    }
  }
  if (
    summary.today.totalSent !==
    summary.today.initialSent + summary.today.followUpSent
  ) {
    issues.push("today: totalSent does not equal initialSent + followUpSent");
  }
  if (
    summary.today.totalQueued !==
    summary.today.initialQueued + summary.today.followUpQueued
  ) {
    issues.push("today: totalQueued does not equal initialQueued + followUpQueued");
  }
  return issues;
}
