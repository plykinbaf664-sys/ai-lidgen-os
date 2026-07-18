import { NextResponse } from "next/server";
import { syncOutreachQueue } from "@/lib/leadgen/outreach-storage";

export async function POST(request: Request) {
  try {
    const { campaignId } = (await request.json()) as { campaignId?: string };
    if (!campaignId) {
      return NextResponse.json({ success: false, error: "campaignId обязателен" }, { status: 400 });
    }
    return NextResponse.json({ success: true, entries: await syncOutreachQueue(campaignId) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
