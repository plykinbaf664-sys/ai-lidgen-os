import { NextResponse } from "next/server";
import { regenerateLatestUnsentOutreach } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { execute?: boolean };
    const result = await regenerateLatestUnsentOutreach(body.execute === true);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
