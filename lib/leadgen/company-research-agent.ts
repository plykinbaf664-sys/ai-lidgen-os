import { createHash } from "node:crypto";
import {
  attachContactIntelligence,
  evaluateAdaptiveContactIntelligence,
  isConfirmedOutreachEmail,
} from "@/lib/leadgen/adaptive-contact-intelligence";
import { normalizeDomain } from "@/lib/leadgen/company-identity";
import { ContactDiscoveryService } from "@/lib/leadgen/contact-discovery-service";
import { ContactEnrichmentEngine } from "@/lib/leadgen/contact-enrichment-engine";
import {
  classifyEvidenceBackedEmail,
  getContactLevel,
  type ContactLevel,
  type NormalizedEmailClassification,
} from "@/lib/leadgen/contact-quality";
import { discoverDecisionMaker } from "@/lib/leadgen/decision-maker-discovery";
import { PeopleDiscoveryEngine } from "@/lib/leadgen/people-discovery-engine";
import { PublicContactProvider } from "@/lib/leadgen/public-contact-provider";
import { RuPublicPeopleProvider } from "@/lib/leadgen/ru-public-people-provider";
import { createLeadgenSearchProvider } from "@/lib/leadgen/search/leadgen-search-provider";
import type { SearchProvider } from "@/lib/leadgen/search/search-provider";
import type {
  ContactDiscoveryResult,
  DecisionMakerProfile,
  LeadCandidate,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenLead,
  LeadgenSignal,
  PeopleDiscoveryResult,
  PersonCandidate,
  SignalType,
} from "@/lib/leadgen/types";
import { runAbortableOperation, throwIfAborted } from "@/lib/network/abortable-operation";

export type CompanyResearchEvidence = {
  sourceUrl: string;
  sourceType: "official" | "tenchat" | "telegram" | "public_web";
  excerpt: string;
  capturedAt: string;
  confidence: number;
};

export type CompanyResearchPerson = {
  fullName: string;
  role: string | null;
  confidence: "VERIFIED" | "HIGH_CONFIDENCE" | "LIKELY" | "UNVERIFIED";
  evidence: CompanyResearchEvidence[];
  profiles: {
    tenchat: string | null;
    telegram: string | null;
    other: string[];
  };
};

export type CompanyResearchEmail = {
  email: string;
  personName: string | null;
  classification: NormalizedEmailClassification;
  evidence: CompanyResearchEvidence[];
};

export type ContactBundle = {
  companyName: string;
  officialWebsite: string;
  officialDomain: string;
  people: CompanyResearchPerson[];
  emails: {
    personal: CompanyResearchEmail[];
    department: CompanyResearchEmail[];
    general: CompanyResearchEmail[];
    inferred: CompanyResearchEmail[];
  };
  bestOutreachContact: {
    email: string;
    personName: string | null;
    role: string | null;
    classification: NormalizedEmailClassification;
    contactLevel: ContactLevel;
    sourceUrl: string;
  } | null;
  signal: CompanyResearchSignalContext;
  researchConfidence: "VERIFIED" | "HIGH_CONFIDENCE" | "LIKELY" | "UNVERIFIED";
  metrics: {
    planner: "llm" | "deterministic";
    queries: number;
    officialPages: number;
    lprMs: number;
    contactMs: number;
    totalMs: number;
    stopReason: string;
  };
};

export type CompanyResearchSignalContext = {
  type: SignalType;
  title: string;
  detail: string;
  sourceUrl: string;
  confidence: number;
};

export type CompanyResearchTargetContext = {
  campaign?: LeadgenCampaign;
  company?: LeadgenCompany;
  lead?: LeadgenLead;
  signals?: LeadgenSignal[];
  decisionMaker?: DecisionMakerProfile;
  preferredRoles?: string[];
  knownPersonKeys?: Iterable<string>;
  knownContacts?: LeadgenContact[];
  searchProvider?: SearchProvider;
  createdAt?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
};

