export function isPlausiblePublicPersonName(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.length <= 4 &&
    parts.every((part) => /^[\p{L}][\p{L}'-]{1,}$/u.test(part)) &&
    !/директор|руководител|менеджер|отдел|компан|контакт|ваканси|продаж|маркетинг/i.test(normalized);
}
