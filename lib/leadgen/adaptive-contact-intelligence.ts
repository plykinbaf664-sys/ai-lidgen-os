import { resolveMx } from "node:dns/promises";
import type {
  ContactDiscoveryResult,
  ContactIntelligenceEvidence,
  ContactIntelligenceResult,
  DecisionMakerProfile,
  LeadgenCompany,
  LeadgenContact,
  PeopleDiscoveryResult,
  PersonCandidate,
} from "@/lib/leadgen/types";

const mxCache = new Map<string, Promise<boolean>>();

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function getContactedPersonKey(companyName: string, personName: string): string {
  return `${normalize(companyName)}|${normalize(personName)}`;
}

function getDomain(value: string | null | undefined): string | null {
  const candidate = (value ?? "").trim().toLowerCase();
  if (!candidate) return null;
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname
      .replace(/^www\./, "");
  } catch {
    return candidate.replace(/^www\./, "").split("/")[0] || null;
  }
}

function getEmailDomain(email: string | null | undefined): string | null {
  const parts = (email ?? "").trim().toLowerCase().split("@");
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

async function domainHasMx(domain: string | null): Promise<boolean> {
  if (!domain) return false;
  if (!mxCache.has(domain)) {
    mxCache.set(
      domain,
      resolveMx(domain).then((records) => records.length > 0).catch(() => false),
    );
  }
  return mxCache.get(domain)!;
}

const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function transliteratePersonPart(value: string): string {
  return normalize(value)
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .replace(/[^a-z0-9]+/g, "");
}

type PatternEvidence = { fullName: string; email: string };

function derivePattern(evidence: PatternEvidence): string | null {
  const [first = "", last = "", middle = ""] = evidence.fullName.trim().split(/\s+/);
  const tokens = {
    first: transliteratePersonPart(first),
    last: transliteratePersonPart(last),
    middle: transliteratePersonPart(middle),
  };
  let local = evidence.email.toLowerCase().split("@")[0] ?? "";
  if (!local || !tokens.first || !tokens.last) return null;

  const replacements: Array<[string, string]> = [
    [tokens.first, "{first}"],
    [tokens.last, "{last}"],
    [tokens.middle, "{middle}"],
  ];
  for (const [value, token] of replacements.sort((a, b) => b[0].length - a[0].length)) {
    if (value.length >= 2) local = local.replaceAll(value, token);
  }
  local = local
    .replace(new RegExp(`(^|[._-])${tokens.first[0]}(?=[._-]|\\{last\\})`), "$1{first_initial}")
    .replace(new RegExp(`(^|[._-])${tokens.last[0]}(?=[._-]|\\{first\\})`), "$1{last_initial}");
  return local.includes("{first") || local.includes("{last") ? local : null;
}

export function inferCorporateEmailPattern(
  evidence: PatternEvidence[],
): { pattern: string | null; support: number } {
  const counts = new Map<string, number>();
  for (const item of evidence) {
    const pattern = derivePattern(item);
    if (pattern) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return { pattern: best?.[0] ?? null, support: best?.[1] ?? 0 };
}

export function applyCorporateEmailPattern({
  pattern,
  fullName,
  domain,
}: {
  pattern: string;
  fullName: string;
  domain: string;
}): string | null {
  const [first = "", last = "", middle = ""] = fullName.trim().split(/\s+/);
  const values = {
    first: transliteratePersonPart(first),
    last: transliteratePersonPart(last),
    middle: transliteratePersonPart(middle),
  };
  if (!values.first || !values.last) return null;
  const local = pattern
    .replaceAll("{first}", values.first)
    .replaceAll("{last}", values.last)
    .replaceAll("{middle}", values.middle)
    .replaceAll("{first_initial}", values.first[0])
    .replaceAll("{last_initial}", values.last[0]);
  return /^[a-z0-9][a-z0-9._-]*$/.test(local) ? `${local}@${domain}` : null;
}

function sourceLooksLikeRegistry(url: string | null | undefined): boolean {
  const host = getDomain(url);
  return Boolean(host && /(?:rusprofile|spark-interfax|list-org|checko|audit-it)\./.test(host));
}

function choosePerson(people: PeopleDiscoveryResult): PersonCandidate | null {
  return people.primary_person ?? people.alternative_people[0] ?? null;
}

function compactEvidence(items: ContactIntelligenceEvidence[]): ContactIntelligenceEvidence[] {
  return items
    .filter((item, index, all) =>
      all.findIndex((candidate) => candidate.kind === item.kind && candidate.summary === item.summary) === index,
    )
    .slice(0, 8);
}

export async function evaluateAdaptiveContactIntelligence({
  company,
  decisionMaker,
  peopleDiscovery,
  contactDiscovery,
  knownPersonKeys = [],
  verifyMx = domainHasMx,
}: {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  peopleDiscovery: PeopleDiscoveryResult;
  contactDiscovery: ContactDiscoveryResult;
  knownPersonKeys?: Iterable<string>;
  verifyMx?: (domain: string | null) => Promise<boolean>;
}): Promise<ContactIntelligenceResult> {
  const person = choosePerson(peopleDiscovery);
  const officialDomain = getDomain(
    contactDiscovery.resolved_official_domain ?? contactDiscovery.official_website ?? company.company_domain,
  );
  const directContacts = contactDiscovery.contacts
    .filter((contact) => contact.contact_type === "work_email" && contact.email && contact.full_name)
    .sort((left, right) => {
      const primaryName = normalize(person?.full_name);
      return Number(normalize(right.full_name) === primaryName) - Number(normalize(left.full_name) === primaryName) ||
        right.confidence_score - left.confidence_score;
    });
  const direct = directContacts[0] ?? null;
  const selectedPersonName = direct?.full_name ?? person?.full_name ?? null;
  const selectedRole = direct?.role_title ?? person?.role_title ?? null;
  const isRoutingContact = direct?.metadata.contact_route === "corporate_router";
  const duplicatePerson = selectedPersonName
    ? new Set(knownPersonKeys).has(getContactedPersonKey(company.company_name, selectedPersonName))
    : false;
  const directDomain = getEmailDomain(direct?.email);
  const mxVerified = await verifyMx(directDomain ?? officialDomain);
  const sourceDomain = getDomain(direct?.source_url);
  const aliasPublishedOnOfficialSite = Boolean(
    directDomain && officialDomain && directDomain !== officialDomain && sourceDomain === officialDomain,
  );
  const domainMatch = Boolean(directDomain && officialDomain && (
    directDomain === officialDomain || directDomain.endsWith(`.${officialDomain}`)
  )) || aliasPublishedOnOfficialSite;
  const directPublished = Boolean(
    direct?.source_url && !sourceLooksLikeRegistry(direct.source_url) &&
      (direct.metadata.email_extraction_method || direct.metadata.email_classification || direct.metadata.people_discovery_source),
  );
  const personEvidence = person?.evidence ?? [];
  const evidence: ContactIntelligenceEvidence[] = [];
  if (selectedPersonName) evidence.push({ kind: "person", source_url: direct?.source_url ?? null, summary: `${selectedPersonName} подтверждён публичным источником.` });
  if (selectedRole) evidence.push({
    kind: "role",
    source_url: direct?.source_url ?? null,
    summary: isRoutingContact
      ? "Контакт публично указан компанией; владение бизнес-задачей не предполагается."
      : `Роль связана с зоной ответственности: ${decisionMaker.business_problem_owner}.`,
  });
  if (direct?.email) evidence.push({ kind: "email", source_url: direct.source_url, summary: directPublished ? "Email опубликован в публичном профессиональном контексте." : "Email найден, но публикация требует дополнительного подтверждения." });
  if (domainMatch) evidence.push({ kind: "domain", source_url: contactDiscovery.official_website, summary: aliasPublishedOnOfficialSite ? "Email-домен опубликован на официальном сайте как корпоративный alias." : "Email относится к подтверждённому корпоративному домену." });
  if (mxVerified) evidence.push({ kind: "verification", source_url: null, summary: "Для домена найдены MX-записи; писем при проверке не отправлялось." });
  for (const item of personEvidence.slice(0, 2)) evidence.push({ kind: "person", source_url: direct?.source_url ?? null, summary: item.slice(0, 180) });

  const patternEvidence = directContacts
    .filter((contact): contact is LeadgenContact & { full_name: string; email: string } => Boolean(contact.full_name && contact.email))
    .map((contact) => ({ fullName: contact.full_name, email: contact.email }));
  const inferred = inferCorporateEmailPattern(patternEvidence);
  const generated = !direct?.email && person && officialDomain && inferred.pattern && inferred.support >= 2
    ? applyCorporateEmailPattern({ pattern: inferred.pattern, fullName: person.full_name, domain: officialDomain })
    : null;
  if (inferred.pattern) evidence.push({ kind: "pattern", source_url: contactDiscovery.official_website, summary: `Corporate pattern выведен из ${inferred.support} опубликованных соответствий ФИО и email.` });

  const directHigh = Boolean(
    direct?.email && selectedPersonName && selectedRole && domainMatch && mxVerified &&
      directPublished && direct.confidence_score >= 70 && !duplicatePerson,
  );
  const confidence = directHigh
    ? "HIGH"
    : direct?.email || generated
      ? "MEDIUM"
      : contactDiscovery.fallback_entry?.email
        ? "LOW"
        : "UNRESOLVED";
  const fallback = contactDiscovery.fallback_entry?.email ?? null;

  return {
    business_problem: decisionMaker.expected_pain,
    target_responsibility: decisionMaker.business_problem_owner,
    target_persona: decisionMaker.primary_persona,
    alternative_personas: decisionMaker.alternative_personas.slice(0, 5),
    why_this_person: selectedPersonName
      ? isRoutingContact
        ? `${selectedPersonName} — публично подтверждённый корпоративный контакт, выбранный как маршрутизатор; роль владельца задачи не приписывается.`
        : `${selectedRole ?? "Подтверждённый сотрудник"}: ${decisionMaker.reasoning}`
      : decisionMaker.reasoning,
    person_name: selectedPersonName,
    person_role: selectedRole,
    email: direct?.email ?? generated ?? fallback,
    email_type: direct?.email
      ? isRoutingContact ? "corporate_router" : "public_personal"
      : generated
        ? "pattern_candidate"
        : fallback
          ? contactDiscovery.fallback_entry?.contact_type === "generic_email" ? "generic_fallback" : "department_fallback"
          : "none",
    verification_methods: [
      ...(domainMatch ? ["corporate_domain_match"] : []),
      ...(mxVerified ? ["mx"] : []),
      ...(directPublished ? ["public_evidence"] : []),
      ...(inferred.pattern ? ["corporate_pattern"] : []),
    ],
    confidence,
    readiness: directHigh ? "contact_ready" : direct?.email || generated ? "manual_verification" : fallback ? "fallback_only" : "unresolved",
    evidence: compactEvidence(evidence),
    inferred_pattern: inferred.pattern,
    pattern_support: inferred.support,
    generated_candidates: generated ? [generated] : [],
    catch_all: "unknown",
    smtp_verification: "not_performed",
    strategies_attempted: [
      "dynamic_role_resolution",
      "adaptive_public_person_search",
      "public_person_email_search",
      "corporate_pattern_inference",
      "domain_and_mx_validation",
    ],
    stop_reason: duplicatePerson
      ? "duplicate_person"
      : directHigh
        ? "contact_ready_high_confidence"
        : direct?.email
          ? "personal_email_requires_manual_verification"
          : generated
            ? "generated_candidate_not_publicly_confirmed"
            : person
              ? "person_found_personal_email_unresolved"
              : fallback
                ? "generic_fallback_does_not_qualify"
                : "no_material_next_step_available",
  };
}

export function createUnresolvedContactIntelligence({
  decisionMaker,
  peopleDiscovery,
  stopReason,
}: {
  decisionMaker: DecisionMakerProfile;
  peopleDiscovery: PeopleDiscoveryResult;
  stopReason: string;
}): ContactIntelligenceResult {
  const person = choosePerson(peopleDiscovery);
  return {
    business_problem: decisionMaker.expected_pain,
    target_responsibility: decisionMaker.business_problem_owner,
    target_persona: decisionMaker.primary_persona,
    alternative_personas: decisionMaker.alternative_personas.slice(0, 5),
    why_this_person: decisionMaker.reasoning,
    person_name: person?.full_name ?? null,
    person_role: person?.role_title ?? null,
    email: null,
    email_type: "none",
    verification_methods: [],
    confidence: "UNRESOLVED",
    readiness: "unresolved",
    evidence: [],
    inferred_pattern: null,
    pattern_support: 0,
    generated_candidates: [],
    catch_all: "unknown",
    smtp_verification: "not_performed",
    strategies_attempted: ["contact_evaluation"],
    stop_reason: stopReason,
  };
}

export function attachContactIntelligence(
  result: ContactDiscoveryResult,
  intelligence: ContactIntelligenceResult,
): ContactDiscoveryResult {
  const contacts = result.contacts.map((contact) => ({
    ...contact,
    metadata: {
      ...contact.metadata,
      ...((contact.email === intelligence.email && contact.contact_type === "work_email") ||
      (!intelligence.email && contact.id === result.best_available_entry.id)
        ? { contact_intelligence: intelligence }
        : {}),
    },
  }));
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  return {
    ...result,
    contacts,
    best_available_entry: byId.get(result.best_available_entry.id) ?? result.best_available_entry,
    best_outreach_entry: result.best_outreach_entry ? byId.get(result.best_outreach_entry.id) ?? result.best_outreach_entry : null,
    fallback_entry: result.fallback_entry ? byId.get(result.fallback_entry.id) ?? result.fallback_entry : null,
    alternative_channels: result.alternative_channels.map((contact) => byId.get(contact.id) ?? contact),
  };
}

export function isContactReadyPerson(contact: LeadgenContact): boolean {
  return contact.contact_type === "work_email" && Boolean(contact.email && contact.full_name && contact.role_title) &&
    contact.metadata.contact_intelligence?.confidence === "HIGH" &&
    contact.metadata.contact_intelligence.readiness === "contact_ready";
}

export function isConfirmedOutreachEmail(contact: LeadgenContact): boolean {
  if (isContactReadyPerson(contact)) return true;
  if (!contact.email || (contact.contact_type !== "work_email" && contact.contact_type !== "generic_email")) {
    return false;
  }
  const status = typeof contact.metadata.email_status === "string"
    ? contact.metadata.email_status
    : "";
  return [
    "personal_email_ready",
    "work_email_ready",
    "department_email_ready",
    "company_email_ready",
  ].includes(status) &&
    contact.metadata.email_mx_verified === true &&
    typeof contact.metadata.email_domain_match_reason === "string" &&
    Boolean(contact.source_url);
}
