import { NextResponse } from "next/server";
import { updateOutreachQueueEntry } from "@/lib/leadgen/outreach-storage";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const entry = await updateOutreachQueueEntry({
      id: (await params).id,
      status: "approved",
      note: "Ошибка сброшена; письмо ожидает постановки в очередь",
    });
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
