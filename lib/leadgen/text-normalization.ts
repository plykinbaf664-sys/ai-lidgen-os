type TextProblemType =
  | "percent_encoded"
  | "unicode_escaped"
  | "double_encoded"
  | "mojibake";

export type TextNormalizationDiagnostic = {
  source?: string;
  original: string;
  normalized: string;
  problem_type: TextProblemType;
};

type NormalizeTextOptions = {
  source?: string;
  preserveUrlEncoding?: boolean;
  diagnostics?: TextNormalizationDiagnostic[];
};

const percentEncodedUtf8Pattern = /(?:%25(?:D0|D1|C2|C3|E2)|%(?:D0|D1|C2|C3|E2))/i;
const unicodeEscapePattern = /\\u[0-9A-Fa-f]{4}|\\U[0-9A-Fa-f]{4}/;
const mojibakePattern = /(?:Р.|С.|Ð.|Ñ.)/;

const cp1251Special: Record<string, number> = {
  "\u0402": 0x80,
  "\u0403": 0x81,
  "\u201a": 0x82,
  "\u0453": 0x83,
  "\u201e": 0x84,
  "\u2026": 0x85,
  "\u2020": 0x86,
  "\u2021": 0x87,
  "\u20ac": 0x88,
  "\u2030": 0x89,
  "\u0409": 0x8a,
  "\u2039": 0x8b,
  "\u040a": 0x8c,
  "\u040c": 0x8d,
  "\u040b": 0x8e,
  "\u040f": 0x8f,
  "\u0452": 0x90,
  "\u2018": 0x91,
  "\u2019": 0x92,
  "\u201c": 0x93,
  "\u201d": 0x94,
  "\u2022": 0x95,
  "\u2013": 0x96,
  "\u2014": 0x97,
  "\u2122": 0x99,
  "\u0459": 0x9a,
  "\u203a": 0x9b,
  "\u045a": 0x9c,
  "\u045c": 0x9d,
  "\u045b": 0x9e,
  "\u045f": 0x9f,
  "\u00a0": 0xa0,
  "\u040e": 0xa1,
  "\u045e": 0xa2,
  "\u0408": 0xa3,
  "\u0490": 0xa5,
  "\u00a6": 0xa6,
  "\u00a7": 0xa7,
  "\u0401": 0xa8,
  "\u00a9": 0xa9,
  "\u0404": 0xaa,
  "\u00ab": 0xab,
  "\u00ac": 0xac,
  "\u00ae": 0xae,
  "\u0407": 0xaf,
  "\u00b0": 0xb0,
  "\u00b1": 0xb1,
  "\u0406": 0xb2,
  "\u0456": 0xb3,
  "\u0491": 0xb4,
  "\u00b5": 0xb5,
  "\u00b6": 0xb6,
  "\u00b7": 0xb7,
  "\u0451": 0xb8,
  "\u2116": 0xb9,
  "\u0454": 0xba,
  "\u00bb": 0xbb,
  "\u0458": 0xbc,
  "\u0405": 0xbd,
  "\u0455": 0xbe,
  "\u0457": 0xbf,
};

function recordDiagnostic(
  diagnostics: TextNormalizationDiagnostic[] | undefined,
  original: string,
  normalized: string,
  problemType: TextProblemType,
  source?: string,
) {
  if (!diagnostics || original === normalized) {
    return;
  }

  diagnostics.push({
    source,
    original,
    normalized,
    problem_type: problemType,
  });
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/|$)/i.test(value);
}

function decodePercentText(value: string): string {
  let current = value;

  for (let index = 0; index < 2; index += 1) {
    if (!percentEncodedUtf8Pattern.test(current)) {
      return current;
    }

    try {
      const decoded = decodeURIComponent(current);

      if (decoded === current) {
        return current;
      }

      current = decoded;
    } catch {
      return current;
    }
  }

  return current;
}

function decodeUnicodeEscapes(value: string): string {
  if (!unicodeEscapePattern.test(value)) {
    return value;
  }

  const jsonReady = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\\\\[uU]([0-9A-Fa-f]{4})/g, "\\u$1");

  try {
    return JSON.parse(`"${jsonReady}"`) as string;
  } catch {
    return value;
  }
}

