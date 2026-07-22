import { NextResponse } from "next/server";
import { getRecentCampaigns } from "@/lib/leadgen/storage";
import { normalizeLeadgenStrings } from "@/lib/leadgen/text-normalization";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function GET() {
  try {
    const campaigns = normalizeLeadgenStrings(
      await getRecentCampaigns(),
      "api.campaigns.response",
    );

    return NextResponse.json({
      success: true,
      campaigns,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(error, "Не удалось загрузить историю кампаний."),
      },
      { status: 500 },
    );
  }
}
