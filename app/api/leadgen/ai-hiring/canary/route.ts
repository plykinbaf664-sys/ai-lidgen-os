import { NextResponse } from "next/server";
import { runAiHiringLiveCanary } from "@/lib/leadgen/ai-hiring-live-canary";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { isAuthorizedLeadSourceRequest } from "@/lib/leadgen/lead-source-security";
import { saveSourceCanaryMetrics } from "@/lib/leadgen/source-canary-store";
import { isLeadgenVerticalId } from "@/lib/leadgen/verticals";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as { verticalId?: string };
    if (!isLeadgenVerticalId(body.verticalId)) {
      return NextResponse.json(
        { success: false, error: "Для canary требуется корректный verticalId." },
        { status: 400 },
      );
    }
    const result = await runAiHiringLiveCanary({
      verticalId: body.verticalId,
      signal: request.signal,
    });
    await saveSourceCanaryMetrics({
      origin: "AI_HIRING",
      candidates: result.metrics.companiesExtracted,
      qualified: result.metrics.icpMatch,
      ready: result.metrics.ready,
      sampleSize: result.metrics.jobsScanned,
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
