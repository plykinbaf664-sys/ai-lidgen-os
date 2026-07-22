import { NextRequest, NextResponse } from "next/server";
import {
  getCampaignDetails,
  getCampaignDetailsByPipelineRunId,
} from "@/lib/leadgen/storage";
import { normalizeLeadgenStrings } from "@/lib/leadgen/text-normalization";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function GET(request: NextRequest) {
  try {
    const pipelineRunId = request.nextUrl.searchParams.get("pipelineRunId");
    const id = request.nextUrl.searchParams.get("id");
    if (!pipelineRunId && !id) {
      return NextResponse.json(
        { success: false, error: "ID кампании не указан." },
        { status: 400 },
      );
    }

    const details = pipelineRunId
      ? await getCampaignDetailsByPipelineRunId(pipelineRunId)
      : await getCampaignDetails(id!);
    if (!details) {
      return NextResponse.json(
        { success: false, error: "Кампания не найдена." },
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
