import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { revalidateRecentCommercialSignals } from "@/lib/leadgen/signals/commercial-signal-revalidation";

type RevalidationRequest = {
  limit?: number;
  execute?: boolean;
  confirmation?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RevalidationRequest;
    const execute = body.execute === true;

    if (
      execute &&
      body.confirmation !== "revalidate-commercial-signals"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Для записи результата требуется явное подтверждение revalidate-commercial-signals.",
        },
        { status: 400 },
      );
    }

    const result = await revalidateRecentCommercialSignals({
      limit: body.limit,
      execute,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(error),
      },
      { status: 500 },
    );
  }
}