export type CompanyResearchResult = {
  bundle: ContactBundle;
  peopleDiscovery: PeopleDiscoveryResult;
  contactDiscovery: ContactDiscoveryResult;
};

function mergeKnownOfficialContacts(
  discovered: ContactDiscoveryResult,
  knownContacts: LeadgenContact[] | undefined,
  officialDomain: string,
): ContactDiscoveryResult {
  if (!knownContacts?.length) return discovered;
  const reusable = knownContacts.filter((contact) => {
    if (!contact.email || !isConfirmedOutreachEmail(contact)) return false;
    return normalizeDomain(contact.email.split("@").at(-1)) === officialDomain;
  });
  if (reusable.length === 0) return discovered;
  const contacts = [...new Map(
    [...discovered.contacts, ...reusable].map((contact) => [
      `${contact.email?.trim().toLowerCase() ?? contact.id}:${contact.contact_type}`,
      contact,
    ]),
  ).values()];
  return { ...discovered, contacts };
}

type ResearchPlan = {
  primaryRoles: string[];
  alternativeRoles: string[][];
  queries: string[];
  source: "llm" | "deterministic";
};

type ResponsesApiResult = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

const RESEARCH_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    primary_roles: { type: "array", items: { type: "string" }, maxItems: 4 },
    alternative_roles: {
      type: "array",
      maxItems: 2,
      items: { type: "array", items: { type: "string" }, maxItems: 4 },
    },
    queries: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 10 },
  },
  required: ["primary_roles", "alternative_roles", "queries"],
} as const;

function compact(value: string, maximum = 500): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maximum);
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
}

function outputText(result: ResponsesApiResult): string | null {
  if (typeof result.output_text === "string") return result.output_text;
  for (const item of result.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function uniqueStrings(values: unknown[], maximum: number): string[] {
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => compact(value, 180))
    .filter(Boolean))]
    .slice(0, maximum);
}

function isResearchPlan(value: unknown): value is {
  primary_roles: string[];
  alternative_roles: string[][];
  queries: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.primary_roles) &&
    Array.isArray(record.alternative_roles) &&
    record.alternative_roles.every(Array.isArray) &&
    Array.isArray(record.queries);
}

function deterministicPlan(decisionMaker: DecisionMakerProfile): ResearchPlan {
  const rolePool = uniqueStrings([
    ...decisionMaker.alternative_personas,
    ...decisionMaker.search_keywords,
    decisionMaker.primary_persona,
  ], 20);
  const russianRoles = rolePool.filter((role) => /[а-яё]/i.test(role));
  const primaryRoles = uniqueStrings([
    ...russianRoles,
    ...rolePool,
  ], 4);
  const alternativeRoles = uniqueStrings([
    ...russianRoles.slice(1),
    ...decisionMaker.alternative_personas,
  ], 6)
    .filter((role) => !primaryRoles.includes(role))
    .slice(0, 2)
    .map((role) => [role]);
  return {
    primaryRoles,
    alternativeRoles,
    queries: [],
    source: "deterministic",
  };
}

