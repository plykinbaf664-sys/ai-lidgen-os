import { createHash } from "node:crypto";
import { normalizeCompanyName, normalizeDomain, normalizeRecipientEmail } from "@/lib/leadgen/company-identity";
import { isSyntacticallyUsableEmail } from "@/lib/leadgen/contact-quality";
import { createLeadOriginContext } from "@/lib/leadgen/lead-origin";
import { FORMULA_CELL, parseXlsxRows } from "@/lib/leadgen/xlsx-lite";
import type { LeadOriginContext } from "@/lib/leadgen/types";

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;
const IMPORT_MAX_VALUE_LENGTH = 500;

export type ImportField =
  | "company"
  | "website"
  | "domain"
  | "first_name"
  | "last_name"
  | "full_name"
  | "role"
  | "email"
  | "phone"
  | "notes";

export type ImportedContactRow = Record<ImportField, string> & {
  rowNumber: number;
  fingerprint: string;
  status: "SUCCESS" | "INVALID" | "DUPLICATE" | "SKIPPED";
  reasons: string[];
  requiresEnrichment: boolean;
  existingLead: boolean;
  originContext: LeadOriginContext;
};

export type ContactImportPreview = {
  fileHash: string;
  filename: string;
  rows: ImportedContactRow[];
  summary: {
    rowsTotal: number;
    valid: number;
    invalid: number;
    duplicates: number;
    newLeads: number;
    existingLeads: number;
    emailsValid: number;
    emailsInvalid: number;
    requiringEnrichment: number;
  };
};

const headerAliases: Record<string, ImportField> = {
  company: "company",
  company_name: "company",
  компания: "company",
  website: "website",
  site: "website",
  сайт: "website",
  domain: "domain",
  домен: "domain",
  first_name: "first_name",
  firstname: "first_name",
  имя: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  фамилия: "last_name",
  full_name: "full_name",
  fullname: "full_name",
  fio: "full_name",
  фио: "full_name",
  role: "role",
  title: "role",
  должность: "role",
  email: "email",
  e_mail: "email",
  почта: "email",
  phone: "phone",
  телефон: "phone",
  notes: "notes",
  note: "notes",
  комментарий: "notes",
};

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zа-яё0-9_]/giu, "");
}

function emptyValues(): Record<ImportField, string> {
  return {
    company: "",
    website: "",
    domain: "",
    first_name: "",
    last_name: "",
    full_name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
  };
}

