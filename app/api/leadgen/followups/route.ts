import { NextRequest, NextResponse } from "next/server";
import { getDailySendStats } from "@/lib/leadgen/outreach-storage";
import { getFollowups, getFollowupSummary } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    const [entries, summary, daily] = await Promise.all([
      getFollowups(campaignId), getFollowupSummary(), getDailySendStats(),
    ]);
    return NextResponse.json({ success: true, entries, summary, daily: {
      sent_today: daily.sentToday, daily_limit: daily.dailyLimit,
      daily_remaining: daily.availableToQueue,
    } });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
