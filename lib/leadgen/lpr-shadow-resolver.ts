import { resolveMx } from "node:dns/promises";
import type {
  DecisionMakerProfile,
  LeadgenCompany,
  LeadgenContact,
  PeopleProviderResult,
  PersonCandidate,
} from "@/lib/leadgen/types";
import { RuPublicPeopleProvider } from "@/lib/leadgen/ru-public-people-provider";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import {
  applyLprRolePlan,
  resolveBoundedLprRoles,
  type LprRolePlan,
} from "@/lib/leadgen/lpr-role-resolver";
import {
  classifyEvidenceBackedEmail,
  getContactLevel,
  type ContactLevel,
  type NormalizedEmailClassification,
} from "@/lib/leadgen/contact-quality";
import {
  applyCorporateEmailPattern,
  inferCorporateEmailPattern,
} from "@/lib/leadgen/adaptive-contact-intelligence";
import { emailLocalMatchesPerson } from "@/lib/leadgen/person-email-evidence";
import { runAbortableOperation } from "@/lib/network/abortable-operation";
import {
  cacheLprShadowResult,
  getCachedLprShadowResult,
  getLprShadowCacheKey,
} from "@/lib/leadgen/lpr-shadow-cache";

export type LprShadowResult = {
  companyName: string;
  domain: string | null;
  signal: string | null;
  oldLpr: string | null;
  person: {
    fullName: string;
    role: string;
    normalizedRole: string;
    companyName: string;
    sourceUrl: string;
    evidence: string[];
    freshness: string;
    confidence: number;
  } | null;
  email: string | null;
  inferredEmailCandidate: string | null;
  emailClassification: NormalizedEmailClassification;
  contactLevel: ContactLevel | null;
  ready: boolean;
  latencyMs: number;
  searchAttempts: number;
  officialPagesFetched: number;
  timedOut: boolean;
  abortedRequests: number;
  stopReason: string;
  rolePlan: LprRolePlan;
  cacheHit: boolean;
  checkedAt: string;
  failureAnalysis: NonNullable<NonNullable<PeopleProviderResult["metrics"]>["trace"]>;
};

function boundedInteger(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
}

const SHADOW_TIMEOUT_MS = boundedInteger("LEADGEN_LPR_SHADOW_TIMEOUT_MS", 18_000, 4_000, 30_000);

