import type {
  LeadReadinessStatus,
  LeadgenContact,
  SignalType,
} from "@/lib/leadgen/types";
import {
  isFallbackEmailContact,
  isSendableEmailContact,
} from "@/lib/leadgen/contact-channel-ranking";
import {
  generateFirstEmailV3,
  type OutreachMicroValue,
  type OutreachQualityScore,
} from "@/lib/leadgen/first-email-generator";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";

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

export function buildEmailOutreach({
  companyName,
  companyWebsite,
  companyDescription,
  industry,
  personName,
  personRole,
  contact,
  readiness,
  whyNow,
  selectionReason,
  signalType,
  signalTitle,
  signalDetail,
  signalSourceUrl,
  signalConfidence,
}: {
  companyName: string;
  companyWebsite?: string | null;
  companyDescription?: string | null;
  industry?: string | null;
  personName?: string | null;
  personRole?: string | null;
  contact: LeadgenContact | null;
  readiness: LeadReadinessStatus;
  whyNow: string;
  selectionReason?: string | null;
  signalType?: SignalType | string | null;
  signalTitle?: string | null;
  signalDetail?: string | null;
  signalSourceUrl?: string | null;
  signalConfidence?: number | null;
}): {
  subject: string | null;
  body: string;
  readyToSend: boolean;
  messageMode: EmailMessageMode | null;
  outreachReady: boolean;
  microValue: OutreachMicroValue | null;
  quality: OutreachQualityScore | null;
  qualityGatePassed: boolean;
  generationAttempts: number;
  copyReviewStatus: "ready" | "needs_manual_copy_review" | null;
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
        "Письмо не создано: автоматический поиск не нашёл доступный контакт.",
      readyToSend: false,
      messageMode: null,
      outreachReady: false,
      microValue: null,
      quality: null,
      qualityGatePassed: false,
      generationAttempts: 0,
      copyReviewStatus: null,
    };
  }

  const safeCompanyName = normalizeLeadgenText(companyName, {
    source: "email_outreach.company",
  });
  const messageMode = getMessageMode(contact);
  const firstName = messageMode === "personal" ? getFirstName(personName) : null;
  const copy = generateFirstEmailV3({
    companyName: safeCompanyName,
    website: companyWebsite,
    companyDescription,
    industry,
    decisionMakerName: firstName,
    decisionMakerRole: personRole ?? contact.role_title,
    contactEmail: contact.email,
    messageMode,
    growthSignal: [signalType, signalTitle, signalDetail, whyNow]
      .filter(Boolean)
      .join(" "),
    selectionReason,
    signalType,
    signalEvidence: signalDetail || signalTitle || whyNow,
    signalSourceUrl,
    uniquenessKey: `${contact.id}:${contact.email ?? ""}:${signalConfidence ?? ""}`,
  });

  return {
    subject: copy.subject,
    readyToSend: true,
    outreachReady: true,
    messageMode,
    body: copy.body,
    microValue: copy.microValue,
    quality: copy.quality,
    qualityGatePassed: copy.qualityGatePassed,
    generationAttempts: copy.generationAttempts,
    copyReviewStatus: copy.reviewStatus,
  };
}
