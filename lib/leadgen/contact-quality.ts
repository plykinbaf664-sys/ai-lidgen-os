export type NormalizedEmailClassification =
  | "VERIFIED_PERSONAL"
  | "HIGH_CONFIDENCE_PERSONAL"
  | "INFERRED_PERSONAL"
  | "DEPARTMENT"
  | "GENERAL"
  | "INVALID";

export type ContactLevel = "A" | "B" | "C" | "D" | "E";

const departmentPrefix = /^(?:sales|sale|commercial|commerce|marketing|market|partners?|partnership|press|pr|support|help|service|hr|career|jobs?|recruit|zakaz|order|client)(?:[._+-]|$)/i;
const generalPrefix = /^(?:info|hello|office|contact|mail|reception|admin|feedback|review|reviews|otzyv|vozvrat|callback|claims?)(?:[._+-]|$)/i;

export function isSyntacticallyUsableEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return !/%[0-9a-f]{2}/i.test(normalized) &&
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(normalized);
}

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

function localPart(email: string): string {
  return email.trim().toLowerCase().split("@")[0] ?? "";
}

export function classifyEvidenceBackedEmail({
  email,
  officialDomain,
  confirmedPerson,
  directPersonEvidence = false,
  generatedFromPattern = false,
  patternSupport = 0,
  mxVerified = false,
  confirmedCorporateAlias = false,
}: {
  email: string;
  officialDomain: string;
  confirmedPerson: boolean;
  directPersonEvidence?: boolean;
  generatedFromPattern?: boolean;
  patternSupport?: number;
  mxVerified?: boolean;
  confirmedCorporateAlias?: boolean;
}): NormalizedEmailClassification {
  if (!isSyntacticallyUsableEmail(email)) return "INVALID";
  const domain = emailDomain(email);
  const normalizedDomain = officialDomain.trim().toLowerCase().replace(/^www\./, "");
  if (
    !normalizedDomain ||
    (!confirmedCorporateAlias && domain !== normalizedDomain && !domain.endsWith(`.${normalizedDomain}`))
  ) {
    return "INVALID";
  }

  const local = localPart(email);
  if (/^(?:ir|investor)(?:[._+-]|$)/i.test(local)) return "DEPARTMENT";
  if (departmentPrefix.test(local)) return "DEPARTMENT";
  if (generalPrefix.test(local)) return "GENERAL";
  if (confirmedPerson && directPersonEvidence) return "VERIFIED_PERSONAL";
  if (confirmedPerson && generatedFromPattern && patternSupport >= 2 && mxVerified) {
    return "HIGH_CONFIDENCE_PERSONAL";
  }
  if (confirmedPerson && generatedFromPattern) return "INFERRED_PERSONAL";

  // A custom or dotted mailbox without person evidence is still only a
  // corporate entry point. Punctuation is never identity evidence.
  return "GENERAL";
}

export function getContactLevel({
  confirmedPerson,
  classification,
  relevantDepartment = true,
}: {
  confirmedPerson: boolean;
  classification: NormalizedEmailClassification;
  relevantDepartment?: boolean;
}): { level: ContactLevel | null; ready: boolean } {
  if (classification === "INVALID") return { level: null, ready: false };
  if (confirmedPerson && classification === "VERIFIED_PERSONAL") {
    return { level: "A", ready: true };
  }
  if (
    confirmedPerson &&
    classification === "HIGH_CONFIDENCE_PERSONAL"
  ) {
    return { level: "B", ready: true };
  }
  if (confirmedPerson && classification === "DEPARTMENT" && relevantDepartment) {
    return { level: "C", ready: true };
  }
  if (
    confirmedPerson &&
    (classification === "GENERAL" ||
      (classification === "DEPARTMENT" && !relevantDepartment))
  ) {
    return { level: "D", ready: true };
  }
  if (
    !confirmedPerson &&
    (classification === "DEPARTMENT" || classification === "GENERAL")
  ) {
    return { level: "E", ready: true };
  }
  return { level: null, ready: false };
}
