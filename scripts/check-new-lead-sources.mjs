import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";

if (!process.argv[2]) {
  throw new Error("Pass an explicit isolated test server URL; localhost production data must never be the default.");
}
const baseUrl = process.argv[2];
const expectedEnabled = process.argv[3] !== "disabled";
const headers = {
  origin: baseUrl,
  host: new URL(baseUrl).host,
  "sec-fetch-site": "same-origin",
  ...(process.env.LEADGEN_ADMIN_SECRET
    ? { authorization: `Bearer ${process.env.LEADGEN_ADMIN_SECRET}` }
    : {}),
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(content);
    const compressed = deflateRawSync(raw);
    const checksum = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

async function previewFile(name, type, bytes) {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  const response = await fetch(`${baseUrl}/api/leadgen/imports/preview`, {
    method: "POST",
    headers,
    body: form,
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.success, true);
  return result;
}

const shadowVacancies = [
  ["AI-инженер", "Автоматизация отдела продаж, обработка лидов и интеграция с CRM", "Продажи Плюс"],
  ["LLM-разработчик", "AI-ассистенты и RAG для внутренней базы знаний", "Документ Системс"],
  ["AI Agent Developer", "AI agents for customer support and internal workflows", "Support Hub"],
  ["Специалист по внедрению ИИ", "Автоматизация документооборота и бизнес-процессов", "Логистика Юг"],
  ["AI-интегратор", "Интеграция LLM с Bitrix CRM и квалификация заявок", "МедСервис"],
  ["ML Engineer", "Computer vision research and image recognition", "Vision Lab"],
  ["AI-инженер", "Автоматизация CRM и AI-агенты для наших клиентов и заказчиков", "AI Agency"],
  ["AI Product Manager", "Развитие AI-продукта без задач автоматизации процессов", "Product AI"],
  ["Инженер по автоматизации", "Промышленные контроллеры, КИПиА и электроприводы", "Завод"],
  ["Разработчик", "Backend-разработка личного кабинета", "Web Company"],
].map(([title, description, employerName], index) => ({
  id: `shadow-${index}`,
  title,
  description,
  employerName,
  employerWebsite: `https://shadow-${index}.example`,
  sourceProvider: "synthetic-shadow",
  sourceUrl: `https://jobs.example/${index}`,
}));
const discoveryCandidate = {
  companyName: "Alpha",
  domain: "alpha.ru",
  website: "https://alpha.ru",
  fullName: "Иван Петров",
  email: "ivan@alpha.ru",
  originContext: { origins: ["DISCOVERY"] },
  signals: [{ type: "HIRING_SIGNAL", sourceUrl: "https://hh.ru/1", evidence: "Найм РОП" }],
};
const importedCandidate = {
  ...discoveryCandidate,
  companyName: "ООО Альфа",
  website: null,
  originContext: { origins: ["IMPORTED"] },
  signals: [{ type: "AI_AUTOMATION_HIRING_SIGNAL", sourceUrl: "https://hh.ru/2", evidence: "AI automation" }],
};
const aiHiringCandidate = {
  ...discoveryCandidate,
  fullName: null,
  email: null,
  originContext: { origins: ["AI_HIRING"] },
  signals: [{ type: "AI_AUTOMATION_HIRING_SIGNAL", sourceUrl: "https://hh.ru/3", evidence: "AI agents for CRM" }],
};
const shadowResponse = await fetch(`${baseUrl}/api/leadgen/ai-hiring/shadow`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ vacancies: shadowVacancies, dedupCandidates: [discoveryCandidate, importedCandidate, aiHiringCandidate] }),
});
const shadow = await shadowResponse.json();
assert.equal(shadowResponse.status, 200, JSON.stringify(shadow));
assert.equal(shadow.metrics.jobsScanned, 10);
assert.equal(shadow.metrics.automationIntentPass, 5);
assert.ok(shadow.results.some((item) => item.reason === "service_provider_not_end_customer"));
assert.equal(shadow.dedup.input, 3);
assert.equal(shadow.dedup.output, 1);
assert.deepEqual(shadow.dedup.candidates[0].originContext.origins, ["DISCOVERY", "AI_HIRING", "IMPORTED"]);
assert.match(shadow.results[0].outreachAngle, /не противопоставляя это найму/);