function domainOf(company: LeadgenCompany): string | null {
  const value = company.company_domain ?? company.metadata.resolved_official_domain;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function sourceUrlOf(person: PersonCandidate): string | null {
  const value = person.metadata.source_url;
  return typeof value === "string" && value.startsWith("http") ? value : null;
}

function isConfirmedPerson(person: PersonCandidate | null): person is PersonCandidate {
  if (!person || !person.role_title || !sourceUrlOf(person)) return false;
  const freshness = person.metadata.freshness;
  return person.metadata.company_verified === true &&
    person.metadata.role_verified === true &&
    (freshness === "current_official_source" ||
      freshness === "corroborated_public_sources") &&
    person.confidence_score >= 80;
}

async function hasMx(domain: string | null): Promise<boolean> {
  if (!domain) return false;
  return resolveMx(domain).then((rows) => rows.length > 0).catch(() => false);
}

function patternEvidence(contacts: LeadgenContact[]) {
  return contacts.flatMap((contact) =>
    contact.full_name && contact.email && contact.contact_type === "work_email"
      ? [{ fullName: contact.full_name, email: contact.email }]
      : [],
  );
}

function isRelevantDepartmentEmail(email: string | null, plan: LprRolePlan): boolean {
  const local = email?.toLowerCase().split("@")[0] ?? "";
  const byRole: Record<string, RegExp> = {
    sales_leadership: /^(?:sales|sale|commercial|commerce|partners?|client|zakaz|order)(?:[._+-]|$)/,
    marketing_leadership: /^(?:marketing|market|press|pr|digital)(?:[._+-]|$)/,
    operations_leadership: /^(?:operations?|office|service|support)(?:[._+-]|$)/,
    digital_transformation_leadership: /^(?:it|digital|tech|automation)(?:[._+-]|$)/,
    medical_leadership: /^(?:medical|clinic|doctor|service)(?:[._+-]|$)/,
  };
  return byRole[plan.primary.normalizedRole]?.test(local) ?? false;
}

const emptyProviderResult: PeopleProviderResult = {
  provider_id: "ru-public-web",
  provider_label: "RU public web",
  candidates: [],
  unavailable: false,
  metrics: {
    search_attempts: 0,
    official_pages_fetched: 0,
    aborted_requests: 1,
    elapsed_ms: 0,
    stop_reason: "timeout",
    trace: {
      queries_executed: [],
      sources_checked: [],
      rejected_candidates: {},
      final_failure_reason: "TIMEOUT",
    },
  },
};

function signalOf(company: LeadgenCompany): string | null {
  const signal = company.metadata.commercial_signal;
  if (typeof signal === "string") return signal;
  if (signal && typeof signal === "object" && !Array.isArray(signal)) {
    const record = signal as Record<string, unknown>;
    for (const key of ["summary", "detail", "title", "type"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
    }
  }
  return null;
}

export async function resolveLprShadow({
  company,
  decisionMaker,
  existingContacts,
  fallbackEmail,
  searchProvider,
}: {
  company: LeadgenCompany;
  decisionMaker: DecisionMakerProfile;
  existingContacts: LeadgenContact[];
  fallbackEmail: string | null;
  searchProvider: SearchProvider;
}): Promise<LprShadowResult> {
  const startedAt = Date.now();
  const domain = domainOf(company);
  const rolePlan = resolveBoundedLprRoles(decisionMaker);
  const key = getLprShadowCacheKey(company.company_name, domain);
  const cached = getCachedLprShadowResult(key);
  if (cached) return cached;

  let timedOut = false;
  const provider = new RuPublicPeopleProvider(searchProvider);
  const providerResult = await runAbortableOperation({
    timeoutMs: SHADOW_TIMEOUT_MS,
    fallback: emptyProviderResult,
    operation: async (signal) => {
      const result = await provider.findPeopleBounded({
        company,
        decisionMaker: applyLprRolePlan(decisionMaker, rolePlan),
        searchKeywords: rolePlan.primary.aliases,
        roleSearchPlan: {
          primary: rolePlan.primary.aliases,
          alternatives: rolePlan.alternatives.map((role) => role.aliases),
        },
        bypassCache: true,
        signal,
      });
      return result;
    },
  });
  if (providerResult === emptyProviderResult || providerResult.metrics?.stop_reason === "timeout") {
    timedOut = true;
  }

  const candidate = providerResult.candidates[0] ?? null;
  const confirmedPerson = isConfirmedPerson(candidate) ? candidate : null;
  const sourceUrl = confirmedPerson ? sourceUrlOf(confirmedPerson) : null;
  let email = confirmedPerson?.work_email ?? null;
  let usingFallback = !email;
  let generatedFromPattern = false;
  let inferredEmailCandidate: string | null = null;
  let support = 0;
  let mxVerified = email ? await hasMx(email.split("@")[1] ?? null) : false;

  if (!email && confirmedPerson && domain) {
    const inferred = inferCorporateEmailPattern(patternEvidence(existingContacts));
    support = inferred.support;
    if (inferred.pattern) {
      inferredEmailCandidate = applyCorporateEmailPattern({
        pattern: inferred.pattern,
        fullName: confirmedPerson.full_name,
        domain,
      });
      mxVerified = inferredEmailCandidate ? await hasMx(domain) : false;
      if (inferredEmailCandidate && support >= 2 && mxVerified) {
        email = inferredEmailCandidate;
        generatedFromPattern = true;
        usingFallback = false;
      }
    }
  }
  if (!email) email = fallbackEmail;

  const classification = email && domain
    ? classifyEvidenceBackedEmail({
        email,
        officialDomain: domain,
        confirmedPerson: Boolean(confirmedPerson),
        directPersonEvidence: Boolean(
          confirmedPerson?.work_email &&
          sourceUrl &&
          email === confirmedPerson.work_email &&
          emailLocalMatchesPerson(email, confirmedPerson.full_name),
        ),
        generatedFromPattern,
        patternSupport: support,
        mxVerified,
        confirmedCorporateAlias: usingFallback && Boolean(fallbackEmail),
      })
    : "INVALID";
  const contact = getContactLevel({
    confirmedPerson: Boolean(confirmedPerson),
    classification,
    relevantDepartment: isRelevantDepartmentEmail(email, rolePlan),
  });
  const metrics = providerResult.metrics ?? emptyProviderResult.metrics!;
  const result: LprShadowResult = {
    companyName: company.company_name,
    domain,
    signal: signalOf(company),
    oldLpr: typeof company.metadata.contact_intelligence === "object" && company.metadata.contact_intelligence
      ? String((company.metadata.contact_intelligence as Record<string, unknown>).person_name ?? "") || null
      : null,
    person: confirmedPerson && sourceUrl ? {
      fullName: confirmedPerson.full_name,
      role: confirmedPerson.role_title!,
      normalizedRole: rolePlan.primary.normalizedRole,
      companyName: company.company_name,
      sourceUrl,
      evidence: confirmedPerson.evidence.slice(0, 4),
      freshness: String(confirmedPerson.metadata.freshness),
      confidence: confirmedPerson.confidence_score,
    } : null,
    email,
    inferredEmailCandidate,
    emailClassification: classification,
    contactLevel: contact.level,
    ready: contact.ready,
    latencyMs: Date.now() - startedAt,
    searchAttempts: metrics.search_attempts,
    officialPagesFetched: metrics.official_pages_fetched,
    timedOut,
    abortedRequests: metrics.aborted_requests,
    stopReason: confirmedPerson
      ? email ? "contact_resolved" : "person_found_email_unresolved"
      : timedOut ? "timeout_fallback_preserved" : "lpr_not_found_fallback_preserved",
    rolePlan,
    cacheHit: false,
    checkedAt: new Date().toISOString(),
    failureAnalysis: metrics.trace ?? {
      queries_executed: [],
      sources_checked: [],
      rejected_candidates: {},
      final_failure_reason: timedOut ? "TIMEOUT" : "OTHER",
    },
  };
  cacheLprShadowResult(key, result);
  return result;
}
