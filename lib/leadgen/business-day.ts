import { leadgenProductionConfig } from "@/lib/leadgen/production-config";

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

export function getBusinessDayRange(now = new Date()) {
  const start = zonedMidnightUtc(
    now,
    leadgenProductionConfig.emailBusinessTimezone,
  );
  return {
    start,
    end: new Date(start.getTime() + 86_400_000),
  };
}
