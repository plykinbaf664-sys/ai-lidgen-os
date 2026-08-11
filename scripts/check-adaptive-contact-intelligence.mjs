import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  applyCorporateEmailPattern,
  attachContactIntelligence,
  evaluateAdaptiveContactIntelligence,
  getContactedPersonKey,
  inferCorporateEmailPattern,
  isConfirmedOutreachEmail,
  isContactReadyPerson,
} from "../lib/leadgen/adaptive-contact-intelligence.ts";
import { discoverDecisionMaker } from "../lib/leadgen/decision-maker-discovery.ts";
import { chooseBestOutreachEntry } from "../lib/leadgen/contact-channel-ranking.ts";

const pattern = inferCorporateEmailPattern([
  { fullName: "Иван Петров", email: "ivan.petrov@acme.ru" },
  { fullName: "Анна Смирнова", email: "anna.smirnova@acme.ru" },
]);
assert.equal(pattern.pattern, "{first}.{last}");
assert.equal(pattern.support, 2);
assert.equal(
  applyCorporateEmailPattern({
    pattern: pattern.pattern,
    fullName: "Олег Сидоров",
    domain: "acme.ru",
  }),
  "oleg.sidorov@acme.ru",
);

const company = {
  id: "company-1",
  company_name: "Acme",
  company_domain: "acme.ru",
  metadata: {},
};
const decisionMaker = {
  primary_persona: "Коммерческий директор",
  alternative_personas: ["Директор по развитию"],
  business_problem_owner: "Управление входящими продажами",
  expected_pain: "Команда вручную квалифицирует растущий входящий поток.",
  reasoning: "Коммерческая функция владеет этим процессом.",
};
const person = {
  full_name: "Иван Петров",
  role_title: "Коммерческий директор",
  department: "Продажи",
  work_email: "ivan.petrov@acme.ru",
  source: "Официальный сайт",
  source_url: "https://acme.ru/team",
  confidence_score: 90,
  evidence: ["Карточка руководителя на официальном сайте"],
  metadata: { source_url: "https://acme.ru/team" },
};
const peopleDiscovery = {
  primary_person: person,
  alternative_people: [],
};
const direct = {
  id: "contact-1",
  contact_type: "work_email",
  full_name: person.full_name,
  role_title: person.role_title,
  email: person.work_email,
  source_url: "https://acme.ru/team",
  confidence_score: 90,
  metadata: {
    email_extraction_method: "official_site",
    email_classification: "personal_verified",
  },
};
const discovery = {
  contacts: [direct],
  resolved_official_domain: "acme.ru",
  official_website: "https://acme.ru",
  best_available_entry: direct,
  best_outreach_entry: direct,
  fallback_entry: null,
  alternative_channels: [],
};
const intelligence = await evaluateAdaptiveContactIntelligence({
  company,
  decisionMaker,
  peopleDiscovery,
  contactDiscovery: discovery,
  verifyMx: async () => true,
});
assert.equal(intelligence.confidence, "HIGH");
assert.equal(intelligence.readiness, "contact_ready");
assert.equal(intelligence.smtp_verification, "not_performed");
assert.equal(intelligence.catch_all, "unknown");
const decorated = attachContactIntelligence(discovery, intelligence);
assert.equal(isContactReadyPerson(decorated.contacts[0]), true);

const duplicate = await evaluateAdaptiveContactIntelligence({
  company,
  decisionMaker,
  peopleDiscovery,
  contactDiscovery: discovery,
  knownPersonKeys: [getContactedPersonKey("Acme", "Иван Петров")],
  verifyMx: async () => true,
});
assert.equal(duplicate.stop_reason, "duplicate_person");
assert.notEqual(duplicate.readiness, "contact_ready");

