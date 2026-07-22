import { NextResponse } from "next/server";
import { diagnoseImapConnection } from "@/lib/leadgen/imap-reply-detector";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function POST() {
  try {
    const diagnostic = await diagnoseImapConnection();
    return NextResponse.json({
      success: diagnostic.status === "connected",
      diagnostic,
    }, { status: diagnostic.status === "connected" ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: formatUnknownError(error, "Не удалось проверить IMAP."),
    }, { status: 500 });
  }
}
