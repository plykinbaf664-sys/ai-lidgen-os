import { NextResponse } from "next/server";
import { processNextOutreachItem } from "@/lib/leadgen/outreach-processor";
import { formatUnknownError } from "@/lib/leadgen/error-format";

async function handleProcess(request: Request) {
  const secret =
    process.env.OUTREACH_PROCESSOR_SECRET ?? process.env.CRON_SECRET;
  const encodedSecret = secret
    ? Buffer.from(secret, "utf8").toString("base64url")
    : null;
  const encodedToken = request.headers.get("x-outreach-processor-token");
  const authorization = request.headers.get("authorization");
  if (
    !secret ||
    (encodedToken !== encodedSecret && authorization !== `Bearer ${secret}`)
  ) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, ...(await processNextOutreachItem()) });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}

export const POST = handleProcess;
export const GET = handleProcess;
