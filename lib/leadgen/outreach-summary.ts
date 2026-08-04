import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  getBusinessDayRange,
  getDailySendStats,
  getOutreachWorkingSet,
  type QueueRow,
} from "@/lib/leadgen/outreach-storage";
import {
  getFollowups,
  getFollowupSummary,
} from "@/lib/leadgen/followup-storage";
import { isTechnicalEmailArtifact } from "@/lib/leadgen/outreach-working-set";
import {
  countCanonicalStatuses,
  isGeneratedOutreachStatus,
  validateOutreachSummary,
  type OutreachSummary,
} from "@/lib/leadgen/outreach-summary-model";

function countKinds(rows: QueueRow[], kind: "initial" | "follow_up") {
  return rows.filter((row) => row.message_kind === kind).length;
}

export async function getOutreachSummary(
  campaignId: string,
): Promise<OutreachSummary> {
  const supabase = createSupabaseServerClient();
  const { start, end } = getBusinessDayRange();
  const [
    workingSet,
    followups,
    followupSummary,
    daily,
    campaignResult,
    sentResult,
    queuedResult,
  ] = await Promise.all([
    getOutreachWorkingSet(campaignId),
    getFollowups(campaignId),
    getFollowupSummary(campaignId),
    getDailySendStats(),
    supabase
      .from("leadgen_campaigns")
      .select("production_discovery_stats")
      .eq("id", campaignId)
      .maybeSingle<{ production_discovery_stats: Record<string, unknown> | null }>(),
    supabase
      .from("leadgen_outreach_queue")
      .select("message_kind")
      .eq("status", "sent")
      .gte("sent_at", start.toISOString())
      .lt("sent_at", end.toISOString())
      .returns<QueueRow[]>(),
    supabase
      .from("leadgen_outreach_queue")
      .select("message_kind")
      .in("status", ["queued", "sending"])
      .lt("next_attempt_at", end.toISOString())
      .returns<QueueRow[]>(),
  ]);
  if (campaignResult.error) throw campaignResult.error;
  if (sentResult.error) throw sentResult.error;
  if (queuedResult.error) throw queuedResult.error;

  const initialCounters = countCanonicalStatuses(workingSet.entries);
  const activeFollowups = followups.filter((entry) =>
    isGeneratedOutreachStatus(entry.status),
  );
  const followupCounters = countCanonicalStatuses(activeFollowups);
  const discoveryStats = campaignResult.data?.production_discovery_stats;
  const rawCandidateCount =
    discoveryStats?.qualified_candidates_found ??
    discoveryStats?.new_unique_companies;
  const candidateCount =
    typeof rawCandidateCount === "number"
      ? rawCandidateCount
      : workingSet.entries.length + workingSet.skipped_companies.length;
  const sentRows = (sentResult.data ?? []) as QueueRow[];
  const queuedRows = (queuedResult.data ?? []) as QueueRow[];

  const base: Omit<OutreachSummary, "diagnostics"> = {
    campaignId,
    initial: {
      ...initialCounters,
      candidates: candidateCount,
      workingEmails: workingSet.entries.filter(
        (entry) => !isTechnicalEmailArtifact(entry.email),
      ).length,
      generated: workingSet.entries.length,
      skipped: workingSet.skipped_companies.length,
      eligibleForBulkApproval:
        workingSet.eligible_for_bulk_approval_count,
    },
    followUps: {
      ...followupCounters,
      candidates: followupSummary.eligibility_diagnostics.length,
      generated: activeFollowups.length,
      eligible: followupSummary.eligible,
      unavailableNow: followupSummary.eligibility_diagnostics.filter(
        (item) => !item.eligible,
      ).length,
      eligibleForBulkApproval:
        followupSummary.eligible_for_bulk_approval,
      approvalBlocked: Math.max(
        0,
        followupCounters.needsReview -
          followupSummary.eligible_for_bulk_approval,
      ),
    },
    today: {
      initialQueued: countKinds(queuedRows, "initial"),
      initialSent: countKinds(sentRows, "initial"),
      followUpQueued: countKinds(queuedRows, "follow_up"),
      followUpSent: countKinds(sentRows, "follow_up"),
      totalQueued: queuedRows.length,
      totalSent: sentRows.length,
      dailyLimit: daily.dailyLimit,
      dailyRemaining: daily.remaining,
      dailyAvailableToQueue: daily.availableToQueue,
    },
  };
  const issues = validateOutreachSummary(base);
  if (issues.length > 0) {
    console.error("[leadgen:outreach-summary] invariant violation", {
      campaignId,
      issues,
      initial: base.initial,
      followUps: base.followUps,
      today: base.today,
    });
  }

  return {
    ...base,
    diagnostics: {
      healthy: issues.length === 0,
      issues,
    },
  };
}
