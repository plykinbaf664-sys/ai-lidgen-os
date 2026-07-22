import type { PersonCandidate } from "@/lib/leadgen/types";

export type PublicEmailClassification =
  | "personal_verified"
  | "work_verified"
  | "department_verified"
  | "company_generic_verified"
  | "candidate_unverified"
  | "invalid";

export type ParsedPublicEmail = {
  email: string;
  source_url: string | null;
  context: string;
  classification: PublicEmailClassification;
  confidence_score: number;
  extraction_method: string;
};

export type RejectedPublicEmail = {
  value: string;
  source_url: string | null;
  reason: string;
  context: string;
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const mailtoPattern = /mailto:\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const departmentPrefixPattern =
  /^(sales|sale|commercial|commerce|partner|partners|partnership|bizdev|marketing|press|pr|client|clients|customer|service|support|help|zakaz|order)@/i;
const genericPrefixPattern =
  /^(info|contact|hello|office|mail|admin|welcome|reception)@/i;
const technicalPrefixPattern =
  /^(no-?reply|noreply|donotreply|robot|mailer-daemon|postmaster|webmaster|abuse|hostmaster|privacy|legal|test|example|dev|null|undefined)@/i;

const ruTranslitMap: Record<string, string> = {
  "\u0430": "a",
  "\u0431": "b",
  "\u0432": "v",
  "\u0433": "g",
  "\u0434": "d",
  "\u0435": "e",
  "\u0451": "e",
  "\u0436": "zh",
  "\u0437": "z",
  "\u0438": "i",
  "\u0439": "i",
  "\u043a": "k",
  "\u043b": "l",
  "\u043c": "m",
  "\u043d": "n",
  "\u043e": "o",
  "\u043f": "p",
  "\u0440": "r",
  "\u0441": "s",
  "\u0442": "t",
  "\u0443": "u",
  "\u0444": "f",
  "\u0445": "h",
  "\u0446": "ts",
  "\u0447": "ch",
  "\u0448": "sh",
  "\u0449": "sch",
  "\u044a": "",
  "\u044b": "y",
  "\u044c": "",
  "\u044d": "e",
  "\u044e": "yu",
  "\u044f": "ya",
};

function normalizeEmail(value: string): string | null {
  const email = value
    .trim()
    .toLowerCase()
    .replace(/^mailto:\s*/i, "")
    .replace(/[.,;:)\]}>"']+$/g, "");

  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    return null;
  }

  return email;
}

