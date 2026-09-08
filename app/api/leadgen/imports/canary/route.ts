import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { runImportEnrichmentCanary } from "@/lib/leadgen/import-enrichment-canary";
import {
  isAuthorizedLeadSourceRequest,
  leadSourceContoursEnabled,
} from "@/lib/leadgen/lead-source-security";
import { saveSourceCanaryMetrics } from "@/lib/leadgen/source-canary-store";
import { isLeadgenVerticalId } from "@/lib/leadgen/verticals";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!leadSourceContoursEnabled()) {
    return NextResponse.json(
      { success: false, error: "Source contours are disabled." },
      { status: 409 },
    );
  }
  try {
    const body = (await request.json()) as { batchId?: string; verticalId?: string };
    if (!body.batchId || !isLeadgenVerticalId(body.verticalId)) {
      return NextResponse.json(
        { success: false, error: "batchId и корректный verticalId обязательны." },
        { status: 400 },
      );
    }
    const result = await runImportEnrichmentCanary({
      batchId: body.batchId,
      verticalId: body.verticalId,
    });
    await saveSourceCanaryMetrics({
      origin: "IMPORTED",
      candidates: result.metrics.newCandidates,
      qualified: result.metrics.icpMatch,
      ready: result.metrics.ready,
      sampleSize: result.metrics.rows,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 400 },
    );
  }
}
