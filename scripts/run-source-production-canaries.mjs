import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const baseUrl = process.argv[2] ?? "http://localhost:3015";
const secret = process.env.LEADGEN_ADMIN_SECRET;
const dataDir = process.env.LEADGEN_LOCAL_DATA_DIR;
assert.ok(secret, "LEADGEN_ADMIN_SECRET is required");
assert.ok(dataDir, "LEADGEN_LOCAL_DATA_DIR is required");

const headers = {
  Authorization: `Bearer ${secret}`,
  Origin: baseUrl,
  "Sec-Fetch-Site": "same-origin",
};

const historicalEmail = "sent.contact@legacy-factory.test";
const outreachDir = path.join(path.resolve(dataDir), "outreach");
await mkdir(outreachDir, { recursive: true });
const now = new Date().toISOString();
await writeFile(path.join(outreachDir, "historical-sent.json"), JSON.stringify({
  id: "historical-sent",
  contact_id: "historical-contact",
  lead_id: "historical-lead",
  campaign_id: "historical-campaign",
  company_id: "historical-company",
  company_name: "Тестовый завод История",
  recipient_name: null,
  recipient_role: null,
  email: historicalEmail,
  email_type: "generic_email",
  email_source_url: null,
  email_source_label: "canary fixture",
  readiness: "fallback_ready",
  signal: { type: "HIRING_SIGNAL", title: "fixture", detail: "fixture", source_url: null, confidence_score: 100 },
  subject: "fixture",
  body: "fixture",
  message_mode: "generic_routing",
  status: "sent",
  idempotency_key: "historical-sent",
  send_attempts: 1,
  last_error: null,
  provider: "fixture",
  provider_message_id: "fixture-message-id",
  created_at: now,
  approved_at: now,
  queued_at: now,
  sent_at: now,
  follow_up_due_at: null,
  follow_up_status: null,
  history: [{ status: "sent", at: now }],
}), "utf8");

const rows = [
  ["Тестовый завод Альфа", "https://alpha-factory.test", "alpha-factory.test", "", "", "", "", "sales@alpha-factory.test", "Производитель расширяет обработку входящих заявок"],
  ["Производство Бета", "https://beta-production.test", "beta-production.test", "", "", "", "", "info@beta-production.test", "Производственная компания масштабирует документооборот"],
  ["Завод Гамма", "https://gamma-plant.test", "gamma-plant.test", "", "", "", "", "office@gamma-plant.test", "Завод внедряет цифровую обработку заказов"],
  ["Фабрика Дельта", "https://delta-factory.test", "delta-factory.test", "", "", "", "", "commercial@delta-factory.test", "Фабрика расширяет отдел продаж"],
  ["Промышленная компания Эпсилон", "https://epsilon-industry.test", "epsilon-industry.test", "Иван", "Петров", "Иван Петров", "Коммерческий директор", "ivan.petrov@epsilon-industry.test", "Компания автоматизирует обработку коммерческих запросов"],
  ["Завод Дзета", "https://zeta-plant.test", "zeta-plant.test", "", "", "", "", "hello@zeta-plant.test", "Производитель запускает новое направление"],
  ["Производство Эта", "https://eta-production.test", "eta-production.test", "", "", "", "", "marketing@eta-production.test", "Производство развивает дилерскую сеть"],
  ["Фабрика Тета", "https://theta-factory.test", "theta-factory.test", "", "", "", "", "support@theta-factory.test", "Фабрика внедряет CRM для обращений"],
  ["Завод Йота", "https://iota-plant.test", "iota-plant.test", "", "", "", "", "info@iota-plant.test", "Завод увеличивает поток заявок"],
  ["Производство Каппа", "https://kappa-production.test", "kappa-production.test", "", "", "", "", "sales@kappa-production.test", "Производственная компания расширяет продажи"],
  ["Фабрика Лямбда", "https://lambda-factory.test", "lambda-factory.test", "", "", "", "", "office@lambda-factory.test", "Фабрика обновляет обработку документов"],
  ["Завод Мю", "https://mu-plant.test", "mu-plant.test", "", "", "", "", "info@mu-plant.test", "Производитель масштабирует работу с дилерами"],
  ["Тестовый завод История", "https://legacy-factory.test", "legacy-factory.test", "", "", "", "", historicalEmail, "Исторический контакт не должен получить новое письмо"],
  ["Завод Без Контекста", "https://nocontext-plant.test", "nocontext-plant.test", "", "", "", "", "info@nocontext-plant.test", ""],
  ["", "", "", "", "", "", "", "mailonly@unknown-company.test", ""],
  ["Завод Free", "", "", "", "", "", "", "factory.person@gmail.com", "Производственный контекст"],
  ["Завод Wrong", "https://wrong-plant.test", "wrong-plant.test", "", "", "", "", "info@other-domain.test", "Производственный контекст"],
  ["Завод Bad", "https://bad-plant.test", "bad-plant.test", "", "", "", "", "not-an-email", "Производственный контекст"],
  ["Клиника Не Сегмент", "https://clinic-example.test", "clinic-example.test", "", "", "", "", "info@clinic-example.test", "Частная клиника расширяет запись пациентов"],
  ["Завод Альфа Дубль", "https://alpha-factory.test", "alpha-factory.test", "", "", "", "", "sales@alpha-factory.test", "Дубликат email"],
  ["Стоматология Не Сегмент", "https://dental-example.test", "dental-example.test", "", "", "", "", "info@dental-example.test", "Стоматология открывает кабинет"],
  ["Производство Ню", "https://nu-production.test", "nu-production.test", "", "", "", "", "sales@nu-production.test", "Производство расширяет обработку заявок"],
  ["Завод Кси", "https://xi-plant.test", "xi-plant.test", "", "", "", "", "info@xi-plant.test", "Завод запускает цифровой каталог"],
  ["Фабрика Омикрон", "https://omicron-factory.test", "omicron-factory.test", "", "", "", "", "office@omicron-factory.test", "Фабрика автоматизирует приём заказов"],
];
const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
const csv = [
  ["company", "website", "domain", "first_name", "last_name", "full_name", "role", "email", "notes"],
  ...rows,
].map((row) => row.map(escapeCsv).join(",")).join("\n");

