import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachOperationalState,
  getOutreachQueue,
  getOutreachWorkingSet,
  getDailySendStats,
  repairLegacyTruncatedOutreachBodies,
  syncOutreachQueue,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { getOutreachSummary } from "@/lib/leadgen/outreach-summary";
import {
  getLocalDailySendStats,
  getLocalOutreachOperationalState,
  getOutreachDeliveryStorageMode,
  listLocalOutreachEntries,
} from "@/lib/leadgen/local-outreach-store";
import { countCanonicalStatuses } from "@/lib/leadgen/outreach-summary-model";
import type { OutreachQueueEntry } from "@/lib/leadgen/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const errorText = (error: unknown) => formatUnknownError(error);

function mergeLocalDeliveryEntries(
  source: Awaited<ReturnType<typeof getOutreachWorkingSet>>["entries"],
  local: Awaited<ReturnType<typeof listLocalOutreachEntries>>,
) {
  const byId = new Map<string, OutreachQueueEntry>(
    source.map((entry) => [entry.id, entry]),
  );
  for (const entry of local) {
    if (entry.message_kind !== "follow_up") byId.set(entry.id, entry);
  }
  return [...byId.values()];
}

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const localMode = getOutreachDeliveryStorageMode() === "local";
    if (campaignId) await repairLegacyTruncatedOutreachBodies(campaignId);
    const [workingSet, daily, summary, localEntries] = await Promise.all([
      campaignId
        ? getOutreachWorkingSet(campaignId)
        : getOutreachQueue().then((entries) => ({
            entries,
            skipped_companies: [],
            eligible_for_bulk_approval_count: entries.filter(
              (entry) =>
                entry.status === "needs_review" &&
                entry.quality_gate_passed === true &&
                entry.copy_review_status !== "needs_manual_copy_review" &&
                !entry.last_error,
            ).length,
            counters: {
              total: entries.length,
              needs_review: entries.filter((entry) => entry.status === "needs_review").length,
              approved: entries.filter((entry) => entry.status === "approved").length,
              queued: entries.filter((entry) => entry.status === "queued").length,
              sending: entries.filter((entry) => entry.status === "sending").length,
              sent: entries.filter((entry) => entry.status === "sent").length,
              failed: entries.filter((entry) => entry.status === "failed").length,
            },
          })),
      localMode ? getLocalDailySendStats() : getDailySendStats(),
      campaignId ? getOutreachSummary(campaignId) : Promise.resolve(null),
      localMode ? listLocalOutreachEntries(campaignId) : Promise.resolve([]),
    ]);
    const queuedTotal =
      "queuedTotal" in daily ? daily.queuedTotal : daily.queuedForToday;
    const entries = localMode
      ? mergeLocalDeliveryEntries(workingSet.entries, localEntries)
      : workingSet.entries;
    const canonicalSummary =
      localMode && summary
        ? {
            ...summary,
            initial: {
              ...summary.initial,
              ...countCanonicalStatuses(entries),
              generated: entries.length,
              workingEmails: entries.filter((entry) => entry.email.trim()).length,
              eligibleForBulkApproval: entries.filter(
                (entry) =>
                  entry.status === "needs_review" &&
                  entry.quality_gate_passed === true &&
                  entry.copy_review_status !== "needs_manual_copy_review" &&
                  !entry.last_error,
              ).length,
            },
            today: {
              ...summary.today,
              initialQueued: daily.queuedForToday,
              initialSent: daily.sentToday,
              totalQueued: daily.queuedForToday + summary.today.followUpQueued,
              totalSent: daily.sentToday + summary.today.followUpSent,
              dailyLimit: daily.dailyLimit,
              dailyRemaining: daily.remaining,
              dailyAvailableToQueue: daily.availableToQueue,
            },
          }
        : summary;
    return NextResponse.json({
      success: true,
      entries,
      working_set: { ...workingSet, entries },
      operational: localMode
        ? await getLocalOutreachOperationalState(campaignId)
        : await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
        queued_total: queuedTotal,
        queued_for_today: daily.queuedForToday,
      },
      summary: canonicalSummary,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorText(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = (await request.json()) as { campaignId?: string };
    if (!campaignId) {
      return NextResponse.json({ success: false, error: "campaignId обязателен" }, { status: 400 });
    }
    await syncOutreachQueue(campaignId);
    const localMode = getOutreachDeliveryStorageMode() === "local";
    const [workingSet, daily, summary, localEntries] = await Promise.all([
      getOutreachWorkingSet(campaignId),
      localMode ? getLocalDailySendStats() : getDailySendStats(),
      getOutreachSummary(campaignId),
      localMode ? listLocalOutreachEntries(campaignId) : Promise.resolve([]),
    ]);
    const queuedTotal =
      "queuedTotal" in daily ? daily.queuedTotal : daily.queuedForToday;
    const entries = localMode
      ? mergeLocalDeliveryEntries(workingSet.entries, localEntries)
      : workingSet.entries;
    const canonicalSummary =
      localMode
        ? {
            ...summary,
            initial: {
              ...summary.initial,
              ...countCanonicalStatuses(entries),
              generated: entries.length,
              workingEmails: entries.filter((entry) => entry.email.trim()).length,
              eligibleForBulkApproval: entries.filter(
                (entry) =>
                  entry.status === "needs_review" &&
                  entry.quality_gate_passed === true &&
                  entry.copy_review_status !== "needs_manual_copy_review" &&
                  !entry.last_error,
              ).length,
            },
            today: {
              ...summary.today,
              initialQueued: daily.queuedForToday,
              initialSent: daily.sentToday,
              totalQueued: daily.queuedForToday + summary.today.followUpQueued,
              totalSent: daily.sentToday + summary.today.followUpSent,
              dailyLimit: daily.dailyLimit,
              dailyRemaining: daily.remaining,
              dailyAvailableToQueue: daily.availableToQueue,
            },
          }
        : summary;
    return NextResponse.json({
      success: true,
      entries,
      working_set: { ...workingSet, entries },
      operational: localMode
        ? await getLocalOutreachOperationalState(campaignId)
        : await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
        queued_total: queuedTotal,
        queued_for_today: daily.queuedForToday,
      },
      summary: canonicalSummary,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorText(error) }, { status: 500 });
  }
}
