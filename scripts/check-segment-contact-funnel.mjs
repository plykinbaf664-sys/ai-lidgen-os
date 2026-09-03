import assert from "node:assert/strict";
import fs from "node:fs/promises";
import "./register-ts-paths.mjs";

const { getEmailTargetPriority } = await import(
  "../lib/leadgen/email-target-selector.ts"
);
const { buildEmailOutreach } = await import(
  "../lib/leadgen/email-outreach-builder.ts"
);
const { attachContactIntelligence, isContactReadyPerson } = await import(
  "../lib/leadgen/adaptive-contact-intelligence.ts"
);
const { RuPublicPeopleProvider } = await import(
  "../lib/leadgen/ru-public-people-provider.ts"
);

const router = {
  id: "router-contact",
  contact_type: "work_email",
  full_name: "Олег Спешилов",
  role_title: "Контакт вакансии",
  email: "oleg.speshilov@example.ru",
  source_url: "https://hh.ru/vacancy/123",
  source_label: "HH public vacancy contact",
  confidence_score: 82,
  metadata: {
    email_classification: "routing_person_verified",
    email_status: "work_email_ready",
    email_extraction_method: "hh_public_vacancy_api",
    contact_route: "corporate_router",
    contact_intelligence: {
      email: "oleg.speshilov@example.ru",
      email_type: "corporate_router",
      confidence: "HIGH",
      readiness: "contact_ready",
    },
  },
};
const generic = {
  ...router,
  id: "generic-contact",
  contact_type: "generic_email",
  full_name: null,
  role_title: null,
  email: "info@example.ru",
  metadata: {
    email_classification: "company_generic_verified",
    email_status: "company_email_ready",
  },
};

assert.equal(getEmailTargetPriority(router), 0);
assert.ok(
  getEmailTargetPriority(router) < getEmailTargetPriority(generic),
  "A verified named corporate contact must outrank a generic mailbox",
);

const outreach = buildEmailOutreach({
  companyName: "СОГАЗ",
  companyWebsite: "https://example.ru",
  industry: "страхование",
  personName: "Олег Спешилов",
  personRole: "Контакт вакансии",
  contact: router,
  readiness: "outreach_ready",
  whyNow: "Компания публично усиливает цифровое направление.",
  signalType: "HIRING_SIGNAL",
  signalTitle: "Усиление цифрового направления",
  signalDetail: "Опубликована профильная вакансия.",
  signalSourceUrl: "https://hh.ru/vacancy/123",
  businessProblemHypothesis: "может расти ручная нагрузка на обработку обращений.",
  targetResponsibility: "развитие клиентских процессов",
});
assert.match(outreach.body, /^Олег, добрый день\./);
assert.match(outreach.body, /кто у вас отвечает за (?:этот )?(?:процесс|участок)/i);
assert.doesNotMatch(outreach.body, /судя по вашей роли/i);

const inferredIntelligence = {
  email: "oleg.speshilov@example.ru",
  email_type: "pattern_candidate",
  confidence: "MEDIUM",
  readiness: "manual_verification",
  generated_candidates: ["oleg.speshilov@example.ru"],
};
const inferredCarrier = attachContactIntelligence(
  {
    contacts: [generic],
    best_available_entry: generic,
    best_outreach_entry: null,
    fallback_entry: generic,
    alternative_channels: [],
  },
  inferredIntelligence,
);
assert.deepEqual(
  inferredCarrier.contacts[0].metadata.contact_intelligence.generated_candidates,
  ["oleg.speshilov@example.ru"],
);
assert.equal(isContactReadyPerson(inferredCarrier.contacts[0]), false);

const executedQueries = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("", { status: 404 });
try {
  const provider = new RuPublicPeopleProvider({
    async search({ query }) {
      executedQueries.push(query);
      if (!query.includes("-info@")) return [];
      return [{
        title: "СОГАЗ — команда",
        snippet: "СОГАЗ. Олег Спешилов — oleg.speshilov@example.ru",
        url: "https://example.ru/team",
        source_label: "public search",
      }];
    },
  });
  const people = await provider.findPeople({
    company: {
      id: "company-sogaz",
      company_name: "СОГАЗ",
      company_domain: "example.ru",
      source_url: "https://example.ru",
      metadata: {},
    },
    decisionMaker: {
      primary_persona: "Коммерческий директор",
      alternative_personas: ["Директор по развитию"],
      search_keywords: ["руководитель продаж"],
      business_problem_owner: "коммерческое направление",
      department: "Продажи",
    },
    searchKeywords: ["руководитель продаж"],
  });
  assert.equal(people.candidates[0].full_name, "Олег Спешилов");
  assert.equal(people.candidates[0].work_email, "oleg.speshilov@example.ru");
  assert.equal(people.candidates[0].metadata.contact_route, "corporate_router");
  assert.ok(executedQueries.some((query) => query.includes("-info@")));
} finally {
  globalThis.fetch = originalFetch;
}

const peopleSource = await fs.readFile(
  "lib/leadgen/ru-public-people-provider.ts",
  "utf8",
);
const engineSource = await fs.readFile(
  "lib/leadgen/lead-discovery-engine.ts",
  "utf8",
);
const signalPipelineSource = await fs.readFile(
  "lib/leadgen/signals/signal-pipeline.ts",
  "utf8",
);
assert.match(peopleSource, /getRoutingQueryParts/);
assert.match(peopleSource, /corporate_router/);
assert.match(engineSource, /contactReadyLeadIds\.size >= contactReadyTarget/);
assert.match(
  signalPipelineSource,
  /collectSignalEvidence\(\{ result, signalType, icp: verticalIcp \}\)/,
  "Signal evidence must be filtered with the selected vertical ICP",
);
assert.doesNotMatch(signalPipelineSource, /icp: leadgenConfig\.icp/);

console.log("SEGMENT_CONTACT_FUNNEL_OK");
