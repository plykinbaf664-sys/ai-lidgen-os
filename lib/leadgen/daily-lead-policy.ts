export function calculateDailyLeadCapacity({
  createdToday,
  dailyLimit,
}: {
  createdToday: number;
  dailyLimit: number;
}) {
  const normalizedCreatedToday = Math.max(0, Math.floor(createdToday));
  const normalizedDailyLimit = Math.max(0, Math.floor(dailyLimit));

  return {
    createdToday: normalizedCreatedToday,
    dailyLimit: normalizedDailyLimit,
    remaining: Math.max(0, normalizedDailyLimit - normalizedCreatedToday),
  };
}
