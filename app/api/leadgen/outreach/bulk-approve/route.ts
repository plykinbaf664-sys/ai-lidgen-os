import { NextResponse } from "next/server";
import { bulkApproveOutreach } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

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
      // approved_ids drive the immediate UI reconciliation; the regular
      // refresh updates the complete summary outside this mutation request.
      summary: null,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
