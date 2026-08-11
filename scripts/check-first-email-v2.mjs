import assert from "node:assert/strict";
import {
  INITIAL_OUTREACH_SIGNATURE,
  countFirstEmailContentWords,
  generateFirstEmailV3,
  validateFirstEmailV3,
} from "../lib/leadgen/first-email-generator.ts";

const scenarios = [
  {
    companyName: "Альфа",
    decisionMakerName: "Анна Петрова",
    decisionMakerRole: "Руководитель отдела продаж",
    contactEmail: "anna@alpha.example",
    messageMode: "personal",
    signalType: "hiring",
    signalEvidence: "Компания опубликовала вакансии менеджеров по продажам.",
    signalSourceUrl: "https://alpha.example/jobs",
  },
  {
    companyName: "Бета Клиника",
    industry: "частная медицина",
    contactEmail: "support@beta.example",
    messageMode: "department",
    signalType: "customer_service_growth",
    signalEvidence: "Компания расширяет клиентский сервис.",
    signalSourceUrl: "https://beta.example/news/service",
  },
  {
    companyName: "Гамма Технологии",
    industry: "разработка программного обеспечения",
    contactEmail: "hello@gamma.example",
    messageMode: "generic_routing",
    signalType: "digital_transformation",
    signalEvidence: "Компания внедряет новую CRM и API.",
    signalSourceUrl: "https://gamma.example/news/crm",
  },
];

const copies = [];
for (const [index, context] of scenarios.entries()) {
  copies.push(generateFirstEmailV3({ ...context, uniquenessKey: String(index), batchBodies: copies.map((copy) => copy.body) }));
}

for (const [index, copy] of copies.entries()) {
  const validation = validateFirstEmailV3(copy, scenarios[index]);
  assert.equal(validation.valid, true, validation.errors.join(" "));
  assert.equal(copy.body.split("\n\n").length, 6);
  assert.equal(copy.qualityGatePassed, true);
  assert.equal(copy.microValue.items.length, 3);
  assert.match(copy.body, /схему из трёх шагов/i);
  assert.doesNotMatch(copy.body, /найден\w*\s+сигнал|обнаруж\w*\s+сигнал|признак\w*\s+рост/i);
  assert.match(copy.body, /15[-\s]?минут|15\s+минут/i);
  assert.match(copy.body, /покаж|разбор|обсуд/i);
  assert.equal(copy.quality.call_relevance, 10);
  assert.match(copy.body, /Александр Плыкин, Ai-архитектор\n\+79629910514$/);
}

assert.match(copies[0].blocks.cta, /за 15 минут — обсудим/i);
assert.match(copies[1].blocks.cta, /Кого из вашей команды/i);
assert.match(copies[2].blocks.cta, /Кто отвечает за этот процесс/i);
assert.equal(new Set(copies.map((copy) => copy.subject)).size, copies.length);

const contentAtLimit = Array.from({ length: 110 }, (_, index) => `word${index}`).join(" ");
assert.equal(
  countFirstEmailContentWords(`${contentAtLimit}\n\n${INITIAL_OUTREACH_SIGNATURE}`),
  110,
  "fixed signature must not consume the first-email content word budget",
);

const noSignal = generateFirstEmailV3({ companyName: "Без сигнала", messageMode: "personal" });
assert.equal(noSignal.qualityGatePassed, false);
assert.equal(noSignal.reviewStatus, "needs_manual_copy_review");

process.stdout.write("FIRST_EMAIL_V3_OK scenarios=3 quality_gate=passed promise_integrity=passed contact_cta=passed\n");