async function planResearch({
  companyName,
  officialWebsite,
  signalContext,
  decisionMaker,
  signal,
}: {
  companyName: string;
  officialWebsite: string;
  signalContext: CompanyResearchSignalContext;
  decisionMaker: DecisionMakerProfile;
  signal?: AbortSignal;
}): Promise<ResearchPlan> {
  const fallback = deterministicPlan(decisionMaker);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.LEADGEN_RESEARCH_LLM_ENABLED === "false") return fallback;

  return runAbortableOperation({
    timeoutMs: 15_000,
    parentSignal: signal,
    fallback,
    operation: async (requestSignal) => {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.LEADGEN_RESEARCH_OPENAI_MODEL?.trim() || "gpt-5-mini",
          store: false,
          instructions: [
            "Ты планировщик публичного B2B-исследования российской компании.",
            "Выбери владельца проблемы: одну primary role и максимум две alternative role families.",
            "Составь разные точные запросы для открытого веб-поиска: руководство, официальные материалы, интервью, конференции, TenChat, Telegram, публичный корпоративный email.",
            "Не используй LinkedIn, Workspace, закрытые профили, утечки или догадки.",
            "Не придумывай людей и факты: сейчас нужны только роли и запросы.",
            "Верни 6-10 запросов, без почти одинаковых дублей.",
          ].join(" "),
          input: JSON.stringify({
            companyName,
            officialWebsite,
            signal: signalContext,
            proposedOwner: decisionMaker.business_problem_owner,
            proposedPrimaryRole: decisionMaker.primary_persona,
            proposedAlternatives: decisionMaker.alternative_personas.slice(0, 2),
          }),
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: "company_research_plan",
              strict: true,
              schema: RESEARCH_PLAN_SCHEMA,
            },
          },
          max_output_tokens: 900,
        }),
        signal: requestSignal,
      });
      if (!response.ok) return fallback;
      const text = outputText((await response.json()) as ResponsesApiResult);
      if (!text) return fallback;
      const parsed = JSON.parse(text) as unknown;
      if (!isResearchPlan(parsed)) return fallback;
      const primaryRoles = uniqueStrings(parsed.primary_roles, 4);
      const alternativeRoles = parsed.alternative_roles
        .slice(0, 2)
        .map((roles) => uniqueStrings(roles, 4))
        .filter((roles) => roles.length > 0);
      const queries = uniqueStrings(parsed.queries, 10)
        .filter((query) => /[а-яёa-z0-9]/i.test(query));
      if (primaryRoles.length === 0 || queries.length < 4) return fallback;
      return { primaryRoles, alternativeRoles, queries, source: "llm" };
    },
  });
}

