import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import "./register-ts-paths.mjs";

// Isolated fixtures plus real Next HTTP, storage, queue and SMTP protocol.
// SMTP terminates in this process; it never relays or delivers any message.
const isolated = await mkdtemp(path.join(tmpdir(), "leadgen-transactions-"));
for (const key of Object.keys(process.env)) if (/SMTP|IMAP|TELEGRAM|OPENAI|TAVILY|SUPABASE|LEADGEN_ADMIN_SECRET/.test(key)) process.env[key] = "";
Object.assign(process.env, { LEADGEN_LOCAL_DATA_DIR: isolated, EMAIL_TEST_MODE: "true",
  EMAIL_TEST_RECIPIENT: "sink@example.invalid", EMAIL_MIN_DELAY_SECONDS: "1", EMAIL_MAX_DELAY_SECONDS: "1",
  FOLLOWUP_AUTOMATION_ENABLED: "false", LEADGEN_NEW_SOURCE_CONTOURS_ENABLED: "true" });
const originalFetch = globalThis.fetch;
const originalMx = dns.resolveMx;
let app;
let appOutput = "";
const messages = [];
const sockets = new Set();
const smtp = net.createServer(socket => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.write("220 isolated SMTP simulator\r\n");
  let buffer = "", auth = 0, data = false, message = "";
  socket.on("data", chunk => {
    buffer += chunk.toString();
    let boundary;
    while ((boundary = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
      if (data) {
        if (line === ".") { messages.push(message); message = ""; data = false; socket.write("250 simulated accepted\r\n"); }
        else message += `${line}\r\n`;
      } else if (auth) { socket.write(auth === 1 ? "334 password\r\n" : "235 authenticated\r\n"); auth = auth === 1 ? 2 : 0; }
      else if (line.startsWith("EHLO")) socket.write("250-localhost\r\n250 AUTH LOGIN\r\n");
      else if (line === "AUTH LOGIN") { auth = 1; socket.write("334 username\r\n"); }
      else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
      else if (line === "QUIT") socket.end("221 bye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
try {
  await new Promise(resolve => smtp.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.address().port),
    SMTP_SECURE: "false", SMTP_USER: "simulation", SMTP_PASSWORD: "simulation",
    SMTP_FROM_EMAIL: "sender@example.invalid", SMTP_FROM_NAME: "Isolated simulation" });
  dns.resolveMx = async () => [{ exchange: "mx.fixture.invalid", priority: 10 }];
  syncBuiltinESMExports();
  globalThis.fetch = async input => {
    const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
    if (url.hostname.endsWith("release-fixture.ru")) return new Response(`<html><head><title>Атлас</title></head><body><h1>Атлас</h1><p>Иван Петров — генеральный директор компании Атлас.</p><a href="mailto:info@${url.hostname}">info@${url.hostname}</a><a href="/contacts">Контакты</a></body></html>`);
    if (url.hostname.includes("dns")) return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 15, data: "10 mx.fixture.invalid." }] }));
    return new Response("", { status: 404 });
  };
  const { researchCompany } = await import("../lib/leadgen/company-research-agent.ts");
  const { buildEmailOutreachWithAi } = await import("../lib/leadgen/email-outreach-builder.ts");
  const { savePipelineResult } = await import("../lib/leadgen/storage.ts");
  const { syncOutreachQueue } = await import("../lib/leadgen/outreach-storage.ts");
  const { createLeadOriginContext } = await import("../lib/leadgen/lead-origin.ts");
  const campaigns = [];
  for (const origin of ["DISCOVERY", "AI_HIRING", "IMPORTED"]) {
    const now = new Date().toISOString();
    const campaign = { id: `release-${origin}`, pipeline_run_id: `release-${origin}`, name: `Проверка ${origin}`, requested_by: "isolated regression", status: "completed", icp_label: "Атлас", offer_label: "Аудит AI", created_at: now };
    const records = [];
    for (let i = 0; i < 3; i++) {
      const domain = `${origin.toLowerCase().replaceAll("_", "-")}-${i}.release-fixture.ru`, website = `https://${domain}`;
      const common = { pipeline_run_id: campaign.id, campaign_id: campaign.id, created_at: now, updated_at: now };
      const company = { ...common, id: `${campaign.id}-company-${i}`, company_name: "Атлас", company_domain: domain,
        company_segment: "IT", source: origin, source_url: website, source_label: "Изолированная проверка", signal_type: "TECH_SIGNAL",
        lead_score: 90, icp_fit_score: 90, confidence_score: 90, matched_signal_count: 1,
        metadata: { official_website: website, official_website_status: "confirmed", resolved_official_domain: domain,
          official_website_source_url: website, official_website_confidence: 100, origin_context: createLeadOriginContext(origin) } };
      const lead = { ...common, id: `${campaign.id}-lead-${i}`, company_id: company.id, company_name: "Атлас", company_domain: domain,
        company_segment: "IT", company_source_url: website, lead_score: 90, icp_fit_score: 90, status: "new", hook: "AI-помощник", message: "", follow_up: "" };
      const signal = { ...common, id: `${campaign.id}-signal-${i}`, company_id: company.id, lead_id: lead.id,
        signal_type: origin === "AI_HIRING" ? "AI_AUTOMATION_HIRING_SIGNAL" : "TECH_SIGNAL",
        signal_title: "Внедрение AI-помощника", signal_detail: "Атлас внедряет AI-помощника для обработки заявок.", source_url: `${website}/news/ai`, source_label: "Официальный сайт", confidence_score: 95 };
      const research = await researchCompany("Атлас", website, { type: signal.signal_type, title: signal.signal_title,
        detail: signal.signal_detail, sourceUrl: signal.source_url, confidence: 95 }, { campaign, company, lead, signals: [signal],
        bypassCache: true, searchProvider: { async search() { return []; } }, discoveryContext: { origin } });
      company.metadata.company_research = research.bundle;
      assert.ok(research.bundle.bestOutreachContact, `${origin}: usable fallback after research`);
      const contact = research.contactDiscovery.contacts.find(c => c.email === research.bundle.bestOutreachContact.email);
      const copy = await buildEmailOutreachWithAi({ companyName: "Атлас", companyWebsite: website, contact,
        readiness: "fallback_ready", signalType: signal.signal_type, signalTitle: signal.signal_title,
        signalDetail: signal.signal_detail, signalSourceUrl: signal.source_url, signalConfidence: 95 });
      Object.assign(contact.metadata, { email_body: copy.body, email_subject: copy.subject,
        email_quality_gate_passed: copy.qualityGatePassed, email_copy_review_status: copy.copyReviewStatus });
      lead.message = copy.body;
      records.push({ company, lead, signal, contact });
    }
    await savePipelineResult({ result: { campaign, companies: records.map(r => r.company), leads: records.map(r => r.lead), signals: records.map(r => r.signal), contacts: records.map(r => r.contact), events: [] }, notifications: [] });
    const ready = await syncOutreachQueue(campaign.id);
    assert.equal(ready.length, 3, `${origin}: three Ready records`);
    assert.equal((await syncOutreachQueue(campaign.id)).length, 3, "queue sync idempotency");
    campaigns.push(campaign);
  }
  globalThis.fetch = originalFetch;
  dns.resolveMx = originalMx;
  syncBuiltinESMExports();
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const baseUrl = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["--import", "./scripts/release-test-network.mjs", "node_modules/next/dist/bin/next", "start", "--port", String(port), "--hostname", "127.0.0.1"], { env: process.env, windowsHide: true });
  app.stdout.on("data", chunk => appOutput += chunk);
  app.stderr.on("data", chunk => appOutput += chunk);
  const request = async (route, body) => {
    const response = await fetch(`${baseUrl}${route}`, { ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
      headers: { "Content-Type": "application/json", origin: baseUrl, "sec-fetch-site": "same-origin" }, signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    assert.ok(response.ok && data.success !== false, `${route}: ${JSON.stringify(data)}`);
    return data;
  };
  for (let i = 0; i < 40; i++) {
    try { await request("/api/leadgen/campaigns"); break; } catch (error) { if (i === 39) throw error; await new Promise(r => setTimeout(r, 250)); }
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/check-new-lead-sources.mjs", baseUrl], { env: process.env, windowsHide: true });
    let output = "";
    child.stdout.on("data", chunk => output += chunk);
    child.stderr.on("data", chunk => output += chunk);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(output)));
  });
  console.log("PASS Import CSV/XLSX, confirm, duplicate import, source flags and shadow API");
  if (process.argv.includes("--ui")) {
    console.log(`UI_CHECK_URL=${baseUrl}/leadgen?campaign=${campaigns[0].id}`);
    await new Promise(resolve => process.stdin.once("data", resolve));
    const uiState = await request(`/api/leadgen/outreach?campaignId=${campaigns[0].id}`);
    assert.equal(uiState.entries.filter(e => e.status === "approved").length, 3, "UI single + approve-all must persist all three approvals");
    const { mutateLocalTable } = await import("../lib/leadgen/local-database.ts");
    await mutateLocalTable("leadgen_outreach_queue", rows => {
      for (const row of rows.filter(r => r.campaign_id === campaigns[0].id)) { row.status = "needs_review"; row.approved_at = null; }
    });
    console.log("PASS browser UI persisted single and approve-all");
  }
  for (const campaign of campaigns) {
    const route = `/api/leadgen/outreach?campaignId=${campaign.id}`;
    const before = await request(route);
    assert.equal(before.entries.filter(e => e.status === "needs_review").length, 3);
    const forged = await request("/api/leadgen/outreach/batch", { campaignId: campaign.id, count: 3,
      entries: before.entries.map(e => ({ ...e, status: "approved", quality_gate_passed: true })) });
    assert.equal(forged.queued_count, 0, "client cannot manufacture approval");
    const single = await request(`/api/leadgen/outreach/${before.entries[0].id}/approve`, {});
    assert.equal(single.entry.status, "approved");
    const preview = await request("/api/leadgen/outreach/bulk-approve", { campaignId: campaign.id, execute: false });
    assert.equal(preview.eligible_count, 2);
    const bulk = await request("/api/leadgen/outreach/bulk-approve", { campaignId: campaign.id, execute: true });
    assert.equal(bulk.approved, 2); assert.equal(bulk.approved_ids.length, 2);
    assert.equal((await request("/api/leadgen/outreach/bulk-approve", { campaignId: campaign.id, execute: true })).approved, 0);
    const approved = await request(route);
    assert.equal(approved.entries.filter(e => e.status === "approved").length, 3);
    const batchInput = { campaignId: campaign.id, entries: approved.entries, count: 3 };
    const queued = await request("/api/leadgen/outreach/batch", batchInput);
    assert.equal(queued.queued_count, 3);
    assert.equal((await request("/api/leadgen/outreach/batch", batchInput)).queued_count, 0);
    for (let i = 0; i < 60; i++) {
      const state = await request(route);
      if (state.entries.every(e => e.status === "sent")) break;
      if (i === 59) throw new Error(`Sender did not finish: ${JSON.stringify(state.entries.map(e => ({ id: e.id, status: e.status, error: e.last_error })))}`);
      await request(`/api/leadgen/outreach/batch?campaignId=${campaign.id}`);
      await new Promise(r => setTimeout(r, 300));
    }
    const sent = await request(route);
    assert.equal(sent.entries.filter(e => e.status === "sent" && e.sent_at && e.provider_message_id).length, 3);
    console.log(`PASS ${campaign.id}: research → Ready → single/bulk/approve-all → queue → simulated Sent`);
  }
  assert.equal(messages.length, 9);
  assert.equal(new Set(messages.map(m => m.match(/^Message-ID: (.+)$/mi)?.[1])).size, 9);
  const final = await request("/api/leadgen/outreach/batch");
  assert.equal(final.daily.sent_today, 9);
  assert.equal(final.daily.queued_total, 0);
  assert.equal((await fetch(`${baseUrl}/leadgen`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/leadgen/analytics`)).status, 200);
  await request("/api/leadgen/analytics");
  const { mutateLocalTable, readLocalTable } = await import("../lib/leadgen/local-database.ts");
  await mutateLocalTable("leadgen_outreach_queue", rows => {
    const parent = rows.find(r => r.campaign_id === campaigns[0].id && r.status === "sent");
    parent.sent_at = new Date(Date.now() - 72 * 3600_000).toISOString();
    parent.reply_check_status = "verified";
    parent.reply_checked_at = new Date().toISOString();
  });
  const generated = await request("/api/leadgen/followups/generate", { campaignId: campaigns[0].id });
  assert.equal(generated.generated, 1);
  assert.equal((await request("/api/leadgen/followups/generate", { campaignId: campaigns[0].id })).generated, 0);
  const follow = (await readLocalTable("leadgen_outreach_queue")).find(r => r.message_kind === "follow_up");
  assert.ok(follow.parent_smtp_message_id);
  const approvedFollow = await request(`/api/leadgen/followups/${follow.id}/approve`, {});
  assert.ok(approvedFollow.success);
  console.log("PASS follow-up eligibility, generation, parent thread, approval and idempotency");
  console.log(JSON.stringify({ single: "PASS", bulk: "PASS", approveAll: "PASS", queue: "PASS", simulatedSent: 9,
    duplicateQueue: 0, duplicateSend: 0, counters: "PASS", analytics: "PASS", productionSmtpCalls: 0 }));
} catch (error) {
  console.error(appOutput.slice(-3000));
  throw error;
} finally {
  globalThis.fetch = originalFetch; dns.resolveMx = originalMx; syncBuiltinESMExports();
  if (app && app.exitCode === null) { app.kill(); await new Promise(resolve => app.once("exit", resolve)); }
  for (const socket of sockets) socket.destroy();
  await new Promise(resolve => smtp.close(resolve));
  await rm(isolated, { recursive: true, force: true });
}
