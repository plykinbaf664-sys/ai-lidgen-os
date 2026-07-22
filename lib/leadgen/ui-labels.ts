import type {
  LeadReadinessStatus,
  LeadgenContact,
  LeadgenLead,
  PersonaSearchStatus,
  SignalType,
} from "@/lib/leadgen/types";
import {
  formatUrlForDisplay,
  normalizeLeadgenText,
} from "@/lib/leadgen/text-normalization";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import { getShortWhyNow } from "@/lib/leadgen/signal-messaging";

export const readinessOrder: Record<LeadReadinessStatus, number> = {
  outreach_ready: 1,
  fallback_ready: 2,
  enrichment_required: 3,
  manual_research_required: 4,
  provider_exhausted: 5,
  rejected: 6,
};

export function getReadinessLabel(readiness: LeadReadinessStatus): string {
  const labels: Record<LeadReadinessStatus, string> = {
    outreach_ready: "Готов к email-отправке",
    fallback_ready: "Доступен общий email",
    enrichment_required: "Контакт не найден",
    manual_research_required: "Нужна ручная проверка",
    provider_exhausted: "Контакт не найден",
    rejected: "Отклонён",
  };

  return labels[readiness];
}

export function getReadinessClass(readiness: LeadReadinessStatus): string {
  const classes: Record<LeadReadinessStatus, string> = {
    outreach_ready: "ready",
    fallback_ready: "fallback",
    enrichment_required: "needs-enrichment",
    manual_research_required: "manual",
    provider_exhausted: "exhausted",
    rejected: "rejected",
  };

  return classes[readiness];
}

export function getNextActionLabel(action?: string | null): string {
  const labels: Record<string, string> = {
    send_outreach: "Отправить сообщение",
    use_fallback_channel: "Использовать общий email",
    run_enrichment: "Пропустить",
    manual_review: "Проверить вручную",
    review_manually: "Проверить вручную",
    skip_until_contact_found: "Пропустить",
    monitor: "Наблюдать",
    monitor_changes: "Наблюдать",
    discard: "Пропустить",
    find_signal: "Найти коммерческий повод",
    contact_primary_person: "Пропустить",
    contact_alternative_person: "Пропустить",
  };

  return action
    ? labels[action] ?? "Проверить вручную"
    : "Пропустить";
}

export function getActionForReadiness(readiness: LeadReadinessStatus): string {
  if (readiness === "outreach_ready") {
    return "Отправить email";
  }

  if (readiness === "fallback_ready") {
    return "Использовать общий email";
  }

  if (readiness === "manual_research_required") {
    return "Проверить вручную";
  }

  if (readiness === "provider_exhausted") {
    return "Пропустить";
  }

  if (readiness === "rejected") {
    return "Не брать в работу";
  }

  return "Пропустить";
}

export function getContactTypeLabel(type: LeadgenContact["contact_type"]): string {
  const labels: Record<LeadgenContact["contact_type"], string> = {
    work_email: "Рабочая почта",
    linkedin: "Дополнительный источник: LinkedIn",
    telegram: "Дополнительный источник: Telegram",
    phone: "Телефон",
    website_form: "Дополнительный источник: форма сайта",
    company_social: "Дополнительный источник: соцсеть компании",
    confirmed_person: "Источник подтверждения человека",
    role_based_person: "Роль без канала связи",
    generic_email: "Общая почта компании",
    contact_form: "Форма связи",
    social_profile: "Дополнительный источник: соцпрофиль",
    company_website: "Дополнительный источник: сайт",
    no_contact_found: "Контакт не найден",
  };

  return labels[type];
}

export function getPersonaStatusLabel(status?: PersonaSearchStatus | null): string {
  const labels: Record<PersonaSearchStatus, string> = {
    target_persona_found: "Целевой ЛПР найден",
    alternative_persona_found: "Найдена альтернативная роль",
    department_entry_found: "Найден руководитель направления",
    generic_entry_found: "Найден общий рабочий вход",
    fallback_only: "Найден только резервный вариант",
    no_entry_found: "ЛПР не найден",
  };

  return status ? labels[status] : "ЛПР не найден";
}

