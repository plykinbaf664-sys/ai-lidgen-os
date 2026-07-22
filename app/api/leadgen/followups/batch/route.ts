import { NextResponse } from "next/server";
import { scheduleFollowupBatch } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { count?: number };
    if (!Number.isInteger(body.count) || Number(body.count) < 1 || Number(body.count) > 20) {
      return NextResponse.json({ success: false, error: "Некорректный batch" }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await scheduleFollowupBatch(Number(body.count))) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
