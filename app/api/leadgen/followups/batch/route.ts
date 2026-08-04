import { after, NextResponse } from "next/server";
import { scheduleFollowupBatch } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      count?: number;
      campaignId?: string;
    };
    if (!Number.isInteger(body.count) || Number(body.count) < 1 || Number(body.count) > 20) {
      return NextResponse.json({ success: false, error: "Некорректный batch" }, { status: 400 });
    }
    const scheduled = await scheduleFollowupBatch(
      Number(body.count),
      body.campaignId || null,
    );
    if (scheduled.queued.length > 0) {
      after(async () => {
        await runOutreachProcessorIteration("follow_up");
      });
    }
    return NextResponse.json({
      success: true,
      ...scheduled,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
