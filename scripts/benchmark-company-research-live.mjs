import fs from "node:fs/promises";
import zlib from "node:zlib";
import { promisify } from "node:util";
import "./register-ts-paths.mjs";

const gunzip = promisify(zlib.gunzip);

async function table(name) {
  const bytes = await fs.readFile(`.leadgen-data/tables/${name}.json.gz`);
  return JSON.parse((await gunzip(bytes)).toString("utf8"));
}

function officialWebsite(company) {
  const value = company.metadata?.official_website;
  return company.metadata?.official_website_status === "confirmed" && typeof value === "string"
    ? value
    : company.company_domain
      ? `https://${company.company_domain}`
      : null;
}

function isDecisionMaker(value) {
  return value && typeof value === "object" &&
    typeof value.primary_persona === "string" &&
    Array.isArray(value.alternative_personas) &&
    typeof value.business_problem_owner === "string";
}

function isBenchmarkCompany(company) {
  const name = company.company_name?.trim() ?? "";
  const words = name.split(/\s+/).filter(Boolean);
  return name.length >= 2 && name.length <= 70 && words.length <= 6 &&
    (/^[A-ZА-ЯЁ]/u.test(name) || /^[A-Z\d-]+$/u.test(name)) &&
    !/^(?:контакт|офис|компания|современн|возможност|участие)(?:$|\s)/i.test(name);
}

function oldPersonCount(company) {
  const people = company.metadata?.people_discovery;
  return Array.isArray(people?.all_candidates) ? people.all_candidates.length : 0;
}

function oldProfiles(company, key) {
  const people = company.metadata?.people_discovery?.all_candidates;
  return Array.isArray(people)
    ? people.filter((person) => typeof person?.metadata?.[key] === "string").length
    : 0;
}

function oldUsableContact(contacts) {
  return contacts.some((contact) => contact.email && [
    "personal_email_ready",
    "work_email_ready",
    "department_email_ready",
    "company_email_ready",
  ].includes(contact.metadata?.email_status) && contact.metadata?.email_mx_verified === true);
}

const [campaigns, companies, contacts, leads, signals, queue] = await Promise.all([
  table("leadgen_campaigns"),
  table("leadgen_companies"),
  table("leadgen_contacts"),
  table("leadgen_leads"),
  table("leadgen_signals"),
  table("leadgen_outreach_queue"),
]);

const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
const leadByCompany = new Map(leads.map((lead) => [lead.company_id, lead]));
const signalsByCompany = new Map();
for (const signal of signals) {
  if (!signal.company_id) continue;
  const list = signalsByCompany.get(signal.company_id) ?? [];
  list.push(signal);
  signalsByCompany.set(signal.company_id, list);
}
const contactsByCompany = new Map();
for (const contact of contacts) {
  const list = contactsByCompany.get(contact.company_id) ?? [];
  list.push(contact);
  contactsByCompany.set(contact.company_id, list);
}
const readyCompanyIds = new Set(queue.map((entry) => entry.company_id).filter(Boolean));
const requestedCompany = process.env.LEADGEN_BENCHMARK_COMPANY?.trim().toLowerCase() ?? "";
const requestedLimit = Math.max(1, Math.min(Number(process.env.LEADGEN_BENCHMARK_LIMIT) || 10, 10));
const sorted = companies
  .filter((company) => officialWebsite(company))
  .filter((company) => isDecisionMaker(company.metadata?.decision_maker))
  .filter(isBenchmarkCompany)
  .filter((company) => !requestedCompany || company.company_name.toLowerCase().includes(requestedCompany))
  .sort((left, right) =>
    Number(readyCompanyIds.has(right.id)) - Number(readyCompanyIds.has(left.id)) ||
    Date.parse(right.created_at) - Date.parse(left.created_at));
