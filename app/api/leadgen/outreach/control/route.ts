import { NextResponse } from "next/server";
import { cancelQueued, retryFailed, setQueuePaused } from "@/lib/leadgen/outreach-storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; campaignId?: string };
    if (body.action === "pause") await setQueuePaused(true);
    else if (body.action === "resume") await setQueuePaused(false);
    else if (body.action === "cancel") await cancelQueued(body.campaignId);
    else if (body.action === "retry") await retryFailed(body.campaignId);
    else return NextResponse.json({ success: false, error: "Неизвестное действие" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
