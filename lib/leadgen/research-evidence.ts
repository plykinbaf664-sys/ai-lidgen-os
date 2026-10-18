import { isIP } from "node:net";
import { runAbortableOperation } from "@/lib/network/abortable-operation";
import { cachedResearch } from "@/lib/leadgen/research-cache";

export type ResearchDocument = { id: string; url: string; kind: "page" | "search"; text: string;
  links: { url: string; label: string }[]; fetchedAt: string };
export type ResearchTraceEvent = { stage: string; [key: string]: unknown };
export const researchText = (value: string) => value.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function researchUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      isIP(url.hostname.replace(/^\[|\]$/g, "")) || !url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/i.test(url.hostname)) return null;
    url.hash = "";
    // Tracking parameters are not document identity. Search citations often add
    // them while the next semantic action uses the publisher's clean URL.
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}
export function researchHost(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

// A corporate cross-link must target the site's root, not a hosted company
// profile on a shared social/registry platform. Require the reciprocal link
// and the actual company name on a fetched target page as independent evidence.
export function linkedCompanyDomains(documents: ResearchDocument[], knownDomains: string[], company: string): string[] {
  const domains = new Set(knownDomains);
  const rootLink = (url: string, host: string) => {
    try { return researchHost(url) === host && new URL(url).pathname === "/"; } catch { return false; }
  };
  const name = researchText(company);
  if (name.length < 4) return [...domains];
  for (const target of documents.filter(doc => doc.kind === "page")) {
    const host = researchHost(target.url);
    if (!host || domains.has(host) || !researchText(target.text).includes(name)) continue;
    const origin = documents.find(doc => doc.kind === "page" && knownDomains.includes(researchHost(doc.url)) &&
      doc.links.some(link => rootLink(link.url, host)) &&
      target.links.some(link => rootLink(link.url, researchHost(doc.url))));
    if (origin) domains.add(host);
  }
  return [...domains];
}
function decode(text: string) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, value: string) => {
    const code = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'");
}
export function extractResearchPage(html: string, url: string): Pick<ResearchDocument, "text" | "links"> {
  const bounded = html.slice(0, 650_000).replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const clean = (text: string) => decode(text
    .replace(/<a\b[^>]*href=["']mailto:([^"'?]+)(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, email: string, label: string) => `${label} ${label.includes(email) ? "" : email}`)
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const links = [...bounded.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    try { const target = researchUrl(new URL(decode(match[1]), url).href); return target ? [{ url: target, label: clean(match[2]).slice(0, 100) }] : []; } catch { return []; }
  }).filter((link, index, all) => all.findIndex(other => other.url === link.url) === index);
  const body = bounded.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] ?? bounded;
  const core = clean(body.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " "));
  const footer = [...bounded.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].map(match => clean(match[1])).join(" ");
  const text = `${core.slice(0, 38_000)} ${footer.slice(0, 2000)}`.trim();
  // Preserve navigation diversity: a large product menu must not crowd out the
  // rest of the site. This is structural sampling, not a semantic role whitelist.
  const groups = new Map<string, number>();
  const diverse = links.filter(link => {
    const target = new URL(link.url);
    const group = `${target.hostname}/${target.pathname.split("/").filter(Boolean)[0] ?? ""}`;
    const count = groups.get(group) ?? 0;
    groups.set(group, count + 1);
    return count < 3;
  });
  // Reserve navigation diversity first, then use remaining slots for deeper
  // links. A news/team index must not lose every article/person after its third.
  const prioritized = new Set(diverse.map(link => link.url));
  return { text: text.slice(0, 40_000), links: [...diverse, ...links.filter(link => !prioritized.has(link.url))].slice(0, 100) };
}

// Windows are verbatim; their boundaries are explicit. A citation cannot bridge them.
export function compactResearchDocument(doc: ResearchDocument, people: string[] = [], focus?: string, maxCharacters = 6500) {
  if (doc.text.length <= maxCharacters) return { ...doc, links: doc.links.slice(0, 60) };
  const ranges: [number, number][] = [];
  const needles = [...(focus ? [focus] : []), ...people];
  for (const needle of needles) {
    const position = doc.text.toLowerCase().indexOf(needle.toLowerCase());
    if (position >= 0) ranges.push([Math.max(0, position - 300), Math.min(doc.text.length, position + 1600)]);
  }
  // Focused facts have priority over navigation and unrelated contact blocks.
  ranges.push([0, 1100]);
  const emails = new Set<string>();
  for (const match of doc.text.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)) {
    if (emails.has(match[0].toLowerCase())) continue;
    emails.add(match[0].toLowerCase());
    ranges.push([Math.max(0, match.index! - 330), Math.min(doc.text.length, match.index! + 150)]);
    if (emails.size >= 14) break;
  }
  if (ranges.length === 1) ranges.push([1100, 6100]);
  const merged: [number,number][] = [];
  for (const range of ranges) {
    const previous = merged.find(([start, end]) => range[0] <= end && range[1] >= start);
    if (previous) { previous[0] = Math.min(previous[0], range[0]); previous[1] = Math.max(previous[1], range[1]); }
    else merged.push([...range]);
  }
  return { ...doc, text: merged.map(([start,end]) => doc.text.slice(start,end)).join("\n[excerpt boundary]\n").slice(0, maxCharacters), links: doc.links.slice(0, 60) };
}
export async function readResearchPage(url: string, signal?: AbortSignal): Promise<Omit<ResearchDocument, "id"> | null> {
  const safe = researchUrl(url);
  if (!safe) return null;
  return cachedResearch("page", `v2:${safe}`, 12*60*60_000, requestSignal => readResearchPageUncached(safe, requestSignal), signal, page => page !== null);
}
async function readResearchPageUncached(safe: string, signal?: AbortSignal): Promise<Omit<ResearchDocument, "id"> | null> {
  return runAbortableOperation({ timeoutMs: 6500, parentSignal: signal, fallback: null,
    operation: async requestSignal => {
      let target = safe;
      for (let redirect = 0; redirect < 4; redirect++) {
        const response = await fetch(target, { signal: requestSignal, redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadgenOS public research)", accept: "text/html" } });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          const next = location ? new URL(location, target).href : null;
          if (!next || !researchUrl(next)) return null;
          // Canonical keys omit trailing slashes; HTTP redirect targets must not.
          target = next; continue;
        }
        if (!response.ok || !/(?:text\/|html)/i.test(response.headers.get("content-type") ?? "text/html")) return null;
        const page = extractResearchPage(await response.text(), target);
        const document = { url: target, kind: "page" as const, ...page, fetchedAt: new Date().toISOString() };
        return document;
      }
      return null;
    } });
}
