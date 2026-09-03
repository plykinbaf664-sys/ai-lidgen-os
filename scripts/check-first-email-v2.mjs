import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const {
  INITIAL_OUTREACH_SIGNATURE,
  countFirstEmailContentWords,
  generateFirstEmailV3,
  validateFirstEmailV3,
} = await import("../lib/leadgen/first-email-generator.ts");
const { OUTREACH_BONUS_LINKS } = await import("../lib/leadgen/outreach-guide-config.ts");

const scenarios = [
  {
    companyName: "Альфа",
    decisionMakerName: "Анна Петрова",
    decisionMakerRole: "Руководитель отдела продаж",
    messageMode: "personal",
    signalType: "hiring",
    signalEvidence: "Компания опубликовала вакансии менеджеров по продажам.",
    signalSourceUrl: "https://alpha.example/jobs",
  },
  {
    companyName: "Бета Клиника",
    industry: "частная медицина",
    messageMode: "department",
    signalType: "customer_service_growth",
    signalEvidence: "Компания расширяет клиентский сервис.",
    signalSourceUrl: "https://beta.example/news/service",
  },
  {
    companyName: "Гамма Технологии",
    industry: "разработка программного обеспечения",
    messageMode: "generic_routing",
    signalType: "digital_transformation",
    signalEvidence: "Компания внедряет новую CRM и API.",
    signalSourceUrl: "https://gamma.example/news/crm",
  },
  {
    companyName: "Меридиан Девелопмент",
    decisionMakerName: "Илья Соколов",
    messageMode: "personal",
    signalType: "new_location",
    signalEvidence: "Компания начала работу в новом регионе.",
    signalSourceUrl: "https://meridian.example/news/region",
  },
  {
    companyName: "Север Пром",
    messageMode: "generic_routing",
    signalType: "new_product",
    signalEvidence: "Компания запустила новую производственную линию.",
    signalSourceUrl: "https://sever.example/news/line",
  },
];

const copies = scenarios.map((context, index) => generateFirstEmailV3({
  ...context,
  uniquenessKey: String(index),
}));

for (const [index, copy] of copies.entries()) {
  const validation = validateFirstEmailV3(copy, scenarios[index]);
  assert.equal(validation.valid, true, `${index + 1}: ${validation.errors.join(" ")}`);
  assert.equal(copy.qualityGatePassed, true);
  assert.ok(countFirstEmailContentWords(copy.body) >= 120);
  assert.ok(countFirstEmailContentWords(copy.body) <= 200);
  assert.match(copy.body, /Я AI-архитектор/);
  assert.match(copy.body, /бизнес-аналитика/);
  assert.match(copy.body, /9\s*900\s*₽/);
  assert.match(copy.body, /24\s+час/);
  assert.match(copy.body, /Бонусы можно забрать по ссылкам:/);
  for (const bonus of OUTREACH_BONUS_LINKS) assert.ok(copy.body.includes(bonus.url));
  assert.doesNotMatch(copy.body, /к письму (?:приложил|прикрепил)|во вложени/i);
  assert.doesNotMatch(copy.body, /operations leadership|growth and|manual handoffs|process fragmentation|operational bottlenecks/i);
  assert.match(copy.body, /Александр Плыкин, AI-архитектор\n\+79629910514$/);
}

assert.match(copies[0].blocks.cta, /посмотреть этот участок/i);
assert.match(copies[1].blocks.cta, /кто у вас отвечает/i);
assert.match(copies[2].blocks.cta, /кто у вас отвечает/i);
assert.equal(new Set(copies.map((copy) => copy.subject)).size, copies.length);

const contentAtLimit = Array.from({ length: 200 }, (_, index) => `слово${index}`).join(" ");
assert.equal(countFirstEmailContentWords(`${contentAtLimit}\n\n${INITIAL_OUTREACH_SIGNATURE}`), 200);

const noSignal = generateFirstEmailV3({ companyName: "Без сигнала", messageMode: "personal" });
assert.equal(noSignal.qualityGatePassed, false);

for (const [index, copy] of copies.entries()) {
  process.stdout.write(`\n--- TEST EMAIL ${index + 1} ---\nSUBJECT: ${copy.subject}\n${copy.body}\n`);
}
process.stdout.write("\nFIRST_EMAIL_V4_OK scenarios=5 russian=passed signal=passed cta=passed\n");
