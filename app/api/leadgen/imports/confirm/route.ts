import { NextResponse } from "next/server";
import { confirmImportPreview } from "@/lib/leadgen/contact-import-store";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  isAuthorizedLeadSourceRequest,
  leadSourceContoursEnabled,
} from "@/lib/leadgen/lead-source-security";

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!leadSourceContoursEnabled()) {
    return NextResponse.json(
      {
        success: false,
        code: "source_contours_not_enabled",
        error: "Новые источники находятся в review-режиме; импорт не сохранён.",
      },
      { status: 409 },
    );
  }
  try {
    const body = (await request.json()) as { previewId?: string };
    if (!body.previewId) {
      return NextResponse.json({ success: false, error: "previewId обязателен." }, { status: 400 });
    }
    const result = await confirmImportPreview(body.previewId);
    return NextResponse.json({
      success: true,
      ...result,
      autoSend: false,
      nextStep: "ENRICHMENT",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 400 },
    );
  }
}

