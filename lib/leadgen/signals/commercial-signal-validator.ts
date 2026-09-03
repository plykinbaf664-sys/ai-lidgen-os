import type {
  CommercialSignal,
  CommercialSignalType,
  SignalType,
} from "@/lib/leadgen/types";
import { isDiscoveryV2Enabled } from "@/lib/leadgen/discovery-v2-config";

export const NO_VERIFIED_COMMERCIAL_SIGNAL =
  "Подтверждённый коммерческий сигнал не найден";

const contactPathPattern =
  /(?:^|\/)(?:contact(?:s|-us)?|kontakty|requisites|rekvizity|feedback)(?:\/|$)/i;

const contactMarkers = [
  "телефон",
  "факс",
  "e-mail",
  "email",
  "адрес",
  "контакты",
  "время работы",
  "режим работы",
  "отдел закупок",
  "отдел кадров",
  "отдел логистики",
  "обратная связь",
  "заявка на сотрудничество",
  "как проехать",
  "реквизиты",
  "phone",
  "contact us",
  "working hours",
  "opening hours",
  "feedback",
] as const;

const genericDescriptionPatterns = [
  /\b(?:компания|центр|клиника|организация)\s+(?:оказывает|предлагает|занимается)\b/i,
  /\b(?:мы\s+)?(?:оказываем|предлагаем|занимаемся)\b/i,
  /\b(?:перечень|каталог|список)\s+(?:услуг|товаров)\b/i,
  /\b(?:company|clinic|centre|center)\s+(?:provides|offers|specializes)\b/i,
] as const;

type SignalPattern = {
  type: CommercialSignalType;
  patterns: readonly RegExp[];
};

