// Preload only for isolated HTTP regression. No external service is reachable.
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";

dns.resolveMx = async domain => domain.endsWith(".release-fixture.ru")
  ? [{ exchange: "mx.fixture.invalid", priority: 10 }] : [];
syncBuiltinESMExports();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ? originalFetch(input, init)
    : new Response("Isolated regression: external HTTP disabled", { status: 404 });
};
