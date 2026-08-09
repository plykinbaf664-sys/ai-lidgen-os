import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachOperationalState,
  getOutreachQueue,
  getOutreachWorkingSet,
  getDailySendStats,
  syncOutreachQueue,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { getOutreachSummary } from "@/lib/leadgen/outreach-summary";

const errorText = (error: unknown) => formatUnknownError(error);

function lazyEntry<T extends { body: string }>(entry: T): T {
  return {
    ...entry,
    body: entry.body.length > 240 ? `${entry.body.slice(0, 240)}…` : entry.body,
  };
}

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const [workingSet, daily, summary] = await Promise.all([
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
      getDailySendStats(),
      campaignId ? getOutreachSummary(campaignId) : Promise.resolve(null),
    ]);
    const entries = workingSet.entries.map(lazyEntry);
    return NextResponse.json({
      success: true,
      entries,
      working_set: { ...workingSet, entries },
      operational: await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
        queued_for_today: daily.queuedForToday,
      },
      summary,
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
    const [workingSet, daily, summary] = await Promise.all([
      getOutreachWorkingSet(campaignId),
      getDailySendStats(),
      getOutreachSummary(campaignId),
    ]);
    const entries = workingSet.entries.map(lazyEntry);
    return NextResponse.json({
      success: true,
      entries,
      working_set: { ...workingSet, entries },
      operational: await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
        queued_for_today: daily.queuedForToday,
      },
      summary,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorText(error) }, { status: 500 });
  }
}