function buildRuntime({
  companyName,
  officialWebsite,
  signalContext,
  targetContext,
}: {
  companyName: string;
  officialWebsite: string;
  signalContext: CompanyResearchSignalContext;
  targetContext: CompanyResearchTargetContext;
}) {
  const createdAt = targetContext.createdAt ?? new Date().toISOString();
  const domain = normalizeDomain(officialWebsite);
  if (!domain) throw new Error("researchCompany requires a confirmed official website");
  const suffix = stableId(companyName, domain, signalContext.sourceUrl);
  const campaign = targetContext.campaign ?? {
    id: `research-campaign-${suffix}`,
    pipeline_run_id: `research-run-${suffix}`,
    name: `Исследование ${companyName}`,
    requested_by: "company-research-agent",
    status: "running" as const,
    icp_label: "Research",
    offer_label: "AI automation",
    created_at: createdAt,
  };
  const company = targetContext.company ?? {
    id: `research-company-${suffix}`,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_name: companyName,
    company_domain: domain,
    company_segment: "unknown",
    source: "company_research",
    source_url: officialWebsite,
    source_label: "Официальный сайт",
    signal_type: signalContext.type,
    discovery_query: null,
    matched_signal_count: 1,
    lead_score: signalContext.confidence,
    icp_fit_score: 0,
    confidence_score: signalContext.confidence,
    country: null,
    industry: null,
    company_size: null,
    linkedin_url: null,
    metadata: {
      official_website: officialWebsite,
      resolved_official_domain: domain,
      official_website_status: "confirmed",
      official_website_source_url: officialWebsite,
      official_website_confidence: 100,
    },
    created_at: createdAt,
    updated_at: createdAt,
  } satisfies LeadgenCompany;
  const lead = targetContext.lead ?? {
    id: `research-lead-${suffix}`,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    company_id: company.id,
    company_name: companyName,
    company_domain: domain,
    company_segment: company.company_segment,
    contact_channel: null,
    contact_label: null,
    contact_value: null,
    company_source_url: officialWebsite,
    lead_score: signalContext.confidence,
    icp_fit_score: company.icp_fit_score,
    signal_title: signalContext.title,
    signal_detail: signalContext.detail,
    signal_source_label: "Публичный источник",
    hook: signalContext.title,
    message: "",
    follow_up: "",
    status: "new" as const,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const signals = targetContext.signals?.length ? targetContext.signals : [{
    id: `research-signal-${suffix}`,
    pipeline_run_id: campaign.pipeline_run_id,
    campaign_id: campaign.id,
    lead_id: lead.id,
    company_id: company.id,
    signal_type: signalContext.type,
    signal_title: signalContext.title,
    signal_detail: signalContext.detail,
    signal_source_label: "Публичный источник",
    source_url: signalContext.sourceUrl,
    confidence_score: signalContext.confidence,
    found_at: createdAt,
    created_at: createdAt,
  } satisfies LeadgenSignal];
  const candidate: LeadCandidate = {
    company_name: companyName,
    company_domain: domain,
    company_segment: company.company_segment,
    company_source_url: officialWebsite,
    signals,
    lead_score: lead.lead_score,
    icp_fit_score: lead.icp_fit_score,
    icp_fit_breakdown: {},
    signal_summary: signalContext.title,
    why_it_matters: signalContext.detail,
    why_now: signalContext.detail,
    outreach_hypothesis: signalContext.detail,
    signal_type: signalContext.type,
  };
  const decisionMaker = targetContext.decisionMaker ?? discoverDecisionMaker({
    candidate,
    signalType: signalContext.type,
    preferredRoles: targetContext.preferredRoles,
  });
  return { campaign, company, lead, signals, decisionMaker, createdAt, domain };
}

function sourceType(url: string, officialDomain: string): CompanyResearchEvidence["sourceType"] {
  const host = normalizeDomain(url);
  if (host === officialDomain || host?.endsWith(`.${officialDomain}`)) return "official";
  if (host === "tenchat.ru" || host?.endsWith(".tenchat.ru")) return "tenchat";
  if (host === "t.me" || host === "telegram.me") return "telegram";
  return "public_web";
}

function evidenceForPerson(
  person: PersonCandidate,
  officialDomain: string,
  capturedAt: string,
): CompanyResearchEvidence[] {
  const urls = Array.isArray(person.metadata.source_urls)
    ? person.metadata.source_urls.filter((value): value is string => typeof value === "string")
    : typeof person.metadata.source_url === "string"
      ? [person.metadata.source_url]
      : [];
  return urls.slice(0, 4).map((url, index) => ({
    sourceUrl: url,
    sourceType: sourceType(url, officialDomain),
    excerpt: compact(person.evidence[index] ?? person.evidence[0] ?? `${person.full_name}: ${person.role_title ?? "роль не указана"}`),
    capturedAt,
    confidence: person.confidence_score,
  }));
}

function profileValue(person: PersonCandidate, key: string): string | null {
  const value = person.metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function mapPeople(
  people: PeopleDiscoveryResult,
  officialDomain: string,
  capturedAt: string,
): CompanyResearchPerson[] {
  return people.all_candidates.slice(0, 3).map((person) => {
    const evidence = evidenceForPerson(person, officialDomain, capturedAt);
    return {
      fullName: person.full_name,
      role: person.role_title,
      confidence: person.confidence_score >= 82 && evidence.length > 0
        ? "VERIFIED"
        : person.confidence_score >= 68
          ? "HIGH_CONFIDENCE"
          : person.confidence_score >= 50
            ? "LIKELY"
            : "UNVERIFIED",
      evidence,
      profiles: {
        tenchat: profileValue(person, "tenchat_url"),
        telegram: profileValue(person, "telegram_url"),
        other: [profileValue(person, "vk_url")].filter((value): value is string => Boolean(value)),
      },
    };
  });
}

function contactClassification(
  contact: LeadgenContact,
  officialDomain: string,
): NormalizedEmailClassification {
  const normalized = contact.metadata.normalized_email_classification;
  if (
    normalized === "VERIFIED_PERSONAL" || normalized === "HIGH_CONFIDENCE_PERSONAL" ||
    normalized === "INFERRED_PERSONAL" || normalized === "DEPARTMENT" ||
    normalized === "GENERAL" || normalized === "INVALID"
  ) return normalized;
  return classifyEvidenceBackedEmail({
    email: contact.email ?? "",
    officialDomain,
    confirmedPerson: Boolean(contact.full_name && contact.role_title),
    directPersonEvidence: contact.contact_type === "work_email" &&
      contact.metadata.public_contact_verified === true,
    generatedFromPattern: contact.metadata.email_extraction_method === "pattern",
    patternSupport: Number(contact.metadata.pattern_support ?? 0),
    mxVerified: contact.metadata.email_mx_verified === true,
  });
}

function mapEmails(
  contacts: LeadgenContact[],
  officialDomain: string,
  capturedAt: string,
): ContactBundle["emails"] {
  const unique = [...new Map(
    contacts
      .filter((contact): contact is LeadgenContact & { email: string } => Boolean(contact.email))
      .map((contact) => [contact.email.trim().toLowerCase(), contact]),
  ).values()];
  const output: ContactBundle["emails"] = {
    personal: [],
    department: [],
    general: [],
    inferred: [],
  };
  for (const contact of unique) {
    const classification = contactClassification(contact, officialDomain);
    if (classification === "INVALID") continue;
    const sourceUrl = contact.source_url ?? `https://${officialDomain}`;
    const email: CompanyResearchEmail = {
      email: contact.email,
      personName: classification === "VERIFIED_PERSONAL" || classification === "HIGH_CONFIDENCE_PERSONAL"
        ? contact.full_name
        : null,
      classification,
      evidence: [{
        sourceUrl,
        sourceType: sourceType(sourceUrl, officialDomain),
        excerpt: compact(`${contact.email} — ${contact.source_label ?? "публичный корпоративный контакт"}`),
        capturedAt,
        confidence: contact.confidence_score,
      }],
    };
    if (classification === "VERIFIED_PERSONAL" || classification === "HIGH_CONFIDENCE_PERSONAL") {
      output.personal.push(email);
    } else if (classification === "INFERRED_PERSONAL") {
      output.inferred.push(email);
    } else if (classification === "DEPARTMENT") {
      output.department.push(email);
    } else {
      output.general.push(email);
    }
  }
  output.personal = output.personal.slice(0, 5);
  output.department = output.department.slice(0, 5);
  output.general = output.general.slice(0, 5);
  output.inferred = output.inferred.slice(0, 3);
  return output;
}

export async function researchCompany(
  companyName: string,
  officialWebsite: string,
  signalContext: CompanyResearchSignalContext,
  optionalTargetContext: CompanyResearchTargetContext = {},
): Promise<CompanyResearchResult> {
  const startedAt = Date.now();
  const runtime = buildRuntime({
    companyName,
    officialWebsite,
    signalContext,
    targetContext: optionalTargetContext,
  });
  const searchProvider = optionalTargetContext.searchProvider ?? createLeadgenSearchProvider();
  const plan = await planResearch({
    companyName,
    officialWebsite,
    signalContext,
    decisionMaker: runtime.decisionMaker,
    signal: optionalTargetContext.signal,
  });
  throwIfAborted(optionalTargetContext.signal);
  const peopleStartedAt = Date.now();
  const peopleDiscoveryEngine = new PeopleDiscoveryEngine([
    new RuPublicPeopleProvider(searchProvider),
  ]);
  const peopleDiscovery = await peopleDiscoveryEngine.discoverPeople({
    company: runtime.company,
    decisionMaker: runtime.decisionMaker,
    researchPlan: plan,
    bypassCache: optionalTargetContext.bypassCache,
    signal: optionalTargetContext.signal,
  });
  const lprMs = Date.now() - peopleStartedAt;
  throwIfAborted(optionalTargetContext.signal);
  const contactStartedAt = Date.now();
  const contactEnrichmentEngine = new ContactEnrichmentEngine(
    new ContactDiscoveryService([new PublicContactProvider(searchProvider)]),
  );
  const discovered = await contactEnrichmentEngine.enrichContacts({
    campaign: runtime.campaign,
    company: runtime.company,
    lead: runtime.lead,
    signals: runtime.signals,
    decisionMaker: runtime.decisionMaker,
    peopleDiscovery,
    createdAt: runtime.createdAt,
    signal: optionalTargetContext.signal,
  });
  const discoveredWithKnown = mergeKnownOfficialContacts(
    discovered,
    optionalTargetContext.knownContacts,
    runtime.domain,
  );
  const intelligence = await evaluateAdaptiveContactIntelligence({
    company: runtime.company,
    decisionMaker: runtime.decisionMaker,
    peopleDiscovery,
    contactDiscovery: discoveredWithKnown,
    knownPersonKeys: optionalTargetContext.knownPersonKeys,
  });
  const contactDiscovery = attachContactIntelligence(discoveredWithKnown, intelligence);
  const contactMs = Date.now() - contactStartedAt;
  const people = mapPeople(peopleDiscovery, runtime.domain, runtime.createdAt);
  const emails = mapEmails(contactDiscovery.contacts, runtime.domain, runtime.createdAt);
  const best = contactDiscovery.contacts
    .filter((contact) =>
      isConfirmedOutreachEmail(contact) &&
      contactClassification(contact, runtime.domain) !== "INVALID",
    )
    .sort((left, right) => right.confidence_score - left.confidence_score)[0] ?? null;
  const bestClassification = best
    ? contactClassification(best, runtime.domain)
    : "INVALID";
  const bestPerson = best?.full_name
    ? people.find((person) => person.fullName.toLowerCase() === best.full_name?.toLowerCase()) ?? null
    : null;
  const level = best
    ? getContactLevel({
        confirmedPerson: Boolean(bestPerson),
        classification: bestClassification,
      }).level
    : null;
  const totalMs = Date.now() - startedAt;
  const bundle: ContactBundle = {
    companyName,
    officialWebsite,
    officialDomain: runtime.domain,
    people,
    emails,
    bestOutreachContact: best?.email && level ? {
      email: best.email,
      personName: bestPerson?.fullName ?? null,
      role: bestPerson?.role ?? null,
      classification: bestClassification,
      contactLevel: level,
      sourceUrl: best.source_url ?? officialWebsite,
    } : null,
    signal: {
      ...signalContext,
      title: compact(signalContext.title, 220),
      detail: compact(signalContext.detail, 800),
    },
    researchConfidence: best
      ? people.some((person) => person.confidence === "VERIFIED")
        ? "VERIFIED"
        : "HIGH_CONFIDENCE"
      : people.length > 0
        ? "LIKELY"
        : "UNVERIFIED",
    metrics: {
      planner: plan.source,
      queries: (peopleDiscovery.research_metrics?.search_attempts ?? 0) +
        (contactDiscovery.queries_executed?.length ?? 0),
      officialPages: (peopleDiscovery.research_metrics?.official_pages_fetched ?? 0) +
        contactDiscovery.urls_inspected.length,
      lprMs,
      contactMs,
      totalMs,
      stopReason: best
        ? "usable_email_found"
        : people.length > 0
          ? "people_found_email_unresolved"
          : peopleDiscovery.research_metrics?.stop_reason ?? "research_exhausted",
    },
  };
  return { bundle, peopleDiscovery, contactDiscovery };
}
