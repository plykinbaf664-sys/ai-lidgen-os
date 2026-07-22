import { NextResponse } from "next/server";
import { retryFailedItem } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const entry = await retryFailedItem((await params).id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 500 },
    );
  }
}
