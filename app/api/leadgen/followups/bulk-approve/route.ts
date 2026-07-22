import { NextResponse } from "next/server";
import { approveFollowups } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST() {
  try {
    return NextResponse.json({ success: true, ...(await approveFollowups()) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