const generic = {
  ...direct,
  id: "contact-2",
  contact_type: "generic_email",
  full_name: null,
  role_title: null,
  email: "info@acme.ru",
};
const genericResult = await evaluateAdaptiveContactIntelligence({
  company,
  decisionMaker,
  peopleDiscovery: { primary_person: null, alternative_people: [] },
  contactDiscovery: {
    ...discovery,
    contacts: [generic],
    best_available_entry: generic,
    best_outreach_entry: null,
    fallback_entry: generic,
  },
  verifyMx: async () => true,
});
assert.equal(genericResult.readiness, "fallback_only");
assert.equal(isContactReadyPerson(generic), false);
assert.equal(isConfirmedOutreachEmail(generic), false);
const confirmedGeneric = {
  ...generic,
  source_url: "https://acme.ru/contacts",
  metadata: {
    ...generic.metadata,
    email_status: "company_email_ready",
    email_mx_verified: true,
    email_domain_match_reason: "official_domain",
  },
};
assert.equal(isConfirmedOutreachEmail(confirmedGeneric), true);
assert.equal(isContactReadyPerson(confirmedGeneric), false);

const routerContact = {
  ...direct,
  id: "contact-router",
  full_name: "Олег Спешилов",
  role_title: "Контакт вакансии",
  email: "oleg.speshilov@acme.ru",
  source_url: "https://hh.ru/vacancy/123",
  confidence_score: 76,
  metadata: {
    contact_route: "corporate_router",
    email_extraction_method: "hh_public_vacancy_api",
    email_classification: "routing_person_verified",
  },
};
const routerResult = await evaluateAdaptiveContactIntelligence({
  company,
  decisionMaker,
  peopleDiscovery: { primary_person: null, alternative_people: [] },
  contactDiscovery: {
    ...discovery,
    contacts: [routerContact],
    best_available_entry: routerContact,
    best_outreach_entry: routerContact,
    fallback_entry: null,
  },
  verifyMx: async () => true,
});
assert.equal(routerResult.readiness, "contact_ready");
assert.equal(routerResult.email_type, "corporate_router");
assert.match(routerResult.why_this_person, /маршрутизатор/);
assert.doesNotMatch(routerResult.why_this_person, /владеет этим процессом/);
assert.equal(
  chooseBestOutreachEntry([
    { ...routerContact, id: "anonymous-pattern", full_name: null, confidence_score: 99 },
    routerContact,
  ])?.id,
  routerContact.id,
);

const candidate = {
  company_name: "Example",
  company_domain: "example.ru",
  company_segment: "малый бизнес до 50 сотрудников",
  company_source_url: "https://example.ru/news",
  signals: [],
  lead_score: 80,
  icp_fit_score: 80,
  icp_fit_breakdown: { size: "до 50" },
  card_signal_title: "Расширение продаж",
  signal_summary: "Компания набирает менеджеров по продажам",
  why_it_matters: "Растёт нагрузка на коммерческую функцию",
  why_now: "Опубликованы новые вакансии",
  outreach_hypothesis: "Квалификация обращений может стать узким местом",
};
const small = discoverDecisionMaker({
  candidate,
  signalType: "HIRING_SIGNAL",
  preferredRoles: ["Коммерческий директор"],
});
const large = discoverDecisionMaker({
  candidate: {
    ...candidate,
    company_segment: "крупный федеральный холдинг 1000+ сотрудников",
    icp_fit_breakdown: { size: "1000+" },
  },
  signalType: "HIRING_SIGNAL",
  preferredRoles: ["Коммерческий директор"],
});
assert.equal(small.primary_persona, "Собственник / генеральный директор");
assert.notEqual(large.primary_persona, small.primary_persona);

const discoveryEngineSource = await fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8");
assert.match(discoveryEngineSource, /official_website_status === "confirmed"/);
assert.match(discoveryEngineSource, /people discovery must continue on that domain/i);
assert.match(discoveryEngineSource, /peopleDiscovery: record\.peopleDiscovery/);

console.log("Adaptive Contact Intelligence checks: OK");
