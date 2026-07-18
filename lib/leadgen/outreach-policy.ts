export function calculateBatchCapacity({
  requested,
  approved,
  sentToday,
  queuedForToday,
  dailyLimit,
  batchLimit,
}: {
  requested: number;
  approved: number;
  sentToday: number;
  queuedForToday: number;
  dailyLimit: number;
  batchLimit: number;
}) {
  return Math.max(
    0,
    Math.min(
      requested,
      approved,
      batchLimit,
      dailyLimit - sentToday - queuedForToday,
    ),
  );
}

export function getNextScheduledAt({
  currentTimestamp,
  minimumDelaySeconds,
  maximumDelaySeconds,
  randomDelay,
}: {
  currentTimestamp: number;
  minimumDelaySeconds: number;
  maximumDelaySeconds: number;
  randomDelay: (minimum: number, maximum: number) => number;
}) {
  const boundedMaximum = Math.max(minimumDelaySeconds, maximumDelaySeconds);
  const delaySeconds = Math.min(
    boundedMaximum,
    Math.max(
      minimumDelaySeconds,
      randomDelay(minimumDelaySeconds, boundedMaximum),
    ),
  );
  return currentTimestamp + delaySeconds * 1_000;
}

export function resolveDeliveryRecipient({
  testMode,
  testRecipient,
  actualRecipient,
}: {
  testMode: boolean;
  testRecipient?: string | null;
  actualRecipient: string;
}) {
  const recipient = (testMode ? testRecipient : actualRecipient)?.trim();
  if (!recipient) {
    throw new Error(
      testMode
        ? "EMAIL_TEST_RECIPIENT не задан."
        : "Email получателя не задан.",
    );
  }
  return recipient;
}
