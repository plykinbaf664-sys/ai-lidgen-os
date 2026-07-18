import { randomUUID } from "node:crypto";
import { createEmailProvider } from "@/lib/leadgen/email-provider";
import {
  claimDueOutreachItem,
  getDailySendStats,
  getQueuePaused,
  markPersistentOutreachEntry,
} from "@/lib/leadgen/outreach-storage";

export async function processNextOutreachItem() {
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

  const result = await provider.sendEmail(entry);
  if (!result.ok) {
    const failed = await markPersistentOutreachEntry(entry.id, "failed", {
      provider: result.provider,
      last_error: result.error,
    });
    return { status: "failed" as const, entry: failed };
  }
  const sent = await markPersistentOutreachEntry(entry.id, "sent", {
    provider: result.provider,
    smtp_message_id: result.provider_message_id,
    last_error: null,
  });
  return { status: "sent" as const, entry: sent };
}