const sample = [];
const domains = new Set();
for (const company of sorted) {
  const domain = company.company_domain?.toLowerCase();
  if (!domain || domains.has(domain)) continue;
  domains.add(domain);
  sample.push(company);
  if (sample.length === requestedLimit) break;
}
if (sample.length < requestedLimit) throw new Error(`Need ${requestedLimit} real companies, found ${sample.length}`);

const { researchCompany } = await import("../lib/leadgen/company-research-agent.ts");
const { createLeadgenSearchProvider } = await import("../lib/leadgen/search/leadgen-search-provider.ts");
const { getActiveAbortableOperationCount } = await import("../lib/network/abortable-operation.ts");
const searchProvider = createLeadgenSearchProvider();
const results = [];

for (const [index, company] of sample.entries()) {
  const lead = leadByCompany.get(company.id);
  const companySignals = signalsByCompany.get(company.id) ?? [];
  const primarySignal = companySignals[0];
  const website = officialWebsite(company);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("benchmark_timeout")), 60_000);
  const startedAt = Date.now();
  try {
    const researched = await researchCompany(
      company.company_name,
      website,
      {
        type: primarySignal?.signal_type ?? company.signal_type ?? "TECH_SIGNAL",
        title: primarySignal?.signal_title ?? lead?.signal_title ?? "Подтверждённый контекст компании",
        detail: primarySignal?.signal_detail ?? lead?.signal_detail ?? "Компания входит в подтверждённую выборку Leadgen OS.",
        sourceUrl: primarySignal?.source_url ?? company.source_url ?? website,
        confidence: primarySignal?.confidence_score ?? company.confidence_score ?? 60,
      },
      {
        campaign: campaignById.get(company.campaign_id),
        company,
        lead,
        signals: companySignals,
        decisionMaker: company.metadata.decision_maker,
        knownContacts: contactsByCompany.get(company.id) ?? [],
        searchProvider,
        bypassCache: true,
        signal: controller.signal,
      },
    );
    const bundle = researched.bundle;
    const companyContacts = contactsByCompany.get(company.id) ?? [];
    const item = {
      company: company.company_name,
      officialWebsite: website,
      queries: bundle.metrics.queries,
      lprs: bundle.people.length,
      tenchat: bundle.people.filter((person) => person.profiles.tenchat).length,
      telegram: bundle.people.filter((person) => person.profiles.telegram).length,
      personalCorporateEmail: bundle.emails.personal.length,
      departmentEmail: bundle.emails.department.length,
      generalEmail: bundle.emails.general.length,
      usableContact: Boolean(bundle.bestOutreachContact),
      ready: Boolean(bundle.bestOutreachContact) && researched.contactDiscovery.contacts.some(
        (contact) => contact.metadata.email_quality_gate_passed === true,
      ),
      runtimeMs: bundle.metrics.totalMs,
      stopReason: bundle.metrics.stopReason,
      people: bundle.people.map((person) => ({
        name: person.fullName,
        role: person.role,
        tenchat: person.profiles.tenchat,
        telegram: person.profiles.telegram,
        sources: person.evidence.map((evidence) => evidence.sourceUrl),
      })),
      queriesExecuted: researched.peopleDiscovery.research_metrics?.queries_executed ?? [],
      sourcesChecked: researched.peopleDiscovery.research_metrics?.sources_checked ?? [],
      searchResultsSeen: researched.peopleDiscovery.research_metrics?.search_results_seen ?? 0,
      rejectedCandidates: researched.peopleDiscovery.research_metrics?.rejected_candidates ?? {},
      contactCandidates: researched.contactDiscovery.contacts.map((contact) => ({
        email: contact.email,
        status: contact.metadata?.email_status ?? null,
        classification: contact.metadata?.normalized_email_classification ?? null,
        mx: contact.metadata?.email_mx_verified ?? null,
        source: contact.source_url ?? null,
      })),
      bestEmail: bundle.bestOutreachContact?.email ?? null,
      old: {
        lprs: oldPersonCount(company),
        tenchat: oldProfiles(company, "tenchat_url"),
        telegram: oldProfiles(company, "telegram_url"),
        usableContact: oldUsableContact(companyContacts) || readyCompanyIds.has(company.id),
        ready: readyCompanyIds.has(company.id),
      },
      failure: bundle.bestOutreachContact
        ? null
        : {
            personSearch: researched.peopleDiscovery.search_status,
            emailSearch: researched.contactDiscovery.email_final_reason,
            stopReason: bundle.metrics.stopReason,
          },
    };
    results.push(item);
    console.log(`BENCHMARK ${index + 1}/10 ${item.company}: LPR=${item.lprs} usable=${item.usableContact} queries=${item.queries} ms=${item.runtimeMs}`);
  } catch (error) {
    results.push({
      company: company.company_name,
      officialWebsite: website,
      queries: 0,
      lprs: 0,
      tenchat: 0,
      telegram: 0,
      personalCorporateEmail: 0,
      departmentEmail: 0,
      generalEmail: 0,
      usableContact: false,
      ready: false,
      runtimeMs: Date.now() - startedAt,
      stopReason: "research_error",
      people: [],
      queriesExecuted: [],
      sourcesChecked: [],
      searchResultsSeen: 0,
      rejectedCandidates: {},
      contactCandidates: [],
      bestEmail: null,
      old: {
        lprs: oldPersonCount(company),
        tenchat: oldProfiles(company, "tenchat_url"),
        telegram: oldProfiles(company, "telegram_url"),
        usableContact: oldUsableContact(contactsByCompany.get(company.id) ?? []) || readyCompanyIds.has(company.id),
        ready: readyCompanyIds.has(company.id),
      },
      failure: { error: error instanceof Error ? error.message : String(error) },
    });
    console.log(`BENCHMARK ${index + 1}/10 ${company.company_name}: ERROR`);
  } finally {
    clearTimeout(timeout);
  }
}

