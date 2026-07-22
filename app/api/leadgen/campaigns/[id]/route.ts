import { NextResponse } from "next/server";
import { getCampaignDetails } from "@/lib/leadgen/storage";
import { normalizeLeadgenStrings } from "@/lib/leadgen/text-normalization";
import { formatUnknownError } from "@/lib/leadgen/error-format";

type CampaignDetailsRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: CampaignDetailsRouteContext,
) {
  try {
    const { id } = await params;
    const details = await getCampaignDetails(id);

    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: "Кампания не найдена",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      details: normalizeLeadgenStrings(details, "api.campaign_details.response"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(error, "Не удалось загрузить кампанию."),
      },
      { status: 500 },
    );
  }
}
