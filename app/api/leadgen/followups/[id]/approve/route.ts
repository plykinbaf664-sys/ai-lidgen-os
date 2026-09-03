import { NextResponse } from "next/server";
import {
  approveFollowups,
  getFollowupSummary,
} from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await approveFollowups([id]);
    let summary = null;
    try {
      summary = await getFollowupSummary(null);
    } catch (error) {
      console.error("[leadgen:followup-approve] summary refresh failed", {
        outreachId: id,
        error: formatUnknownError(error),
      });
    }
    return NextResponse.json({
      success: true,
      ...result,
      summary,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