function cp1251Byte(char: string): number | null {
  const code = char.charCodeAt(0);

  if (code <= 0x7f) {
    return code;
  }

  if (code >= 0x80 && code <= 0xff) {
    return code;
  }

  if (code >= 0x0410 && code <= 0x044f) {
    return code - 0x0410 + 0xc0;
  }

  return cp1251Special[char] ?? null;
}

function countCyrillic(value: string): number {
  return (value.match(/[А-Яа-яЁё]/g) ?? []).length;
}

function countMojibakeMarkers(value: string): number {
  return (value.match(/(?:Р|С|Ð|Ñ|�)/g) ?? []).length;
}

function repairMojibake(value: string): string {
  const hasMojibakeMarker =
    mojibakePattern.test(value) ||
    value.includes("\u00d0") ||
    value.includes("\u00d1");

  if (!hasMojibakeMarker) {
    return value;
  }

  const bytes: number[] = [];

  for (const char of value) {
    const byte = cp1251Byte(char);

    if (byte === null) {
      return value;
    }

    bytes.push(byte);
  }

  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(
    new Uint8Array(bytes),
  );

  if (
    decoded.includes("�") ||
    (!value.includes("?") && decoded.includes("?")) ||
    countCyrillic(decoded) === 0 ||
    countMojibakeMarkers(decoded) >= countMojibakeMarkers(value)
  ) {
    return value;
  }

  return decoded;
}

export function normalizeLeadgenText(
  value: string,
  options: NormalizeTextOptions = {},
): string {
  let current = value;

  if (!options.preserveUrlEncoding && !looksLikeUrl(current)) {
    const decodedPercent = decodePercentText(current);
    recordDiagnostic(
      options.diagnostics,
      current,
      decodedPercent,
      decodedPercent.includes("%") ? "double_encoded" : "percent_encoded",
      options.source,
    );
    current = decodedPercent;
  }

  const decodedUnicode = decodeUnicodeEscapes(current);
  recordDiagnostic(
    options.diagnostics,
    current,
    decodedUnicode,
    "unicode_escaped",
    options.source,
  );
  current = decodedUnicode;

  const repairedMojibake = repairMojibake(current);
  recordDiagnostic(
    options.diagnostics,
    current,
    repairedMojibake,
    "mojibake",
    options.source,
  );

  return repairedMojibake
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .trim();
}

function shouldPreserveUrlEncoding(keyPath: string): boolean {
  return /(?:^|\.|_)(url|href|link)(?:$|\.|_)/i.test(keyPath);
}

function shouldPreserveIdentifier(keyPath: string): boolean {
  const key = keyPath.split(".").at(-1) ?? "";
  return key === "id" || key.endsWith("_id") || [
    "idempotency_key",
    "identity_key",
    "smtp_message_id",
    "provider_message_id",
    "parent_smtp_message_id",
    "reply_message_id",
  ].includes(key);
}

export function normalizeLeadgenStrings<T>(
  value: T,
  source = "leadgen",
  diagnostics?: TextNormalizationDiagnostic[],
): T {
  function visit(input: unknown, path: string): unknown {
    if (typeof input === "string") {
      if (shouldPreserveIdentifier(path)) return input;
      return normalizeLeadgenText(input, {
        source: path ? `${source}.${path}` : source,
        preserveUrlEncoding: shouldPreserveUrlEncoding(path),
        diagnostics,
      });
    }

    if (Array.isArray(input)) {
      return input.map((item, index) => visit(item, `${path}.${index}`));
    }

    if (typeof input === "object" && input !== null) {
      return Object.fromEntries(
        Object.entries(input).map(([key, item]) => [
          key,
          visit(item, path ? `${path}.${key}` : key),
        ]),
      );
    }

    return input;
  }

  return visit(value, "") as T;
}

export function formatUrlForDisplay(value?: string | null): string {
  if (!value) {
    return "Источник не найден";
  }

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "");
    const path = decodePercentText(url.pathname)
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("/");

    return path ? `${host}/${path}` : host;
  } catch {
    return normalizeLeadgenText(value, { preserveUrlEncoding: true });
  }
}
