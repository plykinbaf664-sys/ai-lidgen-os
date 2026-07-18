import { scheduleApprovedBatch } from "@/lib/leadgen/outreach-storage";
import type { OutreachQueueEntry } from "@/lib/leadgen/types";

export async function sendOutreachEmail({
  id,
}: {
  id: string;
}): Promise<OutreachQueueEntry | null> {
  const campaignId = id.startsWith("outreach-") ? null : null;
  void campaignId;
  throw new Error(
    "Прямая отправка отключена. Используйте постоянную очередь и processor.",
  );
}

export { scheduleApprovedBatch };
