import { NextResponse } from "next/server";
import { processNextOutreachItem } from "@/lib/leadgen/outreach-processor";
import {
  getDailySendStats,
  scheduleApprovedBatch,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      campaignId?: string | null;
      count?: number;
    };
    if (
      !Number.isInteger(body.count) ||
      Number(body.count) < 1 ||
      Number(body.count) > 20
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
    let processor:
      | Awaited<ReturnType<typeof processNextOutreachItem>>
      | { status: "error"; entry: null; error: string } = {
      status: "idle",
      entry: null,
    };

    if (scheduled.queued.length > 0) {
      try {
        processor = await processNextOutreachItem();
      } catch (error) {
        processor = {
          status: "error",
          entry: null,
          error: formatUnknownError(error),
        };
      }
    }
    const daily = await getDailySendStats();

    return NextResponse.json({
      success: true,
      ...scheduled,
      processor,
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
