import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/leadgen/email-provider";
import { buildOutreachReadiness } from "@/lib/leadgen/outreach-storage";

export async function GET() {
  try {
    const smtp = await createEmailProvider().validateConnection();
    return NextResponse.json({
      success: true,
      readiness: await buildOutreachReadiness(smtp.ok),
      smtp_message: smtp.message,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
