import { NextResponse } from "next/server";
import { retryFailedItem } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  getLocalOutreachEntry,
  getOutreachDeliveryStorageMode,
  retryLocalFailedItem,
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
      ? await retryLocalFailedItem(id)
      : await retryFailedItem(id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
