import { NextResponse } from "next/server";
import { runLeadDiscoveryEngine } from "@/lib/leadgen/lead-discovery-engine";
import { TavilySearchProvider } from "@/lib/leadgen/search/tavily-provider";
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

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "TAVILY_API_KEY is not configured. Real lead discovery was not started and no mock campaign was created.",
        },
        { status: 500 },
      );
    }

    const result = await runLeadDiscoveryEngine({
      campaignInput,
      searchProvider: new TavilySearchProvider(),
    });
    const notifications = result.leads.map(prepareTelegramNotification);
    const saved = await savePipelineResult({ result, notifications });

    return NextResponse.json({
      success: true,
      pipeline_run_id: result.campaign.pipeline_run_id,
      campaign: result.campaign,
      companies: result.companies,
      leads: result.leads,
      signals: result.signals,
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
