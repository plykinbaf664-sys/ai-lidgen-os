import { NextResponse } from "next/server";
import {
  approveFollowups,
  getFollowupSummary,
} from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      campaignId?: string;
      manual?: boolean;
    };
    const campaignId = body.campaignId || null;
    const result = await approveFollowups(
      undefined,
      campaignId,
      body.manual === true,
    );
    return NextResponse.json({
      success: true,
      ...result,
      summary: await getFollowupSummary(campaignId),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