function deobfuscateText(text: string): string {
  return text
    .replace(/&#64;|&commat;/gi, "@")
    .replace(/&period;|&#46;/gi, ".")
    .replace(
      /([a-z0-9._%+-]+)\s*(?:\(|\[)?\s*(?:at|\u0441\u043e\u0431\u0430\u043a\u0430)\s*(?:\)|\])?\s*([a-z0-9.-]+)\s*(?:\(|\[)?\s*(?:dot|\u0442\u043e\u0447\u043a\u0430|\.)\s*(?:\)|\])?\s*([a-z]{2,})/gi,
      "$1@$2.$3",
    )
    .replace(/\s+\.\.\s+/g, ".")
    .replace(/\s*@\s*/g, "@");
}

function getVisibleText(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getContext(text: string, email: string): string {
  const normalizedText = text.replace(/\s+/g, " ");
  const index = normalizedText.toLowerCase().indexOf(email.toLowerCase());

  if (index < 0) {
    return "";
  }

  return normalizedText
    .slice(Math.max(0, index - 110), Math.min(normalizedText.length, index + email.length + 110))
    .trim();
}

function getEmailDomain(email: string): string {
  return email.split("@")[1] ?? "";
}

function transliterateRu(value: string): string {
  return value
    .toLowerCase()
    .split("")
    .map((char) => ruTranslitMap[char] ?? char)
    .join("");
}

function getNameTokens(person?: PersonCandidate | null): string[] {
  if (!person) {
    return [];
  }

  return person.full_name
    .toLowerCase()
    .split(/\s+/)
    .flatMap((token) => [
      token.replace(/[^a-z\u0430-\u044f\u0451]/gi, ""),
      transliterateRu(token).replace(/[^a-z]/g, ""),
    ])
    .filter((token) => token.length >= 3);
}

function isPersonalEmail(email: string, person?: PersonCandidate | null): boolean {
  const localPart = email.split("@")[0] ?? "";
  const tokens = getNameTokens(person);

  return tokens.some((token) => localPart.includes(token));
}

function classifyEmail(
  email: string,
  domainMatched: boolean,
  person?: PersonCandidate | null,
): PublicEmailClassification {
  if (technicalPrefixPattern.test(email)) {
    return "invalid";
  }

  if (departmentPrefixPattern.test(email) && domainMatched) {
    return "department_verified";
  }

  if (genericPrefixPattern.test(email) && domainMatched) {
    return "company_generic_verified";
  }

  if (isPersonalEmail(email, person) && domainMatched) {
    return "personal_verified";
  }

  if (person && domainMatched) {
    return "work_verified";
  }

  if (domainMatched) {
    // A non-technical address published on the company's own domain is a
    // verified corporate entry point even when its local part is custom.
    return "company_generic_verified";
  }

  return "invalid";
}

function getConfidence(
  classification: PublicEmailClassification,
): number {
  const base = {
    personal_verified: 94,
    work_verified: 86,
    department_verified: 74,
    company_generic_verified: 64,
    candidate_unverified: 25,
    invalid: 0,
  } satisfies Record<PublicEmailClassification, number>;

  return base[classification];
}

function getExtractionMethod(text: string, email: string): string {
  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (new RegExp(`mailto:\\s*${escapedEmail}`, "i").test(text)) {
    return "mailto";
  }

  if (/<script[\s\S]*?>[\s\S]*?@[\s\S]*?<\/script>/i.test(text)) {
    return "structured_or_script";
  }

  if (/<meta[\s\S]*?@[\s\S]*?>/i.test(text)) {
    return "meta_tag";
  }

  return "visible_text";
}

function reject(
  value: string,
  sourceUrl: string | null,
  reason: string,
  text: string,
): RejectedPublicEmail {
  return {
    value,
    source_url: sourceUrl,
    reason,
    context: getContext(text, value),
  };
}

export function extractPublicEmailsDetailed({
  text,
  sourceUrl,
  companyDomain,
  person,
}: {
  text: string;
  sourceUrl: string | null;
  companyDomain?: string | null;
  person?: PersonCandidate | null;
}): { emails: ParsedPublicEmail[]; rejected: RejectedPublicEmail[] } {
  const deobfuscatedText = deobfuscateText(text);
  const visibleText = getVisibleText(deobfuscatedText);
  const rawValues = [
    ...deobfuscatedText.matchAll(mailtoPattern),
    ...deobfuscatedText.matchAll(emailPattern),
    ...visibleText.matchAll(emailPattern),
  ].map((match) => match[1] ?? match[0]);
  const rejected: RejectedPublicEmail[] = [];
  const uniqueEmails = new Map<string, ParsedPublicEmail>();
  const expectedDomain = companyDomain?.replace(/^www\./, "").toLowerCase() ?? null;

  for (const rawValue of rawValues) {
    const email = normalizeEmail(rawValue);

    if (!email) {
      rejected.push(reject(rawValue, sourceUrl, "invalid_syntax", visibleText));
      continue;
    }

    const emailDomain = getEmailDomain(email).replace(/^www\./, "");
    const domainMatched = expectedDomain ? emailDomain === expectedDomain : true;
    const classification = classifyEmail(email, domainMatched, person);

    if (classification === "invalid") {
      rejected.push(
        reject(
          email,
          sourceUrl,
          domainMatched ? "technical_or_invalid_address" : "wrong_domain",
          visibleText,
        ),
      );
      continue;
    }

    if (!uniqueEmails.has(email)) {
      uniqueEmails.set(email, {
        email,
        source_url: sourceUrl,
        context: getContext(visibleText, email),
        classification,
        confidence_score: getConfidence(classification),
        extraction_method: getExtractionMethod(deobfuscatedText, email),
      });
    }
  }

  return {
    emails: [...uniqueEmails.values()],
    rejected,
  };
}

export function extractPublicEmails({
  text,
  sourceUrl,
  companyDomain,
  person,
}: {
  text: string;
  sourceUrl: string | null;
  companyDomain?: string | null;
  person?: PersonCandidate | null;
}): ParsedPublicEmail[] {
  return extractPublicEmailsDetailed({
    text,
    sourceUrl,
    companyDomain,
    person,
  }).emails;
}
