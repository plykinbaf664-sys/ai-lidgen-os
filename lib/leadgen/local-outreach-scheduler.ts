import { formatUnknownError } from "@/lib/leadgen/error-format";
import { processNextLocalOutreachItem } from "@/lib/leadgen/local-outreach-processor";
import { listLocalOutreachEntries } from "@/lib/leadgen/local-outreach-store";

type SchedulerGlobal = typeof globalThis & {
  __leadgenLocalOutreachTimer?: ReturnType<typeof setTimeout>;
  __leadgenLocalOutreachRunning?: boolean;
};

const schedulerGlobal = globalThis as SchedulerGlobal;
const MIN_POLL_MS = 5_000;
const MAX_POLL_MS = 60_000;

function armTimer(delayMs: number) {
  if (process.env.VERCEL || schedulerGlobal.__leadgenLocalOutreachTimer) return;
  schedulerGlobal.__leadgenLocalOutreachTimer = setTimeout(() => {
    schedulerGlobal.__leadgenLocalOutreachTimer = undefined;
    void runLocalOutreachProcessorIteration();
  }, delayMs);
}

function nextPollDelay(nextScheduledAt: string | null) {
  if (!nextScheduledAt) return MAX_POLL_MS;
  const remaining = Date.parse(nextScheduledAt) - Date.now();
  if (!Number.isFinite(remaining)) return MAX_POLL_MS;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, remaining));
}

export async function runLocalOutreachProcessorIteration() {
  if (schedulerGlobal.__leadgenLocalOutreachRunning) {
    return { status: "busy" as const, entry: null };
  }
  schedulerGlobal.__leadgenLocalOutreachRunning = true;
  try {
    const result = await processNextLocalOutreachItem();
    const active = (await listLocalOutreachEntries()).filter((entry) =>
      ["queued", "sending"].includes(entry.status),
    );
    if (active.length > 0) {
      const next = active
        .filter((entry) => entry.status === "queued")
        .map((entry) => entry.next_attempt_at ?? entry.scheduled_at)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
      armTimer(nextPollDelay(next));
    }
    return result;
  } catch (error) {
    console.error("[local-outreach-processor]", formatUnknownError(error));
    armTimer(MAX_POLL_MS);
    throw error;
  } finally {
    schedulerGlobal.__leadgenLocalOutreachRunning = false;
  }
}
