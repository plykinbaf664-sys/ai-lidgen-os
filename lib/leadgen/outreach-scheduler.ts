import { formatUnknownError } from "@/lib/leadgen/error-format";
import { processNextOutreachItem } from "@/lib/leadgen/outreach-processor";
import { getOutreachQueue } from "@/lib/leadgen/outreach-storage";
import { getFollowups } from "@/lib/leadgen/followup-storage";

type MessageKind = "initial" | "follow_up";
type SchedulerKey = MessageKind | "all";
type SchedulerGlobal = typeof globalThis & {
  __leadgenOutreachTimers?: Partial<
    Record<SchedulerKey, ReturnType<typeof setTimeout>>
  >;
  __leadgenOutreachRunning?: Partial<Record<SchedulerKey, boolean>>;
};

const schedulerGlobal = globalThis as SchedulerGlobal;
const MIN_POLL_MS = 5_000;
const MAX_POLL_MS = 60_000;

function armLocalTimer(delayMs: number, messageKind?: MessageKind) {
  const key: SchedulerKey = messageKind ?? "all";
  const timers = (schedulerGlobal.__leadgenOutreachTimers ??= {});
  if (process.env.VERCEL || timers[key]) return;
  timers[key] = setTimeout(() => {
    delete timers[key];
    void runOutreachProcessorIteration(messageKind);
  }, delayMs);
}

function nextPollDelay(nextScheduledAt: string | null) {
  if (!nextScheduledAt) return MAX_POLL_MS;
  const remaining = Date.parse(nextScheduledAt) - Date.now();
  if (!Number.isFinite(remaining)) return MAX_POLL_MS;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, remaining));
}

/**
 * Processes at most one due item. Local development keeps a lightweight timer
 * alive while the persistent queue has work; Vercel continues through cron.
 */
export async function runOutreachProcessorIteration(messageKind?: MessageKind) {
  const key: SchedulerKey = messageKind ?? "all";
  const running = (schedulerGlobal.__leadgenOutreachRunning ??= {});
  if (running[key]) {
    return { status: "busy" as const, entry: null };
  }

  running[key] = true;
  try {
    const result = await processNextOutreachItem(messageKind);
    if (!process.env.VERCEL) {
      const entries =
        messageKind === "follow_up"
          ? await getFollowups()
          : (await getOutreachQueue()).filter(
              (entry) => !messageKind || entry.message_kind === messageKind,
            );
      const active = entries.filter((entry) =>
        ["queued", "sending"].includes(entry.status),
      );
      if (active.length > 0) {
        const nextScheduledAt =
          active
            .filter((entry) => entry.status === "queued")
            .map((entry) => entry.next_attempt_at ?? entry.scheduled_at)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ??
          null;
        armLocalTimer(nextPollDelay(nextScheduledAt), messageKind);
      }
    }
    return result;
  } catch (error) {
    console.error("[outreach-processor]", formatUnknownError(error));
    if (!process.env.VERCEL) armLocalTimer(MAX_POLL_MS, messageKind);
    throw error;
  } finally {
    running[key] = false;
  }
}
