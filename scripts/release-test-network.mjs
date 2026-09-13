// Preload only for isolated HTTP regression. No external service is reachable.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    ? originalFetch(input, init)
    : new Response("Isolated regression: external HTTP disabled", { status: 404 });
};
