type ErrorRecord = Record<string, unknown>;

const sensitiveKeyPattern = /password|secret|token|authorization|api[_-]?key|credential/i;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string) {
  return value
    .replace(/(password|secret|token|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}

function collect(value: unknown, depth: number, seen: Set<unknown>): string[] {
  if (value === null || value === undefined || depth > 3 || seen.has(value)) return [];
  if (typeof value === "string") return cleanText(value) ? [cleanText(value)] : [];
  if (["number", "boolean", "bigint"].includes(typeof value)) return [String(value)];
  if (value instanceof Error) {
    seen.add(value);
    return [cleanText(value.message), ...collect(value.cause, depth + 1, seen)].filter(Boolean);
  }
  if (Array.isArray(value)) {
    seen.add(value);
    return value.flatMap((item) => collect(item, depth + 1, seen)).slice(0, 6);
  }
  if (!isRecord(value)) return [];
  seen.add(value);
  const preferred = ["message", "error", "details", "hint", "code", "reason"];
  const output: string[] = [];
  for (const key of preferred) {
    if (sensitiveKeyPattern.test(key) || !(key in value)) continue;
    const parts = collect(value[key], depth + 1, seen);
    for (const part of parts) {
      if (part && !output.includes(part)) output.push(part);
    }
  }
  return output.slice(0, 6);
}

export function formatUnknownError(
  error: unknown,
  fallback = "Не удалось выполнить операцию.",
) {
  const parts = collect(error, 0, new Set());
  const message = parts.join(" · ").trim();
  if (!message || message === "[object Object]") return fallback;
  return message.slice(0, 800);
}
