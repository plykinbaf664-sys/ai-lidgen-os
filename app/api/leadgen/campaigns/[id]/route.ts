import { NextResponse } from "next/server";
import { getCampaignDetails } from "@/lib/leadgen/storage";

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

type CampaignDetailsRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: CampaignDetailsRouteContext,
) {
  try {
    const { id } = await params;
    const details = await getCampaignDetails(id);

    if (!details) {
      return NextResponse.json(
        {
          success: false,
          error: "Кампания не найдена",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      details,
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
