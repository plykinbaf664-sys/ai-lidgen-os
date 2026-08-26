import assert from "node:assert/strict";
import "./register-ts-paths.mjs";

const { verifyCompanySegment } = await import("../lib/leadgen/segment-guard.ts");
const { recheckUncertainCompanySegment } = await import(
  "../lib/leadgen/segment-verification-research.ts"
);

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

const uncertain = verifyCompanySegment({
  selectedSegment: "legal",
  companyName: "Право Плюс",
});
assert.equal(uncertain.match, "UNCERTAIN");
let recheckCalls = 0;
const rechecked = await recheckUncertainCompanySegment({
  input: {
    selectedSegment: "legal",
    companyName: "Право Плюс",
  },
  initial: uncertain,
  searchProvider: {
    async search() {
      recheckCalls += 1;
      return [{
        title: "Право Плюс — юридическая фирма",
        snippet: "Юридический консалтинг и адвокатское бюро.",
        url: "https://pravo-plus.example/about",
        source_label: "test",
        score: 1,
        published_at: null,
        raw_content: null,
      }];
    },
  },
});
assert.equal(recheckCalls, 1);
assert.equal(rechecked.verification.match, "MATCH");
assert.equal(rechecked.sourceUrls.length, 1);

process.stdout.write("SEGMENT_GUARD_OK cases=10 stale_default=blocked uncertain_recheck=passed\n");