const signalPatterns: readonly SignalPattern[] = [
  {
    type: "hiring",
    patterns: [
      /(?:опубликован[ыа]?|открыт[ыа]?|размещен[ыа]?)\s+ваканси/i,
      /(?:ищет|ищем|требуется|требуются|нанимает|набирает|расширяет команду|увеличивает штат)[^.!?]{0,100}(?:менеджер|руководител|оператор|сотрудник|специалист|отдел продаж|служб[уа] поддержки)/i,
      /ваканси[^.!?]{0,100}(?:менеджер|руководител|оператор|сотрудник|специалист|продаж|поддержк)/i,
      /\b(?:hiring|open roles?|open positions?|job openings?|expanding (?:the )?team)\b/i,
    ],
  },
  {
    type: "new_location",
    patterns: [
      /(?:откры(?:ла|ли|т|вает)|запусти(?:ла|ли)|появил(?:ся|ась))\s+(?:нов(?:ый|ую|ого)\s+)?(?:филиал|офис|клиник|точк|представительств)/i,
      /(?:открытие|запуск)\s+нов(?:ого|ой)\s+(?:филиал|офис|клиник|точк|представительств)/i,
      /\b(?:new|another)\s+(?:branch|office|location|clinic)\s+(?:opened|launched|is opening)\b/i,
      /\b(?:opened|opens|opening)\s+(?:a\s+)?new\s+(?:branch|office|location|clinic)\b/i,
    ],
  },
  {
    type: "new_product",
    patterns: [
      /(?:запусти(?:ла|ли)|представи(?:ла|ли)|анонсирова(?:ла|ли))\s+нов(?:ый|ую|ое|ые)\s+(?:продукт|платформ|сервис|линейк)/i,
      /\b(?:launched|announced|released|introduced)\s+(?:a\s+)?new\s+(?:product|platform|solution|product line)\b/i,
    ],
  },
  {
    type: "new_service",
    patterns: [
      /(?:запусти(?:ла|ли)|откры(?:ла|ли)|добави(?:ла|ли))\s+нов(?:ое|ый|ую|ые)\s+(?:направлен|услуг|сервис)/i,
      /(?:запуск|открытие)\s+нов(?:ого|ой)\s+(?:направлен|услуг|сервис)/i,
      /\b(?:launched|introduced|added)\s+(?:a\s+)?new\s+(?:service|business line|practice)\b/i,
    ],
  },
  {
    type: "partnership",
    patterns: [
      /(?:заключи(?:ла|ли)|объяви(?:ла|ли))\s+(?:о\s+)?(?:партнерств|сотрудничеств)/i,
      /\b(?:partnership|partnered with|strategic alliance|collaboration agreement)\b/i,
    ],
  },
  {
    type: "investment",
    patterns: [
      /(?:привлек(?:ла|ли)|получи(?:ла|ли))\s+(?:инвестици|финансирован)/i,
      /(?:инвестиционн(?:ый|ого)\s+раунд|раунд\s+финансирования)/i,
      /\b(?:raised|secured|received)\s+(?:an?\s+)?(?:investment|funding|series [a-f]|seed round)\b/i,
    ],
  },
  {
    type: "market_entry",
    patterns: [
      /(?:выш(?:ла|ли)|выход(?:ит|ят))\s+на\s+нов(?:ый|ые)\s+(?:рынок|регион)/i,
      /\b(?:entered|entering|expanding into)\s+(?:a\s+)?new\s+(?:market|region|country)\b/i,
    ],
  },
  {
    type: "expansion",
    patterns: [
      /(?:расшири(?:ла|ли|яет)|увеличи(?:ла|ли|вает))\s+(?:географи|сеть|присутствие|производств|мощност)/i,
      /(?:масштабиру(?:ет|ют)|вырос(?:ла|ли)?\s+до)/i,
      /\b(?:expanded|expanding|scaled|scaling)\s+(?:its\s+)?(?:network|operations|presence|capacity|geography)\b/i,
    ],
  },
  {
    type: "sales_growth",
    patterns: [
      /(?:рост|увеличение)\s+(?:продаж|выручки|заказов)/i,
      /(?:продажи|выручка)\s+(?:выросли|увеличились)/i,
      /\b(?:sales|revenue|orders)\s+(?:grew|increased|growth)\b/i,
    ],
  },
  {
    type: "digital_transformation",
    patterns: [
      /(?:внедри(?:ла|ли)|запусти(?:ла|ли)|переш(?:ла|ли))\s+(?:на\s+)?(?:crm|erp|цифров|автоматизац|онлайн-платформ)/i,
      /\b(?:implemented|adopted|migrated to|rolled out)\s+(?:a\s+)?(?:crm|erp|digital platform|automation system)\b/i,
    ],
  },
  {
    type: "customer_service_growth",
    patterns: [
      /(?:расшири(?:ла|ли|яет)|увеличи(?:ла|ли|вает))\s+(?:колл-центр|контакт-центр|службу поддержки|клиентский сервис)/i,
      /\b(?:expanded|expanding)\s+(?:the\s+)?(?:contact center|customer support|customer service team)\b/i,
    ],
  },
  {
    type: "infrastructure_change",
    patterns: [
      /(?:модернизирова(?:ла|ли)|обнови(?:ла|ли)|замени(?:ла|ли)|мигрирова(?:ла|ли))\s+(?:инфраструктур|систем|платформ|оборудован)/i,
      /\b(?:infrastructure|platform|system)\s+(?:migration|upgrade|modernization)\b/i,
    ],
  },
  {
    type: "procurement_activity",
    patterns: [
      /(?:объяви(?:ла|ли)|опубликова(?:ла|ли))\s+(?:тендер|закупк|конкурс)/i,
      /\b(?:tender|procurement|request for proposals?|rfp)\s+(?:announced|published|opened)\b/i,
    ],
  },
  {
    type: "leadership_change",
    patterns: [
      /(?:назначен|назначена|возглавил|возглавила)\s+(?:нов(?:ый|ая)\s+)?(?:директор|руководител|генеральн)/i,
      /\b(?:appointed|named)\s+(?:a\s+)?new\s+(?:ceo|chief|director|head of)\b/i,
    ],
  },
] as const;

