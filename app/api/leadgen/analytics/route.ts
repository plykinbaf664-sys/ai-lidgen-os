import { NextResponse } from "next/server";
import { getLeadgenAnalyticsSnapshot } from "@/lib/leadgen/analytics-snapshot";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "true";
    return NextResponse.json({
      success: true,
      snapshot: await getLeadgenAnalyticsSnapshot(force),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}

