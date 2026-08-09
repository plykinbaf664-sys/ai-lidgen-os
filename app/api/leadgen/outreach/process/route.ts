import { NextResponse } from "next/server";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";
import { getOutreachDeliveryStorageMode } from "@/lib/leadgen/local-outreach-store";
import { runLocalOutreachProcessorIteration } from "@/lib/leadgen/local-outreach-scheduler";

async function handleProcess(request: Request) {
  const secrets = [
    process.env.OUTREACH_PROCESSOR_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
  const encodedSecrets = secrets.map((secret) =>
    Buffer.from(secret, "utf8").toString("base64url"),
  );
  const encodedToken = request.headers.get("x-outreach-processor-token");
  const authorization = request.headers.get("authorization");
  if (
    secrets.length === 0 ||
    (!encodedSecrets.includes(encodedToken ?? "") &&
      !secrets.some((secret) => authorization === `Bearer ${secret}`))
  ) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({
      success: true,
      storage_mode: getOutreachDeliveryStorageMode(),
      ...(getOutreachDeliveryStorageMode() === "local"
        ? await runLocalOutreachProcessorIteration()
        : await runOutreachProcessorIteration()),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}

export const POST = handleProcess;
export const GET = handleProcess;
