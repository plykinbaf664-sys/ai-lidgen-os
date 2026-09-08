import { inflateRawSync } from "node:zlib";

const MAX_ZIP_ENTRIES = 120;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const FORMULA_CELL = "__LEADGEN_FORMULA_REJECTED__";

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function unzipSelected(buffer: Buffer) {
  const endSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const scanStart = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= scanStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Некорректный XLSX: ZIP directory не найден.");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error("XLSX содержит слишком много файлов.");

  const result = new Map<string, string>();
  let cursor = centralOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== centralSignature) {
      throw new Error("Некорректный XLSX central directory.");
    }
    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;

    const selected =
      name === "xl/sharedStrings.xml" ||
      name === "xl/worksheets/sheet1.xml";
    if (!selected) continue;
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error("XLSX sheet слишком большой.");
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== localSignature) {
      throw new Error("Некорректный XLSX local header.");
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const expanded =
      compression === 0
        ? compressed
        : compression === 8
          ? inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_BYTES })
          : null;
    if (!expanded) throw new Error("Неподдерживаемое сжатие XLSX.");
    totalBytes += expanded.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("XLSX распаковывается в слишком большой объём.");
    result.set(name, expanded.toString("utf8"));
  }
  return result;
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((item) =>
    decodeXml(
      [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
        .map((match) => match[1])
        .join(""),
    ),
  );
}

export function parseXlsxRows(bytes: Uint8Array): string[][] {
  const entries = unzipSelected(Buffer.from(bytes));
  const sheet = entries.get("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("В XLSX не найден первый лист.");
  if (/<!DOCTYPE|<!ENTITY/i.test(sheet)) throw new Error("Небезопасный XML в XLSX.");
  const shared = parseSharedStrings(entries.get("xl/sharedStrings.xml"));
  const rows: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
    const row: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attributes = cellMatch[1];
      const content = cellMatch[2];
      const reference = attributes.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? "A1";
      const type = attributes.match(/\bt="([^"]+)"/i)?.[1] ?? "n";
      let value = "";
      if (/<f\b/i.test(content)) {
        value = FORMULA_CELL;
      } else if (type === "inlineStr") {
        value = decodeXml(
          [...content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
            .map((match) => match[1])
            .join(""),
        );
      } else {
        const raw = decodeXml(content.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] ?? "");
        value = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      row[columnIndex(reference)] = value;
    }
    rows.push(row.map((value) => value ?? ""));
  }
  return rows;
}