export function getPersonSelectionLabel(selectionType?: string | null): string {
  const labels: Record<string, string> = {
    exact_persona_match: "Точное совпадение",
    alternative_persona_match: "Альтернативная роль",
    department_match: "Совпадение по направлению",
    authority_fallback: "Резервный ЛПР по полномочиям",
    unverified_fallback: "Неподтверждённый резервный вариант",
    not_found: "ЛПР не найден",
  };

  return selectionType ? labels[selectionType] ?? "Проверить вручную" : "ЛПР не найден";
}

export function getSignalLabel(type?: SignalType | string | null): string {
  const labels: Record<string, string> = {
    HIRING_SIGNAL: "Компания расширяет команду",
    GO_TO_MARKET_SIGNAL: "Компания запускает продукт или новое направление",
    GROWTH_SIGNAL: "Компания растёт",
    CONTENT_SIGNAL: "Компания активно работает с контентом",
    TRAFFIC_SIGNAL: "Есть признаки роста спроса",
    TECH_SIGNAL: "Компания меняет технологии или процессы",
    TECH_CHANGE_SIGNAL: "Компания меняет технологии или процессы",
    EXPANSION_SIGNAL: "Компания расширяется",
    FUNDING_SIGNAL: "Компания получила инвестиции",
  };

  return type ? labels[type] ?? "Есть публичный сигнал" : "Есть публичный сигнал";
}

export function getLeadStatusLabel(status: LeadgenLead["status"]): string {
  const labels: Record<LeadgenLead["status"], string> = {
    new: "Новый",
    approved: "Одобрен",
    rejected: "Отклонён",
    paused: "На паузе",
  };

  return labels[status];
}

export function translateDiagnosticValue(value?: string | null): string {
  if (!value) {
    return "Нет данных";
  }

  const labels: Record<string, string> = {
    direct_channel_found: "найден прямой канал",
    fallback_channel_found: "найден резервный канал",
    enrichment_required: "контакт не найден после автоматического поиска",
    provider_exhausted: "источники исчерпаны",
    no_contact_found: "контакт не найден",
    known_context_email_parse: "поиск почты в найденном контексте",
    official_site_bounded_pages: "проверка страниц сайта",
    person_email_yandex_queries: "поиск почты человека через Яндекс",
    person_social_yandex_queries: "поиск соцпрофилей через Яндекс",
    registry_urls_excluded_from_contact_channels:
      "реестры исключены из каналов связи",
    unverified_company_social_posts_excluded_from_direct_channels:
      "неподтверждённые соцпосты исключены из прямых контактов",
    "RU public web": "публичные российские источники",
    ru_public: "публичные российские источники",
  };

  return labels[value] ?? "Техническое значение";
}

export function getContactValue(contact: LeadgenContact | null): string | null {
  if (!contact) {
    return null;
  }

  if (
    contact.contact_type === "confirmed_person" ||
    contact.contact_type === "role_based_person" ||
    contact.contact_type === "no_contact_found"
  ) {
    return null;
  }

  const value =
    contact.email ??
    contact.linkedin_url ??
    contact.telegram_url ??
    (typeof contact.metadata.phone === "string" ? contact.metadata.phone : null) ??
    contact.contact_url;

  return value
    ? normalizeLeadgenText(value, {
        preserveUrlEncoding: Boolean(contact.contact_url && value === contact.contact_url),
        source: "ui.contact.value",
      })
    : null;
}

function getCompactContactValue(contact: LeadgenContact | null): string | null {
  if (!contact) {
    return null;
  }

  if (contact.email || contact.metadata.phone) {
    return getContactValue(contact);
  }

  if (contact.contact_type === "linkedin") {
    return null;
  }

  if (contact.contact_type === "telegram") {
    return null;
  }

  if (contact.contact_type === "website_form" || contact.contact_type === "contact_form") {
    return null;
  }

  if (contact.contact_type === "company_website") {
    return null;
  }

  if (contact.contact_type === "company_social") {
    return null;
  }

  if (contact.contact_type === "social_profile") {
    return null;
  }

  return getContactValue(contact);
}

