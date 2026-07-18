import type {
  LeadReadinessStatus,
  LeadgenContact,
  SignalType,
} from "@/lib/leadgen/types";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import {
  getShortWhyNow,
  getSignalEvidenceSentence,
  getSignalHypothesis,
  getSignalVariant,
} from "@/lib/leadgen/signal-messaging";

export type EmailMessageMode = "personal" | "department" | "generic_routing";

function getFirstName(fullName?: string | null): string | null {
  if (!fullName) {
    return null;
  }

  const normalizedName = normalizeLeadgenText(fullName, {
    source: "email_outreach.person_name",
  });
  const firstName = normalizedName.split(/\s+/)[0]?.trim();

  return firstName && firstName.length >= 2 ? firstName : null;
}

function getMessageMode(contact: LeadgenContact): EmailMessageMode {
  const classification =
    typeof contact.metadata.email_classification === "string"
      ? contact.metadata.email_classification
      : "";
  const localPart = contact.email?.split("@")[0]?.toLowerCase() ?? "";

  if (
    contact.contact_type === "work_email" &&
    (classification === "personal_verified" ||
      classification === "work_verified")
  ) {
    return "personal";
  }

  if (
    classification === "department_verified" ||
    /^(sales|sale|commercial|commerce|marketing|support|partners|partner|pr|press|client|service)$/.test(
      localPart,
    )
  ) {
    return "department";
  }

  return "generic_routing";
}

function getSubject({
  companyName,
  signalType,
  signalTitle,
  signalDetail,
  whyNow,
}: {
  companyName: string;
  signalType?: SignalType | string | null;
  signalTitle?: string | null;
  signalDetail?: string | null;
  whyNow: string;
}): string {
  const safeCompanyName = normalizeLeadgenText(companyName, {
    source: "email_outreach.company",
  });
  const context = { signalType, signalTitle, signalDetail, whyNow };
  const variant = getSignalVariant(context);
  const hypothesis = getSignalHypothesis(context);

  if (variant === "hiring_sales") {
    return /отдел продаж/i.test(whyNow)
      ? "Пока расширяете отдел продаж"
      : hypothesis.subject;
  }

  if (variant === "product_launch") {
    return "Идея к запуску продукта";
  }

  if (variant === "hiring_support") {
    return "Как разгрузить поддержку";
  }

  if (variant === "tech_change") {
    return "Как снизить ручную работу";
  }

  if (variant === "expansion" || variant === "growth") {
    return "Автоматизация при масштабировании";
  }

  return safeCompanyName.length <= 24
    ? `Идея для ${safeCompanyName}`
    : hypothesis.subject;
}

export function buildEmailOutreach({
  companyName,
  personName,
  contact,
  readiness,
  whyNow,
  signalType,
  signalTitle,
  signalDetail,
}: {
  companyName: string;
  personName?: string | null;
  contact: LeadgenContact | null;
  readiness: LeadReadinessStatus;
  whyNow: string;
  signalType?: SignalType | string | null;
  signalTitle?: string | null;
  signalDetail?: string | null;
}): {
  subject: string | null;
  body: string;
  readyToSend: boolean;
  messageMode: EmailMessageMode | null;
  outreachReady: boolean;
} {
  if (
    !contact ||
    (readiness === "outreach_ready" && !isSendableEmailContact(contact)) ||
    (readiness === "fallback_ready" && !isFallbackEmailContact(contact)) ||
    (readiness !== "outreach_ready" && readiness !== "fallback_ready")
  ) {
    return {
      subject: null,
      body:
        "Email не найден.\n\nЧерновик будет подготовлен после нахождения подходящего email.",
      readyToSend: false,
      messageMode: null,
      outreachReady: false,
    };
  }

  const safeCompanyName = normalizeLeadgenText(companyName, {
    source: "email_outreach.company",
  });
  const context = { signalType, signalTitle, signalDetail, whyNow };
  const shortWhyNow = getShortWhyNow(context).replace(/\.$/, "").toLowerCase();
  const evidence = getSignalEvidenceSentence(context);
  const hypothesis = getSignalHypothesis(context);
  const subject = getSubject({
    companyName: safeCompanyName,
    signalType,
    signalTitle,
    signalDetail,
    whyNow,
  });
  const messageMode = getMessageMode(contact);
  const firstName = messageMode === "personal" ? getFirstName(personName) : null;
  const signalLine =
    shortWhyNow === "сигнал требует проверки"
      ? `Нашёл публичный сигнал по ${safeCompanyName}: ${evidence}.`
      : `Увидел, что ${safeCompanyName} ${shortWhyNow}.`;

  if (messageMode === "personal" && firstName) {
    return {
      subject,
      readyToSend: true,
      outreachReady: true,
      messageMode,
      body: `${firstName}, добрый день.\n\n${signalLine}\n\n${hypothesis.problem}\n\n${hypothesis.value}\n\n${hypothesis.cta}`,
    };
  }

  if (messageMode === "department") {
    return {
      subject,
      readyToSend: true,
      outreachReady: true,
      messageMode,
      body: `Добрый день.\n\n${signalLine}\n\n${hypothesis.problem}\n\n${hypothesis.value}\n\nПодскажите, пожалуйста, кто у вас отвечает за развитие и автоматизацию этого направления?`,
    };
  }

  return {
    subject,
    readyToSend: true,
    outreachReady: true,
    messageMode,
    body: `Добрый день.\n\n${signalLine}\n\nХотел направить короткое предложение по автоматизации повторяющихся задач с помощью ИИ.\n\nПодскажите, пожалуйста, кому лучше адресовать 2-3 конкретные идеи по этой задаче?`,
  };
}
