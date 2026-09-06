import { NextResponse } from "next/server";
import { cancelQueuedItem } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  cancelLocalQueuedItem,
  getLocalOutreachEntry,
  getOutreachDeliveryStorageMode,
} from "@/lib/leadgen/local-outreach-store";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = (await params).id;
    const localEntry =
      getOutreachDeliveryStorageMode() === "local"
        ? await getLocalOutreachEntry(id)
        : null;
    const entry = localEntry
      ? await cancelLocalQueuedItem(id)
      : await cancelQueuedItem(id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено в очереди" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
