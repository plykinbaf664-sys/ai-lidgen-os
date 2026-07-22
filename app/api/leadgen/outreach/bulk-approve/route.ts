import { NextResponse } from "next/server";
import { bulkApproveOutreach } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { campaignId?: string; execute?: boolean };
    if (!body.campaignId) return NextResponse.json({ success: false, error: "campaignId обязателен" }, { status: 400 });
    return NextResponse.json({ success: true, ...(await bulkApproveOutreach(body.campaignId, body.execute === true)) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
