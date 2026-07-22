import { NextResponse } from "next/server";
import { scanFollowupReplies } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST() {
  try {
    const result = await scanFollowupReplies();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 409 });
  }
}
