import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/leadgen/email-provider";
import { buildOutreachReadiness } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { verifyImapReplyConnection } from "@/lib/leadgen/imap-reply-detector";
import { auditProductionConsistency } from "@/lib/leadgen/production-consistency";

export async function GET() {
  try {
    const [smtp, imap, consistency] = await Promise.all([
      createEmailProvider().validateConnection(),
      verifyImapReplyConnection(),
      auditProductionConsistency(),
    ]);
    return NextResponse.json({
      success: true,
      readiness: await buildOutreachReadiness({
        smtpConnected: smtp.ok,
        imapConfigured: imap.configured,
        imapConnected: imap.connected,
        imapMessage: imap.message,
        consistencyIssueCount: consistency.issue_count,
      }),
      smtp_message: smtp.message,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: formatUnknownError(error) }, { status: 500 });
  }
}
