import { NextResponse } from "next/server";
import { approveOutreachEntry } from "@/lib/leadgen/outreach-storage";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const entry = await approveOutreachEntry((await params).id);
    if (!entry) return NextResponse.json({ success: false, error: "Письмо не найдено или уже обработано" }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
