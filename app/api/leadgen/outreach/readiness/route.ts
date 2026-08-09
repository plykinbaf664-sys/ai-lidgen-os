import { NextResponse } from "next/server";
import { createEmailProvider } from "@/lib/leadgen/email-provider";
import { buildOutreachReadiness } from "@/lib/leadgen/outreach-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { verifyImapReplyConnection } from "@/lib/leadgen/imap-reply-detector";
import { auditProductionConsistency } from "@/lib/leadgen/production-consistency";
import {
  getLocalDailySendStats,
  getLocalQueuePaused,
  getOutreachDeliveryStorageMode,
  listLocalOutreachEntries,
} from "@/lib/leadgen/local-outreach-store";
import { getEmailDelayBounds, leadgenProductionConfig } from "@/lib/leadgen/production-config";

export async function GET() {
  try {
    if (getOutreachDeliveryStorageMode() === "local") {
      const [smtp, imap, entries, daily, paused] = await Promise.all([
        createEmailProvider().validateConnection(),
        verifyImapReplyConnection(),
        listLocalOutreachEntries(),
        getLocalDailySendStats(),
        getLocalQueuePaused(),
      ]);
      const initialEntries = entries.filter(
        (entry) => entry.message_kind !== "follow_up",
      );
      const approved = initialEntries.filter(
        (entry) => entry.status === "approved",
      ).length;
      const queued = initialEntries.filter(
        (entry) => entry.status === "queued",
      ).length;
      const sending = initialEntries.filter(
        (entry) => entry.status === "sending",
      ).length;
      const { minimum, maximum } = getEmailDelayBounds();
      const blockers = [
        ...(!smtp.ok ? ["SMTP не подключён"] : []),
        ...(approved === 0 ? ["Нет одобренных писем"] : []),
        ...(daily.availableToQueue === 0 ? ["Дневной лимит исчерпан"] : []),
        ...(paused ? ["Очередь на паузе"] : []),
        ...(sending > 0 ? ["Очередь уже выполняется"] : []),
      ];
      const testMode = process.env.EMAIL_TEST_MODE?.toLowerCase() !== "false";
      return NextResponse.json({
        success: true,
        storage_mode: "local",
        readiness: {
          smtp_connected: smtp.ok,
          email_test_mode: testMode,
          mode_label: testMode ? "Тестовая отправка" : "Реальная отправка",
          queue_paused: paused,
          approved,
          queued,
          sending,
          sent_today: daily.sentToday,
          daily_limit: daily.dailyLimit,
          daily_remaining: daily.availableToQueue,
          queued_for_today: daily.queuedForToday,
          batch_limit: leadgenProductionConfig.emailBatchSendLimit,
          min_delay_seconds: minimum,
          max_delay_seconds: maximum,
          can_launch: blockers.length === 0,
          blockers,
          imap_configured: imap.configured,
          imap_connected: imap.connected,
          imap_message: imap.message,
          followup_send_blocked: !imap.connected,
          consistency_issue_count: 0,
          consistency_healthy: true,
        },
        smtp_message: smtp.message,
      });
    }
    const [smtp, imap, consistency] = await Promise.all([
      createEmailProvider().validateConnection(),
      verifyImapReplyConnection(),
      auditProductionConsistency(),
    ]);
    return NextResponse.json({
      success: true,
      storage_mode: "supabase",
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
