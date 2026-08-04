import { after, NextResponse } from "next/server";
import { controlFollowups } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { runOutreachProcessorIteration } from "@/lib/leadgen/outreach-scheduler";

export async function POST(request: Request) {
  try {
    const { action, id } = (await request.json()) as { action?: "pause" | "resume" | "cancel" | "retry" | "unapprove" | "skip"; id?: string };
    if (!action || !["pause", "resume", "cancel", "retry", "unapprove", "skip"].includes(action)) {
      return NextResponse.json({ success: false, error: "Некорректное действие" }, { status: 400 });
    }
    await controlFollowups(action, id);
    if (action === "resume" || action === "retry") {
      after(async () => {
        await runOutreachProcessorIteration("follow_up");
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
