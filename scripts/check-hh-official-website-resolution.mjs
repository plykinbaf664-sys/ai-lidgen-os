import assert from "node:assert/strict";
import {
  parseHhEmployerId,
  parseHhEmployerWebsite,
} from "../lib/leadgen/public-contact-provider.ts";

assert.equal(
  parseHhEmployerId('<a href="/employer/64174">Работодатель</a>'),
  "64174",
);
assert.equal(
  parseHhEmployerWebsite(
    '<a data-qa="company-site" target="_blank" href="http://company.ru/path?from=hh">Сайт</a>',
  ),
  "http://company.ru/path?from=hh",
);
assert.equal(
  parseHhEmployerWebsite(
    '<a data-qa="company-site" href="https://hh.ru/employer/1">HH</a>',
  ),
  null,
);
assert.equal(parseHhEmployerWebsite("<html></html>"), null);

console.log("HH_OFFICIAL_WEBSITE_RESOLUTION_CHECK_OK");
