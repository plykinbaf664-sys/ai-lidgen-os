import assert from "node:assert/strict";
import {
  parseHhEmployerId,
  parseHhEmployerWebsite,
  parseHhPublicVacancyContact,
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

assert.deepEqual(
  parseHhPublicVacancyContact(
    {
      contacts: {
        name: "Олег Спешилов",
        email: "oleg.speshilov@company.ru",
        phones: [{ formatted: "+7 495 123-45-67" }],
      },
    },
    "company.ru",
    "https://hh.ru/vacancy/123",
  ),
  {
    fullName: "Олег Спешилов",
    email: "oleg.speshilov@company.ru",
    phones: ["+7 495 123-45-67"],
    sourceUrl: "https://hh.ru/vacancy/123",
  },
);
assert.equal(
  parseHhPublicVacancyContact(
    { contacts: { name: "Отдел персонала", email: "hr@company.ru" } },
    "company.ru",
    "https://hh.ru/vacancy/123",
  ),
  null,
);
assert.equal(
  parseHhPublicVacancyContact(
    { contacts: { name: "Олег Спешилов", email: "oleg@gmail.com" } },
    "company.ru",
    "https://hh.ru/vacancy/123",
  ),
  null,
);

console.log("HH_OFFICIAL_WEBSITE_RESOLUTION_CHECK_OK");
