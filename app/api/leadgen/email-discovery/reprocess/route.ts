import { NextResponse } from "next/server";
import { reprocessLatestCampaignEmailDiscovery } from "@/lib/leadgen/email-discovery-reprocess";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean;
    };
    const result = await reprocessLatestCampaignEmailDiscovery({
      dryRun: body.dryRun !== false,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(
          error,
          "Не удалось повторно выполнить Email Discovery.",
        ),
      },
      { status: 500 },
    );
  }
}
