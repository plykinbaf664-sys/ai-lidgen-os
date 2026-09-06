import { NextResponse } from "next/server";
import { getOutreachQueueEntry, updateOutreachQueueEntry } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  getLocalOutreachEntry,
  getOutreachDeliveryStorageMode,
  updateLocalOutreachEntry,
} from "@/lib/leadgen/local-outreach-store";
import type { OutreachEmailStatus } from "@/lib/leadgen/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const entry =
      getOutreachDeliveryStorageMode() === "local"
        ? (await getLocalOutreachEntry(id)) ?? (await getOutreachQueueEntry(id))
        : await getOutreachQueueEntry(id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}

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
    const id = (await params).id;
    const localEntry =
      getOutreachDeliveryStorageMode() === "local"
        ? await getLocalOutreachEntry(id)
        : null;
    const entry = localEntry
      ? await updateLocalOutreachEntry({ id, ...body })
      : await updateOutreachQueueEntry({ id, ...body });
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
