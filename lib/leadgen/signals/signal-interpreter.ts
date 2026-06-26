import type { LeadCandidate, LeadgenSignal } from "@/lib/leadgen/types";

export type EvidenceQuality =
  | "confirmed_event"
  | "probable_event"
  | "topic_only"
  | "weak_context";

export type SignalConfidenceLevel =
  | "confirmed"
  | "high_confidence_inference"
  | "medium_confidence_hypothesis"
  | "weak_evidence";

export type SignalInterpretation = {
  confirmed_facts: string[];
  inferred_insights: string[];
  confidence_level: SignalConfidenceLevel;
  signal_summary: string;
  why_it_matters: string;
  why_now: string;
  outreach_hypothesis: string;
  evidence_quality: EvidenceQuality;
  card_signal_title: string;
  should_create_lead: boolean;
};

type InterpretSignalInput = {
  candidate: LeadCandidate;
  primarySignal: LeadgenSignal;
};

function trimSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.match(/^(.+?[.!?])\s/)?.[1];

  return (firstSentence ?? normalized).slice(0, 240);
}

function hasUsefulText(...values: string[]): boolean {
  return values.every((value) => value.trim().length >= 20);
}

function hasUsefulList(values: string[]): boolean {
  return values.some((value) => value.trim().length >= 20);
}

function canCreateLead(interpretation: Omit<SignalInterpretation, "should_create_lead">) {
  return (
    interpretation.confidence_level !== "weak_evidence" &&
    interpretation.evidence_quality !== "topic_only" &&
    hasUsefulList(interpretation.confirmed_facts) &&
    hasUsefulList(interpretation.inferred_insights) &&
    hasUsefulText(
      interpretation.signal_summary,
      interpretation.why_it_matters,
      interpretation.why_now,
      interpretation.outreach_hypothesis,
    )
  );
}

function isRussianCandidate(candidate: LeadCandidate): boolean {
  return candidate.evidence_language === "ru";
}

function getGtmQuality(candidate: LeadCandidate): EvidenceQuality {
  const gtmSignalType = candidate.gtm_signal_type;

  if (gtmSignalType === "confirmed_event") {
    return "confirmed_event";
  }

  if (gtmSignalType === "mixed") {
    return "probable_event";
  }

  if (gtmSignalType === "topic_only") {
    return "topic_only";
  }

  return "weak_context";
}

