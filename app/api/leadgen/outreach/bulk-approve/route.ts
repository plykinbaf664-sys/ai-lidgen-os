import { NextResponse } from "next/server";
import { bulkApproveOutreach } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { getOutreachSummary } from "@/lib/leadgen/outreach-summary";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { campaignId?: string; execute?: boolean };
    if (!body.campaignId) return NextResponse.json({ success: false, error: "campaignId обязателен" }, { status: 400 });
    const result = await bulkApproveOutreach(
      body.campaignId,
      body.execute === true,
    );
    return NextResponse.json({
      success: true,
      ...result,
      summary:
        body.execute === true
          ? await getOutreachSummary(body.campaignId)
          : undefined,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
