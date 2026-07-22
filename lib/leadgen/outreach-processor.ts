import { randomUUID } from "node:crypto";
import { createEmailProvider } from "@/lib/leadgen/email-provider";
import {
  claimDueOutreachItem,
  deferRemainingQueuedItems,
  getDailySendStats,
  getQueuePaused,
  markPersistentOutreachEntry,
  rejectPreviouslyContactedQueuedItems,
} from "@/lib/leadgen/outreach-storage";
import { assertFollowupSendable } from "@/lib/leadgen/followup-storage";
import { formatUnknownError } from "@/lib/leadgen/error-format";

export async function processNextOutreachItem() {
  await rejectPreviouslyContactedQueuedItems();
  if (await getQueuePaused()) {
    return { status: "paused" as const, entry: null };
  }
  const daily = await getDailySendStats();
  if (daily.remaining <= 0) {
    return { status: "daily_limit_reached" as const, entry: null };
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
  const entry = await claimDueOutreachItem(`processor-${randomUUID()}`);
  if (!entry) return { status: "idle" as const, entry: null };

  try {
    await assertFollowupSendable(entry);
  } catch (error) {
    const failed = await markPersistentOutreachEntry(entry.id, "failed", {
      smtp_message_id: null,
      last_error: formatUnknownError(error),
    });
    return { status: "failed" as const, entry: failed };
  }

  const result = await provider.sendEmail(entry);
  if (!result.ok) {
    const failed = await markPersistentOutreachEntry(entry.id, "failed", {
      provider: result.provider,
      smtp_message_id: null,
      last_error: result.error,
    });
    await deferRemainingQueuedItems(new Date());
    return { status: "failed" as const, entry: failed };
  }
  const sent = await markPersistentOutreachEntry(entry.id, "sent", {
    provider: result.provider,
    smtp_message_id: result.provider_message_id,
    subject: result.subject,
    last_error: null,
    metadata: {
      smtp_response: result.smtp_response,
      sent_copy_saved_at: result.sent_copy_saved_at,
      sent_copy_error: result.sent_copy_error,
    },
  });
  await deferRemainingQueuedItems(new Date());
  return { status: "sent" as const, entry: sent };
}