function interpretGoToMarket({
  candidate,
}: InterpretSignalInput): SignalInterpretation {
  const isRu = isRussianCandidate(candidate);
  const evidenceQuality = getGtmQuality(candidate);
  const hasConfirmedEvent = evidenceQuality === "confirmed_event";
  const confidenceLevel: SignalConfidenceLevel = hasConfirmedEvent
    ? "confirmed"
    : evidenceQuality === "probable_event"
      ? "medium_confidence_hypothesis"
      : "weak_evidence";
  const confirmedFacts = hasConfirmedEvent
    ? [
        isRu
          ? `В источнике есть признаки конкретного go-to-market события у ${candidate.company_name}.`
          : `${candidate.company_name} has evidence of a concrete go-to-market event in the source material.`,
      ]
    : [
        isRu
          ? `Источник связан с темой запуска или вывода продукта на рынок, но не подтверждает событие у ${candidate.company_name}.`
          : `The source material mentions go-to-market or product-launch topics related to ${candidate.company_name}.`,
      ];
  const inferredInsights = hasConfirmedEvent
    ? [
        isRu
          ? "Конкретный запуск или релиз обычно создаёт дополнительную нагрузку на маркетинг, продажи, customer success и коммуникации с клиентами."
          : "A concrete launch or release can create temporary pressure on sales, marketing, customer success, and customer communications.",
      ]
    : [
        isRu
          ? "Это сигнал на уровне темы, а не доказательство недавнего запуска или релиза."
          : "This is only a topic-level signal; it does not prove the company recently launched or released something.",
      ];
  const signalSummary = hasConfirmedEvent
    ? isRu
      ? `Есть признаки, что ${candidate.company_name} анонсировала или запустила конкретный продукт, функцию, интеграцию или выход на рынок.`
      : `${candidate.company_name} appears to have announced or launched a concrete product, feature, integration, or market expansion.`
    : isRu
      ? `Evidence указывает на тему go-to-market, но не подтверждает недавний запуск или релиз у ${candidate.company_name}.`
      : `Evidence points to go-to-market related content, but does not confirm a recent launch or release by ${candidate.company_name}.`;
  const whyItMatters = hasConfirmedEvent
    ? isRu
      ? "Запуск продукта или выход на рынок обычно создаёт дополнительную нагрузку на маркетинг, продажи, customer success, enablement и клиентские коммуникации."
      : "A product or market launch usually creates extra load across marketing, sales, customer success, enablement, and customer communications."
    : isRu
      ? "Это полезный контекст, но его недостаточно, чтобы утверждать наличие активного коммерческого триггера."
      : "This can be useful context, but it is not strong enough to claim an active commercial trigger.";
  const whyNow = hasConfirmedEvent
    ? isRu
      ? "Компания, вероятно, находится в активном окне вывода продукта на рынок, когда командам нужны более чистые процессы и быстрая клиентская коммуникация."
      : "The company appears to be in an active go-to-market window, when teams often need cleaner workflows and faster customer-facing execution."
    : "";
  const outreachHypothesis = hasConfirmedEvent
    ? isRu
      ? "Проверить, где запусковые процессы всё ещё делаются вручную: outbound, handoff клиентам, support или campaign operations."
      : "Check where launch-related work is still handled manually across outbound, customer handoff, support, or campaign operations."
    : "";
  const interpretation: Omit<SignalInterpretation, "should_create_lead"> = {
    confirmed_facts: confirmedFacts,
    inferred_insights: inferredInsights,
    confidence_level: confidenceLevel,
    signal_summary: signalSummary,
    why_it_matters: whyItMatters,
    why_now: whyNow,
    outreach_hypothesis: outreachHypothesis,
    evidence_quality: evidenceQuality,
    card_signal_title: hasConfirmedEvent
      ? isRu
        ? "Компания анонсировала конкретное go-to-market событие"
        : "Company announced a concrete go-to-market event"
      : isRu
        ? "Найден только тематический go-to-market контент"
        : "Only thematic go-to-market content found",
  };

  return {
    ...interpretation,
    should_create_lead: canCreateLead(interpretation),
  };
}

function interpretHiring({
  candidate,
  primarySignal,
}: InterpretSignalInput): SignalInterpretation {
  const isRu = isRussianCandidate(candidate);
  const signalSummary = isRu
    ? `${candidate.company_name} показывает признаки найма: ${trimSentence(primarySignal.signal_detail)}`
    : `${candidate.company_name} shows hiring activity connected to ${trimSentence(primarySignal.signal_detail)}`;
  const whyItMatters = isRu
    ? "Найм в sales, customer success, support, marketing, operations или смежных ролях часто означает, что процессы масштабируются быстрее текущей операционной модели."
    : "Hiring in sales, customer success, support, marketing, operations, or product-adjacent roles often means processes are scaling faster than the existing operating model.";
  const whyNow = isRu
    ? "Сигнал найма указывает, что команда прямо сейчас добавляет capacity и может пересматривать распределение работы до выхода новых людей."
    : "The open hiring signal suggests the team is actively adding capacity and may be reviewing how work is distributed before new people join.";
  const outreachHypothesis = isRu
    ? "Проверить, какие части растущего workflow можно автоматизировать или поддержать AI agents до того, как ручные handoff станут сложнее."
    : "Check which parts of the growing team workflow can be automated or supported with AI agents before manual handoffs become harder to manage.";

  const interpretation: Omit<SignalInterpretation, "should_create_lead"> = {
    confirmed_facts: [
      isRu
        ? `В источнике есть признаки найма у ${candidate.company_name}.`
        : `${candidate.company_name} has hiring-related evidence in the source material.`,
    ],
    inferred_insights: [
      isRu
        ? "Найм может указывать на добавление capacity и изменение распределения работы в команде."
        : "Hiring can indicate the team is adding capacity and may be changing how work is distributed.",
    ],
    confidence_level:
      primarySignal.confidence_score >= 75
        ? "confirmed"
        : "high_confidence_inference",
    signal_summary: signalSummary,
    why_it_matters: whyItMatters,
    why_now: whyNow,
    outreach_hypothesis: outreachHypothesis,
    evidence_quality: "confirmed_event",
    card_signal_title: isRu
      ? "Компания нанимает или расширяет команду"
      : "Company is hiring or expanding the team",
  };

  return {
    ...interpretation,
    should_create_lead: canCreateLead(interpretation),
  };
}

