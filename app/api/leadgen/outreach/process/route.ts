import { NextResponse } from "next/server";
import { processNextOutreachItem } from "@/lib/leadgen/outreach-processor";

async function handleProcess(request: Request) {
  const secret =
    process.env.OUTREACH_PROCESSOR_SECRET ?? process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await processNextOutreachItem()) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const POST = handleProcess;
export const GET = handleProcess;
