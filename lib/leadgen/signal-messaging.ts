import type { SignalType } from "@/lib/leadgen/types";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";

export type SignalVariant =
  | "hiring_sales"
  | "hiring_support"
  | "hiring_general"
  | "product_launch"
  | "expansion"
  | "tech_change"
  | "growth"
  | "weak";

export type SignalMessageContext = {
  signalType?: SignalType | string | null;
  signalTitle?: string | null;
  signalDetail?: string | null;
  whyNow?: string | null;
  confidenceScore?: number | null;
  evidenceQuality?: string | null;
};

function getSignalText(context: SignalMessageContext): string {
  return [
    context.signalTitle,
    context.signalDetail,
    context.whyNow,
  ]
    .filter(Boolean)
    .map((item) =>
      normalizeLeadgenText(String(item), { source: "signal.message.text" }),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakEvidence(context: SignalMessageContext, text: string): boolean {
  return (
    context.evidenceQuality === "weak_context" ||
    context.evidenceQuality === "topic_only" ||
    (typeof context.confidenceScore === "number" && context.confidenceScore < 50) ||
    text.length < 20
  );
}

export function getSignalVariant(context: SignalMessageContext): SignalVariant {
  const text = getSignalText(context).toLowerCase();

  if (isWeakEvidence(context, text)) {
    return "weak";
  }

  if (context.signalType === "HIRING_SIGNAL") {
    if (
      /продаж|sales|sdr|bdr|account executive|аккаунт|коммерческ|роп|руководител[ья] отдела продаж|менеджер[а-я\s-]*по продаж/.test(
        text,
      )
    ) {
      return "hiring_sales";
    }

    if (/поддержк|support|customer service|клиентск|сервис|оператор/.test(text)) {
      return "hiring_support";
    }

    return "hiring_general";
  }

  if (context.signalType === "GO_TO_MARKET_SIGNAL") {
    return "product_launch";
  }

  if (context.signalType === "TECH_SIGNAL" || context.signalType === "TECH_CHANGE_SIGNAL") {
    return "tech_change";
  }

  if (
    context.signalType === "GROWTH_SIGNAL" ||
    context.signalType === "EXPANSION_SIGNAL"
  ) {
    return /регион|филиал|выход|расшир/.test(text) ? "expansion" : "growth";
  }

  return "growth";
}

export function getShortWhyNow(context: SignalMessageContext): string {
  const variant = getSignalVariant(context);

  if (variant === "hiring_sales") {
    return "Открыли вакансии в отделе продаж.";
  }

  if (variant === "hiring_support") {
    return "Расширяют клиентскую поддержку.";
  }

  if (variant === "hiring_general") {
    return "Открыли новую вакансию.";
  }

  if (variant === "product_launch") {
    return "Запускают продукт или новое направление.";
  }

  if (variant === "expansion") {
    return "Расширяют бизнес или выходят в новый регион.";
  }

  if (variant === "tech_change") {
    return "Меняют технологии или рабочие процессы.";
  }

  if (variant === "weak") {
    return "Сигнал требует проверки.";
  }

  return "Найден возможный признак роста.";
}

export function getSignalEvidenceSentence(context: SignalMessageContext): string {
  const text = getSignalText(context);
  const cleanText = text
    .replace(/^company is hiring or expanding the team\s*/i, "")
    .replace(/^company shows a growth or expansion signal:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleanText || getShortWhyNow(context);
}

export function getSignalHypothesis(context: SignalMessageContext): {
  subject: string;
  problem: string;
  value: string;
  cta: string;
} {
  const variant = getSignalVariant(context);

  if (variant === "hiring_sales") {
    return {
      subject: "Идея для команды продаж",
      problem:
        "При активном найме в продажах обычно быстрее всего растёт нагрузка на квалификацию заявок, повторные касания и контроль менеджеров.",
      value:
        "Мы внедряем ИИ-системы, которые снимают часть этой ручной работы и помогают не терять лидов при росте команды.",
      cta: "Могу прислать 2-3 идеи, что можно автоматизировать именно в вашем процессе?",
    };
  }

  if (variant === "hiring_support") {
    return {
      subject: "Идея для клиентского сервиса",
      problem:
        "Когда растёт поддержка, часто усложняются маршрутизация обращений, скорость ответов и контроль повторяющихся запросов.",
      value:
        "Мы внедряем ИИ-системы, которые берут на себя часть типовых обращений и помогают команде быстрее разбирать входящий поток.",
      cta: "Могу прислать 2-3 идеи, где это обычно даёт быстрый эффект?",
    };
  }

  if (variant === "product_launch") {
    return {
      subject: "Идея к запуску продукта",
      problem:
        "После запуска нового продукта обычно растёт нагрузка на обработку лидов, передачу между маркетингом и продажами и первые клиентские коммуникации.",
      value:
        "Мы внедряем ИИ-системы, которые помогают быстрее обрабатывать входящие запросы и не терять контекст между командами.",
      cta: "Могу прислать 2-3 идеи для такого этапа?",
    };
  }

  if (variant === "tech_change") {
    return {
      subject: "Идея по автоматизации процессов",
      problem:
        "При изменении технологий часто появляются ручные переносы данных, разрывы между системами и новые операционные ошибки.",
      value:
        "Мы внедряем ИИ-системы, которые связывают рабочие процессы и убирают часть ручной координации.",
      cta: "Могу показать 2-3 сценария, где это проще всего применить?",
    };
  }

  if (variant === "expansion" || variant === "growth") {
    return {
      subject: "Автоматизация при масштабировании",
      problem:
        "При масштабировании быстро растёт объём ручных передач, контроля новых потоков и повторяющихся операционных задач.",
      value:
        "Мы внедряем ИИ-системы, которые помогают удерживать скорость процессов без постоянного увеличения ручной нагрузки.",
      cta: "Могу прислать 2-3 идеи, что стоит автоматизировать первым?",
    };
  }

  return {
    subject: "Короткая идея по автоматизации",
    problem:
      "Похоже, у компании есть рабочий сигнал, но его стоит дополнительно проверить перед точным предложением.",
    value:
      "Мы внедряем ИИ-системы для повторяющихся задач в продажах, клиентских коммуникациях и операционных процессах.",
    cta: "Могу прислать короткий список возможных сценариев?",
  };
}
