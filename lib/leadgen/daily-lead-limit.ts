import "server-only";

import { calculateDailyLeadCapacity } from "@/lib/leadgen/daily-lead-policy";
import { leadgenProductionConfig } from "@/lib/leadgen/production-config";
import { createSupabaseServerClient } from "@/lib/supabase/client";

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function zonedMidnightUtc(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const guess = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  );
  const atGuess = getZonedParts(new Date(guess), timeZone);
  const represented = Date.UTC(
    Number(atGuess.year),
    Number(atGuess.month) - 1,
    Number(atGuess.day),
    Number(atGuess.hour),
    Number(atGuess.minute),
    Number(atGuess.second),
  );

  return new Date(guess - (represented - guess));
}

export async function getDailyLeadStats(now = new Date()) {
  const supabase = createSupabaseServerClient();
  const start = zonedMidnightUtc(
    now,
    leadgenProductionConfig.emailBusinessTimezone,
  );
  const end = new Date(start.getTime() + 86_400_000);
  const { data, error } = await supabase
    .from("leadgen_contacts")
    .select("lead_id,email")
    .not("email", "is", null)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw error;

  const leadIds = new Set(
    (data ?? [])
      .filter((contact) => typeof contact.email === "string" && contact.email.trim())
      .map((contact) => contact.lead_id)
      .filter(Boolean),
  );
  const capacity = calculateDailyLeadCapacity({
    createdToday: leadIds.size,
    dailyLimit: leadgenProductionConfig.dailyLeadLimit,
  });

  return {
    ...capacity,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}
