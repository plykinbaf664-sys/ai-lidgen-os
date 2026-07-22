import assert from "node:assert/strict";

const rejected = [
  "Телефон: +7 (495) 123-45-67. Email: info@company.ru. Адрес: Москва. Режим работы: круглосуточно.",
  "Отдел закупок. Отдел кадров. Отдел логистики. Заявка на сотрудничество.",
  "Контакты компании. Факс. E-mail.",
];

const accepted = [
  ["Компания открыла новый филиал в Санкт-Петербурге.", "new_location"],
  ["Опубликованы вакансии для 12 менеджеров по продажам.", "hiring"],
  ["Компания запустила новое направление корпоративных услуг.", "new_service"],
  ["Компания расширила сеть до 15 регионов.", "expansion"],
];

const moduleUrl = new URL(
  "../lib/leadgen/signals/commercial-signal-validator.ts",
  import.meta.url,
);
const {
  validateCommercialSignalCandidate,
} = await import(moduleUrl.href);

for (const text of rejected) {
  assert.equal(
    validateCommercialSignalCandidate({
      text,
      sourceUrl: "https://company.ru/contacts",
      confidence: 90,
    }),
    null,
    `Must reject contact text: ${text}`,
  );
}

for (const [text, type] of accepted) {
  const signal = validateCommercialSignalCandidate({
    text,
    sourceUrl: "https://company.ru/news/update",
    confidence: 90,
  });
  assert.equal(signal?.type, type, `Must classify: ${text}`);
}

const boundary = validateCommercialSignalCandidate({
  text: [
    "Контакты компании. Телефон: +7 (495) 123-45-67.",
    "Компания открыла новый филиал в Санкт-Петербурге.",
    "Email: info@company.ru. Режим работы: круглосуточно.",
  ].join(" "),
  sourceUrl: "https://company.ru/contacts",
  confidence: 92,
});
assert.equal(boundary?.type, "new_location");
assert.equal(
  boundary?.evidence,
  "Компания открыла новый филиал в Санкт-Петербурге.",
);
assert.equal(boundary?.evidence.includes("Телефон"), false);

console.log("Commercial signal validation checks passed.");
