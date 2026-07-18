import { NextResponse } from "next/server";
import { scheduleApprovedBatch } from "@/lib/leadgen/outreach-storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { campaignId?: string; count?: number };
    if (!body.campaignId || !Number.isInteger(body.count) || Number(body.count) < 1) {
      return NextResponse.json({ success: false, error: "Некорректный batch" }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      ...(await scheduleApprovedBatch({ campaignId: body.campaignId, requestedCount: Number(body.count) })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
