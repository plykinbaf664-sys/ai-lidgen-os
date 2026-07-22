import { NextRequest, NextResponse } from "next/server";
import {
  getOutreachOperationalState,
  getOutreachQueue,
  getDailySendStats,
  syncOutreachQueue,
} from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

const errorText = (error: unknown) => formatUnknownError(error);

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const [entries, daily] = await Promise.all([
      getOutreachQueue({ campaignId }),
      getDailySendStats(),
    ]);
    return NextResponse.json({
      success: true,
      entries,
      operational: await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
      },
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
    const [entries, daily] = await Promise.all([
      syncOutreachQueue(campaignId),
      getDailySendStats(),
    ]);
    return NextResponse.json({
      success: true,
      entries,
      operational: await getOutreachOperationalState(entries),
      daily: {
        sent_today: daily.sentToday,
        daily_limit: daily.dailyLimit,
        daily_remaining: daily.availableToQueue,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorText(error) }, { status: 500 });
  }
}