function interpretGrowth({
  candidate,
  primarySignal,
}: InterpretSignalInput): SignalInterpretation {
  const isRu = isRussianCandidate(candidate);
  const signalSummary = isRu
    ? `${candidate.company_name} показывает признаки роста или расширения: ${trimSentence(primarySignal.signal_detail)}`
    : `${candidate.company_name} shows a growth or expansion signal: ${trimSentence(primarySignal.signal_detail)}`;
  const whyItMatters = isRu
    ? "Рост обычно увеличивает операционную нагрузку в привлечении, onboarding, клиентских коммуникациях и внутренней координации."
    : "Growth usually increases operational load across acquisition, onboarding, customer communication, and internal coordination.";
  const whyNow = isRu
    ? "Компания, вероятно, находится в фазе масштабирования, когда пробелы в процессах и ручная работа становятся заметнее."
    : "The company appears to be in a scaling phase, when process gaps and manual work become more visible.";
  const outreachHypothesis = isRu
    ? "Проверить, где рост создаёт повторяемую ручную работу, которую можно перевести в AI-assisted workflows."
    : "Check where growth is creating repeatable manual work that could be turned into AI-assisted workflows.";
  const confidenceLevel: SignalConfidenceLevel =
    primarySignal.confidence_score >= 75
      ? "high_confidence_inference"
      : "medium_confidence_hypothesis";

  const interpretation: Omit<SignalInterpretation, "should_create_lead"> = {
    confirmed_facts: [
      isRu
        ? `В источнике есть признаки роста или расширения у ${candidate.company_name}.`
        : `${candidate.company_name} has growth or expansion-related evidence in the source material.`,
    ],
    inferred_insights: [
      isRu
        ? "Сигнал может указывать на нагрузку масштабирования в acquisition, onboarding, customer operations или внутренней координации."
        : "The signal may indicate scaling pressure across acquisition, onboarding, customer operations, or internal coordination.",
    ],
    confidence_level: confidenceLevel,
    signal_summary: signalSummary,
    why_it_matters: whyItMatters,
    why_now: whyNow,
    outreach_hypothesis: outreachHypothesis,
    evidence_quality: "probable_event",
    card_signal_title: isRu
      ? "Компания показывает сигнал роста или расширения"
      : "Company shows a growth or expansion signal",
  };

  return {
    ...interpretation,
    should_create_lead: canCreateLead(interpretation),
  };
}