const discoveryV2SignalPatterns: readonly SignalPattern[] = [
  {
    type: "new_location",
    patterns: [
      /(?:откры(?:л|ла|ли|т|вает|лся|лась|лись)|запусти(?:л|ла|ли)|появил(?:ся|ась))\s+(?:[а-яё-]+\s+){0,3}(?:филиал|офис|клиник|точк|представительств|стационар|поликлиник|медцентр|медицинск[а-яё-]*\s+центр)/i,
      /(?:филиал|офис|клиник|точк|представительств|стационар|поликлиник|медцентр|медицинск[а-яё-]*\s+центр)(?:\s+[а-яё«»"'-]+){0,6}\s+открыл(?:ся|ась|ись)/i,
    ],
  },
  {
    type: "new_service",
    patterns: [
      /(?:запусти(?:л|ла|ли)|откры(?:л|ла|ли)|добави(?:л|ла|ли))\s+(?:(?:нов|перв)[а-яё-]*\s+)?(?:направлен|услуг|сервис|программ)/i,
    ],
  },
  {
    type: "digital_transformation",
    patterns: [
      /(?:внедри(?:л|ла|ли)|запусти(?:л|ла|ли)|переш(?:ел|ла|ли))\s+(?:на\s+)?(?:crm|erp|цифров|автоматизац|онлайн-платформ)/i,
    ],
  },
] as const;

type CandidateInput = {
  text: string | null | undefined;
  sourceUrl: string | null | undefined;
  sourceTitle?: string | null;
  confidence?: number | null;
  detectedAt?: string | null;
  pipelineSignalType?: SignalType | null;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitFragments(value: string): string[] {
  return value
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/\n|(?<=\.)\s+(?=[А-ЯA-Z])/u)
    .map(normalize)
    .filter((item) => item.length >= 12);
}

function getSignalType(text: string): CommercialSignalType {
  if (isDiscoveryV2Enabled()) {
    for (const group of discoveryV2SignalPatterns) {
      if (group.patterns.some((pattern) => pattern.test(text))) return group.type;
    }
  }
  for (const group of signalPatterns) {
    if (group.patterns.some((pattern) => pattern.test(text))) {
      return group.type;
    }
  }

  return "none";
}

function contactMarkerShare(text: string): number {
  const normalized = text.toLowerCase();
  const matches = contactMarkers.filter((marker) =>
    normalized.includes(marker),
  ).length;
  const hasEmail = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
  const phones = text.match(/(?:\+?\d[\d\s()\-]{7,}\d)/g)?.length ?? 0;
  const markerWeight = matches + (hasEmail ? 2 : 0) + Math.min(phones, 2);

  return markerWeight / Math.max(splitFragments(text).length, 1);
}

export function isContactSourceUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }

  try {
    return contactPathPattern.test(new URL(url).pathname);
  } catch {
    return contactPathPattern.test(url);
  }
}

export function validateCommercialSignalCandidate({
  text,
  sourceUrl,
  sourceTitle,
  confidence,
  detectedAt,
}: CandidateInput): CommercialSignal | null {
  const normalizedText = normalize(text ?? "");
  const normalizedSourceUrl = normalize(sourceUrl ?? "");

  if (!normalizedText || !normalizedSourceUrl) {
    return null;
  }

  const eventFragment = splitFragments(normalizedText).find(
    (fragment) => getSignalType(fragment) !== "none",
  );

  if (!eventFragment) {
    return null;
  }

  const signalType = getSignalType(eventFragment);

  if (
    signalType === "none" ||
    genericDescriptionPatterns.some((pattern) => pattern.test(eventFragment))
  ) {
    return null;
  }

  const contactHeavy = contactMarkerShare(normalizedText) >= 2;
  const contactSource = isContactSourceUrl(normalizedSourceUrl);

  if ((contactHeavy || contactSource) && contactMarkerShare(eventFragment) >= 1) {
    return null;
  }

  const normalizedConfidence = Math.max(
    0,
    Math.min(100, Math.round(confidence ?? 70)),
  );

  return {
    type: signalType,
    summary: eventFragment.slice(0, 280),
    evidence: eventFragment.slice(0, 500),
    sourceUrl: normalizedSourceUrl,
    sourceTitle: sourceTitle ? normalize(sourceTitle).slice(0, 200) : undefined,
    detectedAt: detectedAt || undefined,
    confidence: contactSource
      ? Math.min(normalizedConfidence, 80)
      : normalizedConfidence,
  };
}

export function getCommercialSignalTypeLabel(
  type: CommercialSignalType,
): string {
  const labels: Record<CommercialSignalType, string> = {
    hiring: "Найм",
    expansion: "Расширение",
    new_location: "Новая локация",
    new_product: "Новый продукт",
    new_service: "Новая услуга",
    partnership: "Партнёрство",
    investment: "Инвестиции",
    sales_growth: "Рост продаж",
    digital_transformation: "Цифровая трансформация",
    customer_service_growth: "Рост клиентского сервиса",
    infrastructure_change: "Изменение инфраструктуры",
    procurement_activity: "Закупочная активность",
    market_entry: "Выход на рынок",
    leadership_change: "Изменение руководства",
    other_verified: "Другое подтверждённое событие",
    none: "Нет подтверждённого сигнала",
  };

  return labels[type];
}
