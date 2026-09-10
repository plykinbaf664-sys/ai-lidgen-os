import assert from "node:assert/strict";
import fs from "node:fs/promises";
import "./register-ts-paths.mjs";

delete process.env.OPENAI_API_KEY;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("cloudflare-dns.com/dns-query")) {
    return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: "10 mx.microsoft.com." }] }), {
      status: 200,
      headers: { "content-type": "application/dns-json" },
    });
  }
  if (url.startsWith("https://microsoft.com")) {
    return new Response(`
      <html><body>
        <a href="/team">Команда</a><a href="/contacts">Контакты</a>
        <section>Иван Петров — генеральный директор. Email:
          <a href="mailto:ivan.petrov@microsoft.com">ivan.petrov@microsoft.com</a>
        </section>
        <section>Анна Сидорова — коммерческий директор.</section>
        <footer><a href="mailto:info@microsoft.com">info@microsoft.com</a></footer>
      </body></html>
    `, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response("", { status: 404 });
};

const { researchCompany } = await import("../lib/leadgen/company-research-agent.ts");
const { classifyEvidenceBackedEmail } = await import("../lib/leadgen/contact-quality.ts");
const { isPlausiblePublicPersonName } = await import("../lib/leadgen/person-factuality.ts");

assert.equal(
  isPlausiblePublicPersonName("Управляющий Другой"),
  false,
  "role/page chrome text must never become a person",
);

const searchProvider = {
  async search({ query }) {
    if (/TenChat/i.test(query)) {
      return [{
        title: "Иван Петров — генеральный директор компании Альфа",
        url: "https://tenchat.ru/ivan-petrov",
        snippet: "Иван Петров, генеральный директор компании Альфа.",
        source_label: "test-search",
        score: 1,
        published_at: null,
        raw_content: null,
      }];
    }
    if (/Telegram/i.test(query)) {
      return [{
        title: "Иван Петров — компания Альфа",
        url: "https://t.me/ivan_petrov_public",
        snippet: "Иван Петров, генеральный директор компании Альфа.",
        source_label: "test-search",
        score: 1,
        published_at: null,
        raw_content: null,
      }];
    }
    return [{
      title: "Руководство компании Альфа",
      url: "https://microsoft.com/team",
      snippet: "Иван Петров — генеральный директор. Анна Сидорова — коммерческий директор. Восточная Европа — генеральный директор компании Альфа.",
      source_label: "test-search",
      score: 1,
      published_at: null,
      raw_content: null,
    }];
  },
};

const decisionMaker = {
  primary_persona: "генеральный директор",
  alternative_personas: ["коммерческий директор", "директор по развитию"],
  department: "Руководство",
  buying_role: "economic_buyer",
  influence_level: "high",
  decision_authority: "high",
  business_problem_owner: "руководитель бизнеса",
  expected_pain: "ручная работа ограничивает скорость",
  expected_goal: "выбрать полезный участок автоматизации",
  search_keywords: ["генеральный директор", "коммерческий директор"],
  priority: "high",
  reasoning: "Сигнал относится к бизнес-процессам компании.",
  confidence_score: 90,
  source_reasoning: { signal_type: "TECH_SIGNAL" },
};

try {
  const result = await researchCompany(
    "Компания Альфа",
    "https://microsoft.com",
    {
      type: "TECH_SIGNAL",
      title: "Компания развивает автоматизацию",
      detail: "В публичном источнике описан проект автоматизации бизнес-процессов.",
      sourceUrl: "https://microsoft.com/news/automation",
      confidence: 90,
    },
    { decisionMaker, searchProvider, bypassCache: true },
  );

  assert.ok(result.bundle.people.length >= 1, "company-first research must return people");
  assert.ok(result.bundle.people.length <= 3, "research must keep at most three LPRs");
  assert.ok(result.bundle.people[0].evidence.length > 0, "person evidence must be preserved");
  assert.equal(
    result.bundle.people.some((person) => person.fullName === "Восточная Европа"),
    false,
    "capitalized page text without human-name evidence must not become an LPR",
  );
  const ivan = result.bundle.people.find((person) => person.fullName === "Иван Петров");
  assert.equal(ivan?.profiles.tenchat, "https://tenchat.ru/ivan-petrov");
  assert.equal(ivan?.profiles.telegram, "https://t.me/ivan_petrov_public");
  assert.ok(result.bundle.bestOutreachContact, "general or personal corporate email must remain usable");
  assert.equal(result.bundle.bestOutreachContact.personName, "Иван Петров");
  assert.equal(result.bundle.bestOutreachContact.classification, "VERIFIED_PERSONAL");
  assert.ok(result.bundle.metrics.queries <= 12, "person search budget must remain bounded");
  assert.notEqual(
    classifyEvidenceBackedEmail({
      email: "name.surname@microsoft.com",
      officialDomain: "microsoft.com",
      confirmedPerson: false,
    }),
    "VERIFIED_PERSONAL",
  );

  const failingProvider = { async search() { throw new Error("provider unavailable"); } };
  const fallback = await researchCompany(
    "Компания Альфа",
    "https://microsoft.com",
    {
      type: "TECH_SIGNAL",
      title: "Компания развивает автоматизацию",
      detail: "Публичный контекст подтверждён.",
      sourceUrl: "https://microsoft.com/news/automation",
      confidence: 90,
    },
    { decisionMaker, searchProvider: failingProvider, bypassCache: true },
  );
  assert.ok(fallback.bundle.emails.general.length > 0, "provider failure must preserve official-site fallback");

  const [discovery, sourceRunner] = await Promise.all([
    fs.readFile("lib/leadgen/lead-discovery-engine.ts", "utf8"),
    fs.readFile("lib/leadgen/source-campaign-runner.ts", "utf8"),
  ]);
  assert.match(discovery, /researchCompany\(/, "DISCOVERY must use researchCompany");
  assert.match(sourceRunner, /researchCompany\(/, "AI_HIRING and IMPORTED must use researchCompany");

  console.log(JSON.stringify({
    status: "COMPANY_RESEARCH_AGENT_OK",
    people: result.bundle.people.length,
    tenchat: result.bundle.people.filter((person) => person.profiles.tenchat).length,
    telegram: result.bundle.people.filter((person) => person.profiles.telegram).length,
    usable: Boolean(result.bundle.bestOutreachContact),
    queries: result.bundle.metrics.queries,
    providerFailureFallback: Boolean(fallback.bundle.bestOutreachContact),
    originsUsingSharedService: 3,
  }));
} finally {
  globalThis.fetch = originalFetch;
}