function interpretTech({
  candidate,
  primarySignal,
}: InterpretSignalInput): SignalInterpretation {
  const isRu = isRussianCandidate(candidate);
  const signalSummary = isRu
    ? `${candidate.company_name} показывает технологический или automation-сигнал: ${trimSentence(primarySignal.signal_detail)}`
    : `${candidate.company_name} shows technology or automation activity: ${trimSentence(primarySignal.signal_detail)}`;
  const whyItMatters = isRu
    ? "Технологические изменения часто открывают окно для пересмотра workflow, интеграций, передачи данных и AI-assisted operations."
    : "Technology changes often create a practical window to revisit workflows, integrations, data handoffs, and AI-assisted operations.";
  const whyNow = isRu
    ? "Сигнал указывает, что компания уже меняет или оценивает свой операционный стек."
    : "The signal suggests the company is already changing or evaluating its operating stack.";
  const outreachHypothesis = isRu
    ? "Проверить, может ли текущий или новый стек поддержать AI agents для sales, customer operations, support или внутренних workflow."
    : "Check whether the new or existing stack can support AI agents around sales, customer operations, support, or internal workflows.";
  const confidenceLevel: SignalConfidenceLevel =
    primarySignal.confidence_score >= 75
      ? "high_confidence_inference"
      : "medium_confidence_hypothesis";

  const interpretation: Omit<SignalInterpretation, "should_create_lead"> = {
    confirmed_facts: [
      isRu
        ? `В источнике есть технологический или automation-сигнал у ${candidate.company_name}.`
        : `${candidate.company_name} has technology or automation-related evidence in the source material.`,
    ],
    inferred_insights: [
      isRu
        ? "Технологическая активность может быть окном для пересмотра workflow, интеграций и операционных handoff."
        : "Technology activity can create a practical window to revisit workflows, integrations, and operational handoffs.",
    ],
    confidence_level: confidenceLevel,
    signal_summary: signalSummary,
    why_it_matters: whyItMatters,
    why_now: whyNow,
    outreach_hypothesis: outreachHypothesis,
    evidence_quality: "probable_event",
    card_signal_title: isRu
      ? "Компания показывает технологический или automation-сигнал"
      : "Company shows technology or automation activity",
  };

  return {
    ...interpretation,
    should_create_lead: canCreateLead(interpretation),
  };
}

function interpretDefault({
  candidate,
  primarySignal,
}: InterpretSignalInput): SignalInterpretation {
  const isRu = isRussianCandidate(candidate);
  const signalSummary = isRu
    ? `${candidate.company_name} имеет релевантный сигнал: ${trimSentence(primarySignal.signal_detail)}`
    : `${candidate.company_name} has a relevant signal: ${trimSentence(primarySignal.signal_detail)}`;
  const whyItMatters = isRu
    ? "Сигнал может указывать, что бизнес-процесс меняется или становится более требовательным."
    : "The signal may indicate a business process is changing or becoming more demanding.";
  const whyNow = isRu
    ? "У компании есть текущий триггер, который стоит проверить перед outreach."
    : "The company appears to have a current trigger worth reviewing before outreach.";
  const outreachHypothesis = isRu
    ? "Проверить, создаёт ли этот триггер повторяемую ручную работу, которую можно поддержать AI automation."
    : "Check whether the trigger creates repeatable manual work that can be supported with AI automation.";
  const confidenceLevel: SignalConfidenceLevel =
    primarySignal.confidence_score >= 75
      ? "high_confidence_inference"
      : "medium_confidence_hypothesis";

  const interpretation: Omit<SignalInterpretation, "should_create_lead"> = {
    confirmed_facts: [
      isRu
        ? `В источнике есть релевантный сигнал по ${candidate.company_name}.`
        : `${candidate.company_name} has relevant evidence in the source material.`,
    ],
    inferred_insights: [
      isRu
        ? "Сигнал может указывать на текущее изменение бизнес-процесса, которое стоит проверить."
        : "The signal may indicate a current business process change worth checking.",
    ],
    confidence_level: confidenceLevel,
    signal_summary: signalSummary,
    why_it_matters: whyItMatters,
    why_now: whyNow,
    outreach_hypothesis: outreachHypothesis,
    evidence_quality: "probable_event",
    card_signal_title: isRu
      ? "У компании есть релевантный бизнес-сигнал"
      : "Company has a relevant business signal",
  };

  return {
    ...interpretation,
    should_create_lead: canCreateLead(interpretation),
  };
}

export function interpretSignal({
  candidate,
  primarySignal,
}: InterpretSignalInput): SignalInterpretation {
  if (primarySignal.signal_type === "GO_TO_MARKET_SIGNAL") {
    return interpretGoToMarket({ candidate, primarySignal });
  }

  if (primarySignal.signal_type === "HIRING_SIGNAL") {
    return interpretHiring({ candidate, primarySignal });
  }

  if (primarySignal.signal_type === "GROWTH_SIGNAL") {
    return interpretGrowth({ candidate, primarySignal });
  }

  if (primarySignal.signal_type === "TECH_SIGNAL") {
    return interpretTech({ candidate, primarySignal });
  }

  return interpretDefault({ candidate, primarySignal });
}
