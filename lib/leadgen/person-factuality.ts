export function isPlausiblePublicPersonName(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ").filter(Boolean);
  const nonPersonToken = /^(?:партн[её]р|заведующ(?:ий|ая)|управляющ(?:ий|ая)|руководител[ья]|директор[а-яё]*|менеджер[а-яё]*|другой|телефон|контакты?|почта|email|e-mail|отдел|офис|команда|вакансия|продажи|маркетинг|support|sales|team|workshop|company|group|office|contact|phone)$/i;
  return parts.length >= 2 && parts.length <= 4 &&
    parts.every((part) => /^[\p{L}][\p{L}'-]{1,}$/u.test(part)) &&
    !parts.some((part) => nonPersonToken.test(part)) &&
    !/директор|руководител|управляющ|менеджер|отдел|компан|контакт|ваканси|продаж|маркетинг|мастерск|workshop/i.test(normalized);
}
