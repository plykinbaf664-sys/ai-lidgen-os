import { NextRequest, NextResponse } from "next/server";
import { getOutreachQueue, syncOutreachQueue } from "@/lib/leadgen/outreach-storage";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export async function GET(request: NextRequest) {
  try {
    const campaignId = request.nextUrl.searchParams.get("campaignId");
    return NextResponse.json({
      success: true,
      entries: await getOutreachQueue({ campaignId }),
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
    return NextResponse.json({
      success: true,
      entries: await syncOutreachQueue(campaignId),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: errorText(error) }, { status: 500 });
  }
}