function parseCsv(text: string): string[][] {
  const sample = text.slice(0, 4_000);
  const delimiter = [",", ";", "\t"].sort(
    (left, right) => sample.split(right).length - sample.split(left).length,
  )[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw new Error("CSV содержит незакрытую кавычку.");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function safeValue(value: string) {
  return value.normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function fingerprint(values: Record<ImportField, string>) {
  const identity = [
    normalizeRecipientEmail(values.email),
    normalizeDomain(values.domain || values.website) ?? "",
    normalizeCompanyName(values.company),
    values.full_name.toLowerCase(),
    values.first_name.toLowerCase(),
    values.last_name.toLowerCase(),
  ].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function isUnsafeCell(value: string) {
  return (
    value === FORMULA_CELL ||
    /^[=+@]/.test(value) ||
    /^-[A-Za-zА-Яа-яЁё]/u.test(value) ||
    /<\/?(?:script|iframe|object|embed|html)\b/i.test(value)
  );
}

export function parseContactImport(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType?: string | null;
  existingEmails?: Iterable<string>;
  existingFingerprints?: Iterable<string>;
}): ContactImportPreview {
  if (input.bytes.byteLength === 0) throw new Error("Файл пуст.");
  if (input.bytes.byteLength > IMPORT_MAX_FILE_BYTES) throw new Error("Файл превышает лимит 5 МБ.");
  const filename = input.filename.trim().slice(0, 180);
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const allowedMime = new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "",
  ]);
  if (!allowedMime.has(input.mimeType ?? "")) throw new Error("Неподдерживаемый MIME type.");
  if (extension !== "csv" && extension !== "xlsx") throw new Error("Поддерживаются только CSV и XLSX.");
  const rawRows = extension === "xlsx"
    ? parseXlsxRows(input.bytes)
    : parseCsv(Buffer.from(input.bytes).toString("utf8").replace(/^\uFEFF/, ""));
  if (rawRows.length < 2) throw new Error("В файле нет строк с контактами.");
  if (rawRows.length - 1 > IMPORT_MAX_ROWS) throw new Error(`Превышен лимит ${IMPORT_MAX_ROWS} строк.`);

  const mappedHeaders = rawRows[0].map((header) => headerAliases[normalizeHeader(header)] ?? null);
  const supported = mappedHeaders.filter((header): header is ImportField => Boolean(header));
  if (supported.length === 0) throw new Error("Не найдено поддерживаемых колонок.");
  if (new Set(supported).size !== supported.length) throw new Error("Обнаружены дублирующиеся колонки.");

  const existingEmails = new Set(
    [...(input.existingEmails ?? [])].map(normalizeRecipientEmail),
  );
  const existingFingerprints = new Set(input.existingFingerprints ?? []);
  const seenEmails = new Set<string>();
  const seenFingerprints = new Set<string>();
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");
  const rows: ImportedContactRow[] = [];

  rawRows.slice(1).forEach((raw, offset) => {
    const values = emptyValues();
    mappedHeaders.forEach((header, index) => {
      if (header) values[header] = safeValue(raw[index] ?? "");
    });
    if (Object.values(values).every((value) => !value)) return;
    const reasons: string[] = [];
    for (const value of Object.values(values)) {
      if (value.length > IMPORT_MAX_VALUE_LENGTH) reasons.push("value_too_long");
      if (isUnsafeCell(value)) reasons.push("unsafe_formula_or_html");
    }
    values.email = normalizeRecipientEmail(values.email);
    values.domain = normalizeDomain(values.domain || values.website) ?? "";
    values.website = values.domain ? `https://${values.domain}` : "";
    values.phone = values.phone.replace(/[^+\d()\s-]/g, "").slice(0, 40);
    if (!values.full_name) values.full_name = `${values.first_name} ${values.last_name}`.trim();
    if (!values.email && !values.company && !values.domain) reasons.push("missing_minimum_identity");
    if (values.email && !isSyntacticallyUsableEmail(values.email)) reasons.push("invalid_email");
    const emailDomain = normalizeDomain(values.email.split("@")[1]);
    if (values.email && values.domain && emailDomain !== values.domain) reasons.push("email_domain_mismatch");
    const rowFingerprint = fingerprint(values);
    const existingLead =
      (values.email ? existingEmails.has(values.email) : false) ||
      existingFingerprints.has(rowFingerprint);
    const duplicate =
      existingLead ||
      seenFingerprints.has(rowFingerprint) ||
      (values.email ? seenEmails.has(values.email) : false);
    if (duplicate) reasons.push(existingLead ? "existing_lead" : "duplicate_in_file");
    const invalid = reasons.some((reason) =>
      ["value_too_long", "unsafe_formula_or_html", "missing_minimum_identity", "invalid_email"].includes(reason),
    );
    const status = invalid ? "INVALID" : duplicate ? "DUPLICATE" : "SUCCESS";
    if (!invalid) {
      seenFingerprints.add(rowFingerprint);
      if (values.email) seenEmails.add(values.email);
    }
    rows.push({
      ...values,
      rowNumber: offset + 2,
      fingerprint: rowFingerprint,
      status,
      reasons: [...new Set(reasons)],
      requiresEnrichment:
        status === "SUCCESS" &&
        (!values.company || !values.domain || !values.email || reasons.includes("email_domain_mismatch")),
      existingLead,
      originContext: createLeadOriginContext("IMPORTED", {
        import_batch_id: fileHash.slice(0, 24),
        source_provider: "contact_import",
        source_metadata: { row_number: offset + 2 },
      }),
    });
  });

  return {
    fileHash,
    filename,
    rows,
    summary: {
      rowsTotal: rows.length,
      valid: rows.filter((row) => row.status === "SUCCESS").length,
      invalid: rows.filter((row) => row.status === "INVALID").length,
      duplicates: rows.filter((row) => row.status === "DUPLICATE").length,
      newLeads: rows.filter((row) => row.status === "SUCCESS" && !row.existingLead).length,
      existingLeads: rows.filter((row) => row.existingLead).length,
      emailsValid: rows.filter((row) => row.email && !row.reasons.includes("invalid_email")).length,
      emailsInvalid: rows.filter((row) => row.reasons.includes("invalid_email")).length,
      requiringEnrichment: rows.filter((row) => row.requiresEnrichment).length,
    },
  };
}
