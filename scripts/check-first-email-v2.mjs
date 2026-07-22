import assert from "node:assert/strict";
import {
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
  assert.equal(copy.body.split("\n\n").length, 5);
  assert.equal(copy.qualityGatePassed, true);
  assert.equal(copy.microValue.items.length, 3);
  assert.match(copy.body, /три конкретные идеи/i);
  assert.doesNotMatch(copy.body, /найден\w*\s+сигнал|обнаруж\w*\s+сигнал|признак\w*\s+рост/i);
  assert.doesNotMatch(copy.body, /созвон|встреч/i);
}

assert.match(copies[0].blocks.cta, /Прислать/i);
assert.match(copies[1].blocks.cta, /Кому в вашей команде/i);
assert.match(copies[2].blocks.cta, /Кто у вас отвечает/i);
assert.equal(new Set(copies.map((copy) => copy.subject)).size, copies.length);

const noSignal = generateFirstEmailV3({ companyName: "Без сигнала", messageMode: "personal" });
assert.equal(noSignal.qualityGatePassed, false);
assert.equal(noSignal.reviewStatus, "needs_manual_copy_review");

process.stdout.write("FIRST_EMAIL_V3_OK scenarios=3 quality_gate=passed promise_integrity=passed contact_cta=passed\n");