const unauthForm = new FormData();
unauthForm.set("file", new File([csv], "canary.csv", { type: "text/csv" }));
const unauth = await fetch(`${baseUrl}/api/leadgen/imports/preview`, { method: "POST", body: unauthForm });
assert.equal(unauth.status, 401, "unauthenticated upload must be rejected");

async function preview() {
  const form = new FormData();
  form.set("file", new File([csv], "canary.csv", { type: "text/csv" }));
  const response = await fetch(`${baseUrl}/api/leadgen/imports/preview`, { method: "POST", headers, body: form });
  assert.equal(response.status, 200);
  return response.json();
}

const firstPreview = await preview();
assert.equal(firstPreview.success, true);
const confirmResponse = await fetch(`${baseUrl}/api/leadgen/imports/confirm`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ previewId: firstPreview.previewId }),
});
assert.equal(confirmResponse.status, 200);
const confirmed = await confirmResponse.json();
assert.equal(confirmed.autoSend, false);

const importCanaryResponse = await fetch(`${baseUrl}/api/leadgen/imports/canary`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ batchId: confirmed.batchId, verticalId: "manufacturing" }),
});
assert.equal(importCanaryResponse.status, 200);
const importCanary = await importCanaryResponse.json();
assert.equal(importCanary.result.smtpCalls, 0);
assert.equal(importCanary.result.autoSend, false);
assert.ok(importCanary.result.items.some((item) => item.historicalSentProtected));

const repeatedPreview = await preview();
assert.equal(repeatedPreview.alreadyImported, true);
const repeatedConfirmResponse = await fetch(`${baseUrl}/api/leadgen/imports/confirm`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ previewId: repeatedPreview.previewId }),
});
const repeatedConfirm = await repeatedConfirmResponse.json();
assert.equal(repeatedConfirm.status, "DUPLICATE");
assert.equal(repeatedConfirm.imported, 0);

const previewTable = path.join(path.resolve(dataDir), "tables", "leadgen_import_previews.json.gz");
const storedPreviews = JSON.parse(gunzipSync(await readFile(previewTable)).toString("utf8"));
for (const stored of storedPreviews) stored.expires_at = "2000-01-01T00:00:00.000Z";
await writeFile(previewTable, gzipSync(JSON.stringify(storedPreviews), { level: 9 }));
const cleanupTrigger = await preview();
const afterCleanup = JSON.parse(gunzipSync(await readFile(previewTable)).toString("utf8"));
assert.ok(!afterCleanup.some((item) => item.id === repeatedPreview.previewId));
assert.ok(afterCleanup.some((item) => item.id === cleanupTrigger.previewId));

const aiResponse = await fetch(`${baseUrl}/api/leadgen/ai-hiring/canary`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ verticalId: "manufacturing" }),
  signal: AbortSignal.timeout(170_000),
});
assert.equal(aiResponse.status, 200);
const aiCanary = await aiResponse.json();
assert.equal(aiCanary.result.smtpCalls, 0);
assert.equal(aiCanary.result.mutated, false);
assert.equal(aiCanary.result.metrics.orphanRequests, 0);

const analyticsResponse = await fetch(`${baseUrl}/api/leadgen/analytics?refresh=true`);
assert.equal(analyticsResponse.status, 200);
const analytics = await analyticsResponse.json();
assert.equal(analytics.snapshot.sourceCanaries.imported.candidates, importCanary.result.metrics.newCandidates);
assert.equal(analytics.snapshot.sourceCanaries.aiHiring.candidates, aiCanary.result.metrics.companiesExtracted);

console.log(JSON.stringify({
  status: "SOURCE_PRODUCTION_CANARIES_OK",
  auth: { unauthenticated: unauth.status, authenticated: 200 },
  import: importCanary.result,
  repeatedImport: { status: repeatedConfirm.status, imported: repeatedConfirm.imported },
  previewCleanup: "PASS",
  aiHiring: aiCanary.result,
  analytics: analytics.snapshot.sourceCanaries,
  smtpCalls: 0,
}));
