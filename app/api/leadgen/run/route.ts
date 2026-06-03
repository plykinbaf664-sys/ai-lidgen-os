import { NextResponse } from "next/server";
import { runMockPipeline } from "@/lib/leadgen/mock-pipeline";
import { savePipelineResult } from "@/lib/leadgen/storage";
import { prepareTelegramNotification } from "@/lib/leadgen/telegram-notification";
import type { CampaignInput } from "@/lib/leadgen/types";

type RunLeadgenRequestBody = Partial<CampaignInput>;

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    return JSON.stringify({
      message: maybeError.message,
      code: maybeError.code,
      details: maybeError.details,
      hint: maybeError.hint,
    });
  }

  return String(error);
}

async function readCampaignInput(request: Request): Promise<CampaignInput> {
  const body = (await request.json().catch(() => ({}))) as RunLeadgenRequestBody;

  return {
    name: body.name?.trim() || "Тестовая кампания Leadgen OS",
    requestedBy: body.requestedBy?.trim() || "api/leadgen/run",
  };
}

export async function POST(request: Request) {
  try {
    const campaignInput = await readCampaignInput(request);
    const result = runMockPipeline(campaignInput);
    const notifications = result.leads.map(prepareTelegramNotification);
    const saved = await savePipelineResult({ result, notifications });

    return NextResponse.json({
      success: true,
      pipeline_run_id: result.campaign.pipeline_run_id,
      campaign: result.campaign,
      leads: result.leads,
      events: result.events,
      notifications,
      saved,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatRouteError(error),
      },
      { status: 500 },
    );
  }
}
