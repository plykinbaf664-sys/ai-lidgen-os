import { NextResponse } from "next/server";
import { updateOutreachQueueEntry } from "@/lib/leadgen/outreach-storage";
import type { OutreachEmailStatus } from "@/lib/leadgen/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = (await request.json()) as {
      subject?: string;
      body?: string;
      email?: string;
      status?: OutreachEmailStatus;
      note?: string;
    };
    if (
      body.status &&
      !["needs_review", "paused", "rejected"].includes(body.status)
    ) {
      return NextResponse.json(
        { success: false, error: "Этот статус нельзя установить вручную" },
        { status: 400 },
      );
    }
    const entry = await updateOutreachQueueEntry({ id: (await params).id, ...body });
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
