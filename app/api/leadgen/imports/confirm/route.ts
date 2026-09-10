import { NextResponse } from "next/server";
import { confirmImportPreview } from "@/lib/leadgen/contact-import-store";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  isAuthorizedLeadSourceRequest,
  leadSourceOriginEnabled,
} from "@/lib/leadgen/lead-source-security";
import { runImportedCampaign } from "@/lib/leadgen/source-campaign-runner";
import { isLeadgenVerticalId } from "@/lib/leadgen/verticals";

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!leadSourceOriginEnabled("IMPORTED")) {
    return NextResponse.json(
      {
        success: false,
        code: "source_contours_not_enabled",
        error: "Загрузка собственной базы временно отключена.",
      },
      { status: 409 },
    );
  }
  try {
    const body = (await request.json()) as {
      previewId?: string;
      verticalId?: string;
      name?: string;
      requestedBy?: string;
    };
    if (!body.previewId) {
      return NextResponse.json({ success: false, error: "previewId обязателен." }, { status: 400 });
    }
    if (!isLeadgenVerticalId(body.verticalId)) {
      return NextResponse.json(
        { success: false, code: "INVALID_SEGMENT", error: "Выберите сегмент." },
        { status: 400 },
      );
    }
    const result = await confirmImportPreview(body.previewId);
    if (result.status === "DUPLICATE") {
      return NextResponse.json({
        success: true,
        ...result,
        autoSend: false,
        duplicate: true,
      });
    }
    const processed = await runImportedCampaign({
      batchId: result.batchId,
      input: {
        name: body.name?.trim() || "Кампания из собственной базы",
        requestedBy: body.requestedBy?.trim() || "Оператор Leadgen OS",
        verticalId: body.verticalId,
      },
      signal: request.signal,
    });
    return NextResponse.json({
      success: true,
      ...result,
      autoSend: false,
      nextStep: "REVIEW",
      campaign: processed.campaign,
      summary: processed.importSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 400 },
    );
  }
}
