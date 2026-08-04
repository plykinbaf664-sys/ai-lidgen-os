import { NextResponse } from "next/server";
import { scanFollowupReplies } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST() {
  let stage = "scan";
  try {
    const result = await scanFollowupReplies();
    if (result.error) {
      return NextResponse.json(
        { success: false, ...result },
        { status: 503 },
      );
    }
    stage = "response";
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const record =
      typeof error === "object" && error !== null
        ? (error as Record<string, unknown>)
        : null;
    return NextResponse.json(
      {
        success: false,
        error: formatUnknownError(error),
        stage,
        diagnostic: {
          code: typeof record?.code === "string" ? record.code : null,
          details: typeof record?.details === "string" ? record.details : null,
          hint: typeof record?.hint === "string" ? record.hint : null,
        },
      },
      { status: 409 },
    );
  }
}
