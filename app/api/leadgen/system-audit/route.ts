import { NextResponse } from "next/server";
import { auditProductionConsistency, repairProductionConsistency } from "@/lib/leadgen/production-consistency";
import { formatUnknownError } from "@/lib/leadgen/error-format";

function authorized(request: Request) {
  const secret = process.env.OUTREACH_PROCESSOR_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return false;
  const encoded = Buffer.from(secret, "utf8").toString("base64url");
  return request.headers.get("x-outreach-processor-token") === encoded ||
    request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, audit: await auditProductionConsistency() });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, result: await repairProductionConsistency() });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