const csvRows = [
  ["company", "domain", "full_name", "role", "email", "notes"],
  ["Alpha", "alpha.ru", "Иван Петров", "РОП", "ivan@alpha.ru", ""],
  ["Alpha", "alpha.ru", "Иван Петров", "РОП", "ivan@alpha.ru", ""],
  ["Bad", "bad.ru", "", "", "not-an-email", ""],
  ["", "", "", "", "person@gmail.com", ""],
  ["Beta", "beta.ru", "", "", "sales@beta.ru", ""],
  ["Gamma", "gamma.ru", "", "", "office@other.ru", ""],
  ["=HYPERLINK('x')", "formula.ru", "", "", "info@formula.ru", ""],
  ["Html", "html.ru", "", "", "info@html.ru", "<script>alert(1)</script>"],
  ["Existing", "existing.ru", "", "", "known@existing.ru", ""],
  ["Company Only", "", "", "", "", ""],
  ["", "domain-only.ru", "", "", "", ""],
  ["Person Co", "person.ru", "Пётр Сидоров", "Директор", "petr@person.ru", ""],
  ["Needs Email", "needs.ru", "", "", "", ""],
  ...Array.from({ length: 7 }, (_, index) => [`Company ${index}`, `co${index}.ru`, "", "", `info@co${index}.ru`, ""]),
];
const csv = csvRows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
const imported = await previewFile("contacts.csv", "text/csv", Buffer.from(csv));
assert.deepEqual(
  {
    total: imported.summary.rowsTotal,
    valid: imported.summary.valid,
    invalid: imported.summary.invalid,
    duplicates: imported.summary.duplicates,
  },
  { total: 20, valid: 16, invalid: 3, duplicates: 1 },
);
assert.equal(imported.productionEnabled, expectedEnabled);

const worksheet = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>company</t></is></c><c r="B1" t="inlineStr"><is><t>email</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>XLSX Co</t></is></c><c r="B2" t="inlineStr"><is><t>hello@xlsx.ru</t></is></c></row>
<row r="3"><c r="A3"><f>HYPERLINK("x")</f><v>0</v></c><c r="B3" t="inlineStr"><is><t>bad@xlsx.ru</t></is></c></row>
</sheetData></worksheet>`;
const xlsx = await previewFile(
  "contacts.xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip([["xl/worksheets/sheet1.xml", worksheet]]),
);
assert.equal(xlsx.summary.valid, 1);
assert.equal(xlsx.summary.invalid, 1);

const confirmResponse = await fetch(`${baseUrl}/api/leadgen/imports/confirm`, {
  method: "POST",
  headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ previewId: imported.previewId, verticalId: "manufacturing", name: "Import regression" }),
});
if (expectedEnabled) {
  const confirmed = await confirmResponse.json();
  assert.equal(confirmResponse.status, 200, JSON.stringify(confirmed));
  assert.equal(confirmed.imported, 16);
  assert.equal(confirmed.autoSend, false);
  const repeated = await previewFile("contacts.csv", "text/csv", Buffer.from(csv));
  assert.equal(repeated.alreadyImported, true);
  const repeatedConfirm = await fetch(`${baseUrl}/api/leadgen/imports/confirm`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ previewId: repeated.previewId, verticalId: "manufacturing", name: "Repeated import regression" }),
  });
  const repeatedResult = await repeatedConfirm.json();
  assert.equal(repeatedResult.status, "DUPLICATE");
  assert.equal(repeatedResult.imported, 0);
  const queue = await (await fetch(`${baseUrl}/api/leadgen/outreach/batch`)).json();
  assert.equal(queue.entries.filter((entry) => entry.status === "sent").length, 0);
} else {
  assert.equal(confirmResponse.status, 409);
}

console.log(JSON.stringify({
  status: "NEW_LEAD_SOURCES_OK",
  import: imported.summary,
  xlsx: xlsx.summary,
  aiHiring: shadow.metrics,
  examples: shadow.results.map((result, index) => ({
    title: shadowVacancies[index].title,
    status: result.status,
    reason: result.reason,
  })),
  dedup: shadow.dedup.output === 1 ? "PASS" : "FAIL",
  productionEnabled: expectedEnabled,
  smtpCalls: 0,
}));
