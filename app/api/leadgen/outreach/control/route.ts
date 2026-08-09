import { after, NextResponse } from "next/server";
import { cancelQueued, retryFailed, setQueuePaused } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";
import {
  cancelLocalQueued,
  getOutreachDeliveryStorageMode,
  retryLocalFailed,
  setLocalQueuePaused,
} from "@/lib/leadgen/local-outreach-store";
import { runLocalOutreachProcessorIteration } from "@/lib/leadgen/local-outreach-scheduler";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; campaignId?: string };
    if (getOutreachDeliveryStorageMode() === "local") {
      if (body.action === "pause") await setLocalQueuePaused(true);
      else if (body.action === "resume" || body.action === "kick") {
        await setLocalQueuePaused(false);
        after(async () => {
          await runLocalOutreachProcessorIteration();
        });
      } else if (body.action === "cancel") {
        await cancelLocalQueued(body.campaignId);
      } else if (body.action === "retry") {
        await retryLocalFailed(body.campaignId);
      } else {
        return NextResponse.json(
          { success: false, error: "Неизвестное действие" },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: true, storage_mode: "local" });
    }
    if (body.action === "pause") await setQueuePaused(true);
    else if (body.action === "resume" || body.action === "kick") {
      await setQueuePaused(false);
      after(async () => {
        await runOutreachProcessorIteration("initial");
      });
    }
    else if (body.action === "cancel") await cancelQueued(body.campaignId);
    else if (body.action === "retry") await retryFailed(body.campaignId);
    else return NextResponse.json({ success: false, error: "Неизвестное действие" }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