export function getContactDisplay(contact: LeadgenContact | null): {
  value: string;
  type: string;
} {
  return {
    value: getCompactContactValue(contact) ?? "Нет доступного контакта",
    type: contact ? getContactTypeLabel(contact.contact_type) : "Контакт не найден",
  };
}

export function getSourceDisplay(value?: string | null): string {
  return formatUrlForDisplay(value);
}

export function makeShortWhyNow(
  signalTitle?: string | null,
  signalDetail?: string | null,
  context: {
    signalType?: SignalType | string | null;
    confidenceScore?: number | null;
    evidenceQuality?: string | null;
    whyNow?: string | null;
  } = {},
): string {
  return getShortWhyNow({
    signalTitle,
    signalDetail,
    signalType: context.signalType,
    confidenceScore: context.confidenceScore,
    evidenceQuality: context.evidenceQuality,
    whyNow: context.whyNow,
  });

  const text = [signalTitle, signalDetail]
    .filter(Boolean)
    .map((item) => normalizeLeadgenText(String(item), { source: "ui.why_now" }))
    .join(" ");
  const lower = text.toLowerCase();

  if (/ваканс|найм|hiring|sales|продаж/.test(lower)) {
    return "Компания расширяет команду продаж.";
  }

  if (/запуск|новое направление|релиз|go-to-market|продукт/.test(lower)) {
    return "Компания запускает продукт или новое направление.";
  }

  if (/рост|расшир|филиал|growth|expansion/.test(lower)) {
    return "Компания расширяется.";
  }

  return (
    (signalTitle &&
      normalizeLeadgenText(String(signalTitle), { source: "ui.signal_title" })) ||
    (signalDetail &&
      normalizeLeadgenText(String(signalDetail), { source: "ui.signal_detail" })) ||
    "Есть публичный коммерческий сигнал."
  );
}

export function buildOutreachDraft({
  companyName,
  personName,
  personRole,
  contact,
  readiness,
  whyNow,
}: {
  companyName: string;
  personName?: string | null;
  personRole?: string | null;
  contact: LeadgenContact | null;
  readiness: LeadReadinessStatus;
  whyNow: string;
}): { text: string; readyToSend: boolean } {
  void personRole;

  if (
    (readiness === "outreach_ready" && !isSendableEmailContact(contact)) ||
    (readiness === "fallback_ready" && !isFallbackEmailContact(contact)) ||
    (readiness !== "outreach_ready" && readiness !== "fallback_ready")
  ) {
    return {
      text:
        "Письмо не создано: автоматический поиск не нашёл доступный контакт.",
      readyToSend: false,
    };
  }

  const safeCompanyName = normalizeLeadgenText(companyName, {
    source: "ui.message.company",
  });
  const safePersonName = personName
    ? normalizeLeadgenText(personName, { source: "ui.message.person" })
    : null;
  const firstName = safePersonName?.split(/\s+/)[0] ?? null;
  const normalizedWhy = normalizeLeadgenText(whyNow, {
    source: "ui.message.why_now",
  })
    .replace(/\.$/, "")
    .toLowerCase();

  if (isSendableEmailContact(contact) && firstName) {
    return {
      readyToSend: true,
      text: `${firstName}, добрый день.\n\nУвидел, что ${safeCompanyName}: ${normalizedWhy}.\n\nВ такие периоды обычно растёт нагрузка на обработку заявок, квалификацию и повторные касания. Мы собираем ИИ-системы, которые снимают часть этой ручной работы с продаж.\n\nМогу прислать 2-3 идеи, что можно автоматизировать в вашем процессе?`,
    };
  }

  if (isFallbackEmailContact(contact)) {
    return {
      readyToSend: true,
      text: `Добрый день.\n\nУвидел, что ${safeCompanyName}: ${normalizedWhy}.\n\nПодскажите, пожалуйста, кому можно направить короткое предложение по автоматизации обработки лидов, квалификации и повторных касаний с помощью ИИ?`,
    };
  }

  return {
    readyToSend: false,
    text:
      "Письмо не создано: автоматический поиск не нашёл доступный контакт.",
  };
}
