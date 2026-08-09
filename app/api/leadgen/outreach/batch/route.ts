import { after, NextResponse } from "next/server";
import {
  getDailySendStats,
  scheduleApprovedBatch,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";
import {
  getLocalDailySendStats,
  getLocalOutreachOperationalState,
  getOutreachDeliveryStorageMode,
  listLocalOutreachEntries,
  scheduleLocalApprovedBatch,
} from "@/lib/leadgen/local-outreach-store";
import { runLocalOutreachProcessorIteration } from "@/lib/leadgen/local-outreach-scheduler";
import type { OutreachQueueEntry } from "@/lib/leadgen/types";

export async function GET(request: Request) {
  if (getOutreachDeliveryStorageMode() !== "local") {
    return NextResponse.json(
      { success: false, error: "Локальная очередь отключена." },
      { status: 409 },
    );
  }
  const campaignId = new URL(request.url).searchParams.get("campaignId");
  const [entries, daily, operational] = await Promise.all([
    listLocalOutreachEntries(campaignId),
    getLocalDailySendStats(),
    getLocalOutreachOperationalState(campaignId),
  ]);
  if (entries.some((entry) => entry.status === "queued")) {
    after(async () => {
      await runLocalOutreachProcessorIteration();
    });
  }
  return NextResponse.json({
    success: true,
    storage_mode: "local",
    entries,
    operational,
    daily: {
      sent_today: daily.sentToday,
      daily_limit: daily.dailyLimit,
      daily_remaining: daily.availableToQueue,
      queued_for_today: daily.queuedForToday,
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      campaignId?: string | null;
      count?: number;
      entries?: OutreachQueueEntry[];
      sentToday?: number;
      messageKind?: "initial" | "follow_up";
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
    if (getOutreachDeliveryStorageMode() === "local") {
      if (!Array.isArray(body.entries)) {
        return NextResponse.json(
          {
            success: false,
            error: "Для локальной очереди не переданы одобренные письма.",
          },
          { status: 400 },
        );
      }
      const scheduled = await scheduleLocalApprovedBatch({
        entries: body.entries,
        campaignId: body.campaignId,
        requestedCount: Number(body.count),
        messageKind: body.messageKind ?? "initial",
        sentTodayBaseline: Number(body.sentToday ?? 0),
      });
      const daily = await getLocalDailySendStats();
      if (scheduled.queued_count > 0) {
        after(async () => {
          await runLocalOutreachProcessorIteration();
        });
      }
      return NextResponse.json({
        success: true,
        storage_mode: "local",
        ...scheduled,
        operational: await getLocalOutreachOperationalState(body.campaignId),
        processor: { status: "starting", entry: null },
        daily: {
          sent_today: daily.sentToday,
          daily_limit: daily.dailyLimit,
          daily_remaining: daily.availableToQueue,
          queued_for_today: daily.queuedForToday,
        },
      });
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
      storage_mode: "supabase",
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
