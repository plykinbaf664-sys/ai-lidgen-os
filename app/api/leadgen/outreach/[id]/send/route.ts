import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "Прямая SMTP-отправка отключена. Используйте постановку в постоянную очередь.",
    },
    { status: 409 },
  );
}
