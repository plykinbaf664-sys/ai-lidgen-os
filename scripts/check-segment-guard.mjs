import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { verifyCompanySegment } = await import("../lib/leadgen/segment-guard.ts");

const verify = (selectedSegment, companyName, companySegment, signalTitle = "") =>
  verifyCompanySegment({ selectedSegment, companyName, companySegment, signalTitle });

assert.equal(verify("real_estate", "Новый квартал", "девелопер").match, "MATCH");
assert.equal(verify("real_estate", "Дом Эксперт", "агентство недвижимости").match, "MATCH");
assert.equal(verify("real_estate", "Белая улыбка", "стоматология").match, "MISMATCH");
assert.equal(verify("medicine", "Медлайн", "частная клиника").match, "MATCH");
assert.equal(verify("medicine", "Дентал Плюс", "сеть стоматологий").match, "MATCH");
assert.equal(verify("medicine", "Город Девелопмент", "девелопер").match, "MISMATCH");
assert.equal(verify("manufacturing", "Промдеталь", "производственная компания").match, "MATCH");
assert.equal(verify("manufacturing", "Семейный доктор", "клиника").match, "MISMATCH");

const staleQuery = verifyCompanySegment({
  selectedSegment: "medicine",
  companyName: "Стройинтех",
  companySegment: "производственная компания",
  discoveryQuery: 'site:hh.ru/vacancy "Главный врач" клиника',
  signalTitle: "Руководитель отдела продаж строительного оборудования",
});
assert.equal(staleQuery.match, "MISMATCH", "stale discovery query must not override company evidence");
process.stdout.write("SEGMENT_GUARD_OK cases=9 stale_default=blocked\n");
