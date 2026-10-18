import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Isolated headless Chrome: no user profile, credentials, extensions or production data.
// Used when the interactive browser tool is unavailable. No added dependencies.
export async function checkBulkBrowser(baseUrl, campaignId) {
  assert.equal(new URL(baseUrl).hostname, "127.0.0.1");
  const profile = await mkdtemp(path.join(tmpdir(), "leadgen-browser-"));
  const child = spawn(process.env.LEADGEN_TEST_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "about:blank",
  ], { windowsHide: true });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.stderr.on("data", chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      const entry = pending.get(data.id);
      if (entry) {
        clearTimeout(entry.timer); pending.delete(data.id);
        if (data.error) entry.reject(new Error(data.error.message));
        else entry.resolve(data.result);
      }
    };
    const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await call("Target.createTarget", { url: `${baseUrl}/leadgen?campaign=${encodeURIComponent(campaignId)}` });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result?.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error(`UI condition failed: ${expression}\n${await evaluate('document.body.innerText.slice(-3500)')}`);
    };
    const button = label => `[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}))`;
    // Server fixture has one approved item; default slider size is still five.
    await waitFor(`${button("Запустить первичные · 1")} && !${button("Запустить первичные · 1")}.disabled`);
    await waitFor(`${button("Одобрить все корректные")} && !${button("Одобрить все корректные")}.disabled`);
    await evaluate(`${button("Одобрить все корректные")}.click()`);
    await waitFor(`document.querySelector('dialog[open]')?.matches(':modal')`);
    await waitFor(`${button("Одобрить 2")} && !${button("Одобрить 2")}.disabled`);
    await evaluate(`${button("Одобрить 2")}.click()`);
    await waitFor(`!document.querySelector('dialog[open]') && ${button("Запустить первичные · 3")} && !${button("Запустить первичные · 3")}.disabled`);
    await evaluate(`${button("Запустить первичные · 3")}.click()`);
    await waitFor(`document.body.innerText.includes('Поставлено в очередь: 3')`);
    console.log("PASS browser: one-item batch enabled → visible modal → approve two → queue three");
    await call("Browser.close").catch(() => undefined);
  } finally {
    socket?.close();
    child.kill();
    // The path was created by mkdtemp in our own test namespace.
    assert.ok(path.resolve(profile).startsWith(path.join(tmpdir(), "leadgen-browser-")));
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}
