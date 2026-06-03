import { NextResponse } from "next/server";
import { getRecentCampaigns } from "@/lib/leadgen/storage";

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

export async function GET() {
  try {
    const campaigns = await getRecentCampaigns();

    return NextResponse.json({
      success: true,
      campaigns,
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
