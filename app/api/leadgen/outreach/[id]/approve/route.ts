import { NextResponse } from "next/server";
import { approveOutreachEntry } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  approveLocalOutreachEntry,
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
      ? await approveLocalOutreachEntry(id)
      : await approveOutreachEntry(id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено или уже обработано" }, { status: 404 });
    return NextResponse.json({
      success: true,
      entry,
      // The client reconciles this one transition immediately. Rebuilding the
      // whole campaign summary must not delay an approval mutation.
      summary: null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
