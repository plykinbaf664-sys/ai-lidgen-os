import { createEmailProvider } from "@/lib/leadgen/email-provider";
import {
  claimDueLocalOutreachItem,
  deferLocalQueuedItems,
  getLocalDailySendStats,
  listLocalOutreachEntries,
  markLocalOutreachEntry,
  recoverStaleLocalSending,
} from "@/lib/leadgen/local-outreach-store";

export async function processNextLocalOutreachItem() {
  await recoverStaleLocalSending();
  const daily = await getLocalDailySendStats();
  const dueEntries = await listLocalOutreachEntries();
  const nextDue = dueEntries
    .filter(
      (entry) =>
        entry.status === "queued" &&
        (daily.remaining > 0 || entry.message_kind === "follow_up") &&
        Date.parse(entry.next_attempt_at ?? entry.scheduled_at ?? entry.created_at) <=
          Date.now(),
    )
    .sort(
      (left, right) =>
        Date.parse(left.next_attempt_at ?? left.created_at) -
        Date.parse(right.next_attempt_at ?? right.created_at),
    )[0];
  if (!nextDue) return { status: "idle" as const, entry: null };
  if (nextDue.message_kind !== "follow_up" && daily.remaining <= 0) {
    return { status: "daily_limit_reached" as const, entry: null };
  }
  if (
    nextDue.message_kind === "follow_up" &&
    (nextDue.reply_check_status !== "verified" || nextDue.reply_detected_at)
  ) {
    const blocked = await markLocalOutreachEntry(nextDue.id, "failed", {
      last_error: nextDue.reply_detected_at
        ? "Ответ уже получен; follow-up заблокирован."
        : "Ответы не проверены; follow-up заблокирован.",
    });
    return { status: "failed" as const, entry: blocked };
  }

  const provider = createEmailProvider();
  const validation = await provider.validateConnection();
  if (!validation.ok) {
    return {
      status: "smtp_unavailable" as const,
      entry: null,
      error: validation.message,
    };
  }
  const entry = await claimDueLocalOutreachItem(
    nextDue.message_kind ?? "initial",
  );
  if (!entry) return { status: "idle" as const, entry: null };
  const result = await provider.sendEmail(entry);
  if (!result.ok) {
    const failed = await markLocalOutreachEntry(entry.id, "failed", {
      provider: result.provider,
      provider_message_id: null,
      last_error: result.error,
    });
    await deferLocalQueuedItems(new Date());
    return { status: "failed" as const, entry: failed };
  }
  const sent = await markLocalOutreachEntry(entry.id, "sent", {
    provider: result.provider,
    provider_message_id: result.provider_message_id,
    subject: result.subject,
    last_error: null,
    sent_copy_saved_at: result.sent_copy_saved_at,
    sent_copy_error: result.sent_copy_error,
  });
  await deferLocalQueuedItems(new Date());
  return { status: "sent" as const, entry: sent };
}
