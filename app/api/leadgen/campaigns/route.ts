import { NextResponse } from "next/server";
import { getRecentCampaigns } from "@/lib/leadgen/storage";
import { normalizeLeadgenStrings } from "@/lib/leadgen/text-normalization";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { cleanupTechnicalLeadgenData } from "@/lib/leadgen/technical-cleanup";

export async function GET() {
  try {
    await cleanupTechnicalLeadgenData();
    const campaigns = normalizeLeadgenStrings(
      await getRecentCampaigns(100),
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
