import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  isAuthorizedLeadSourceRequest,
  leadSourceOriginEnabled,
} from "@/lib/leadgen/lead-source-security";
import { runAiHiringCampaign } from "@/lib/leadgen/source-campaign-runner";
import { isLeadgenVerticalId } from "@/lib/leadgen/verticals";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json(
      { success: false, code: "AUTH_REQUIRED", error: "Требуется защищённая сессия." },
      { status: 401 },
    );
  }
  if (!leadSourceOriginEnabled("AI_HIRING")) {
    return NextResponse.json(
      { success: false, code: "SOURCE_DISABLED", error: "Поиск по прямой потребности в AI временно отключён." },
      { status: 409 },
    );
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      requestedBy?: string;
      verticalId?: string;
    };
    if (!isLeadgenVerticalId(body.verticalId)) {
      return NextResponse.json(
        { success: false, code: "INVALID_SEGMENT", error: "Выберите сегмент." },
        { status: 400 },
      );
    }
    const result = await runAiHiringCampaign({
      input: {
        name: body.name?.trim() || "Компании с прямой потребностью в AI",
        requestedBy: body.requestedBy?.trim() || "Оператор Leadgen OS",
        verticalId: body.verticalId,
      },
      signal: request.signal,
    });
    return NextResponse.json({
      success: true,
      campaign: result.campaign,
      metrics: result.live.metrics,
      companies: result.result.companies.length,
      contacts: result.result.contacts.length,
      ready: result.queue.length,
      review: {
        accepted: result.live.accepted,
        rejected: result.live.rejected,
      },
      smtpCalls: 0,
    });
  } catch (error) {
    const message = formatUnknownError(error, "Не удалось завершить поиск по прямой потребности в AI.");
    const timeout = /timeout|timed out|abort/i.test(message);
    return NextResponse.json(
      { success: false, code: timeout ? "SEARCH_TIMEOUT" : "INTERNAL_ERROR", error: message },
      { status: timeout ? 504 : 500 },
    );
  }
}
