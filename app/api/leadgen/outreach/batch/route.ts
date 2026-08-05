import { after, NextResponse } from "next/server";
import {
  getDailySendStats,
  scheduleApprovedBatch,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      campaignId?: string | null;
      count?: number;
    };
    if (
      !Number.isInteger(body.count) ||
      Number(body.count) < 1 ||
      Number(body.count) > leadgenProductionConfig.emailBatchSendLimit
    ) {
      return NextResponse.json(
        { success: false, error: "Некорректный batch" },
        { status: 400 },
      );
    }
    const scheduled = await scheduleApprovedBatch({
      campaignId: body.campaignId,
      requestedCount: Number(body.count),
    });
    const daily = await getDailySendStats();
    if (scheduled.queued_count > 0) {
      after(async () => {
        await runOutreachProcessorIteration("initial");
      });
    }

    return NextResponse.json({
      success: true,
      ...scheduled,
      // The response stays fast; the first processor iteration runs after it.
      // Further due items are handled by the local timer or production cron.
      processor: { status: "starting", entry: null },
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
        queued_for_today: daily.queuedForToday,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(error),
      },
      { status: 500 },
    );
  }
}