const sum = (selector) => results.reduce((total, item) => total + selector(item), 0);
const falseVerified = results.reduce((total, item) => total + item.people.filter((person) =>
  !person.sources.length).length, 0);
const aggregate = {
  companies: results.length,
  lprCompanies: results.filter((item) => item.lprs > 0).length,
  lprRate: results.filter((item) => item.lprs > 0).length / results.length,
  tenchatCompanies: results.filter((item) => item.tenchat > 0).length,
  telegramCompanies: results.filter((item) => item.telegram > 0).length,
  personalCorporateEmails: sum((item) => item.personalCorporateEmail),
  departmentEmails: sum((item) => item.departmentEmail),
  generalEmails: sum((item) => item.generalEmail),
  usableContacts: results.filter((item) => item.usableContact).length,
  usableContactRate: results.filter((item) => item.usableContact).length / results.length,
  ready: results.filter((item) => item.ready).length,
  readyRate: results.filter((item) => item.ready).length / results.length,
  averageQueries: Number((sum((item) => item.queries) / results.length).toFixed(2)),
  averageRuntimeMs: Math.round(sum((item) => item.runtimeMs) / results.length),
  falseVerified,
  orphanRequests: getActiveAbortableOperationCount(),
  old: {
    lprCompanies: results.filter((item) => item.old.lprs > 0).length,
    usableContacts: results.filter((item) => item.old.usableContact).length,
    ready: results.filter((item) => item.old.ready).length,
  },
};

const reportResults = process.env.LEADGEN_BENCHMARK_DEBUG === "1"
  ? results
  : results.map(({ queriesExecuted, sourcesChecked, contactCandidates, ...item }) => ({
      ...item,
      searchTrace: {
        queries: queriesExecuted.length,
        sources: sourcesChecked.length,
        contactCandidates: contactCandidates.length,
      },
    }));
console.log(JSON.stringify({ mode: "read_only_live_no_persistence_no_send", results: reportResults, aggregate }, null, 2));
