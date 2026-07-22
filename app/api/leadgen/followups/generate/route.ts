import { NextResponse } from "next/server";
import { generateEligibleFollowups } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { campaignId?: string | null };
    return NextResponse.json({ success: true, ...(await generateEligibleFollowups(body.campaignId)) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
