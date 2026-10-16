import { transliterate } from "@/lib/leadgen/person-email-evidence";
import { isSyntacticallyUsableEmail } from "@/lib/leadgen/contact-quality";
import { researchHost, type ResearchDocument } from "@/lib/leadgen/research-evidence";
import type { PersonCandidate } from "@/lib/leadgen/types";

export type EmailResearchStatus = "VERIFIED" | "HIGH_CONFIDENCE" | "PREDICTED" | "REJECTED";
export type PersonalEmailCandidate = {
  email: string; personName: string; status: EmailResearchStatus;
  pattern: string; patternSupport: number; mx: "present" | "missing" | "unavailable";
  catchAll: "unknown"; sourceUrls: string[]; reason: string;
};
type NameParts = { given: string; family: string };
const patterns = ["{given}.{family}", "{g}.{family}", "{family}", "{g}{family}", "{family}.{given}"];

function parts(person: PersonCandidate): NameParts | null {
  const value = person.metadata.name_parts as NameParts | undefined;
  if (!value?.given || !value.family || person.metadata.current_role_confirmed !== true) return null;
  // AI resolves name order; code requires both original parts in the cited name.
  const tokens = person.full_name.toLowerCase().replaceAll("ё", "е").split(/\s+/);
  return [value.given, value.family].every(part => tokens.includes(part.toLowerCase().replaceAll("ё", "е"))) ? value : null;
}
function local(pattern: string, name: NameParts, alternate = false) {
  const convert = (part: string) => transliterate(alternate ? part.toLowerCase().replaceAll("й", "y").replaceAll("х", "h") : part);
  const given = convert(name.given), family = convert(name.family);
  return pattern.replaceAll("{given}", given).replaceAll("{family}", family).replaceAll("{g}", given[0] ?? "");
}

/** At most five hypotheses for the most relevant confirmed person. No mailbox probing. */
export function buildPersonalEmailCandidates(person: PersonCandidate, domain: string, peers: PersonCandidate[]): PersonalEmailCandidate[] {
  const name = parts(person);
  if (!name || person.work_email || person.metadata.company_verified !== true || !domain) return [];
  const supports = new Map<string, Set<string>>();
  for (const peer of peers) {
    const peerParts = parts(peer);
    if (!peerParts || peer.metadata.public_contact_verified !== true || !peer.work_email?.endsWith(`@${domain}`)) continue;
    for (const pattern of patterns) if (`${local(pattern, peerParts)}@${domain}` === peer.work_email.toLowerCase()) {
      const names = supports.get(pattern) ?? new Set<string>();
      names.add(peer.full_name.toLowerCase().split(/\s+/).sort().join(" "));
      supports.set(pattern, names);
    }
  }
  const ranked = [...patterns].sort((a, b) => (supports.get(b)?.size ?? 0) - (supports.get(a)?.size ?? 0));
  const values = ranked.slice(0, 4).map(pattern => ({ pattern, value: local(pattern, name) }));
  values.push({ pattern: ranked[0], value: local(ranked[0], name, true) });
  values.push({ pattern: ranked[4], value: local(ranked[4], name) });
  return [...new Map(values.map(({ pattern, value }) => [`${value}@${domain}`, { pattern, value }])).values()]
    .filter(({ value }) => isSyntacticallyUsableEmail(`${value}@${domain}`) &&
      !peers.some(peer => peer.metadata.public_contact_verified === true && peer.work_email?.toLowerCase() === `${value}@${domain}`)).slice(0, 5)
    .map(({ pattern, value }) => ({ email: `${value}@${domain}`, personName: person.full_name, status: "PREDICTED",
      pattern, patternSupport: supports.get(pattern)?.size ?? 0, mx: "unavailable", catchAll: "unknown",
      sourceUrls: [], reason: "Name/domain hypothesis; mailbox existence and ownership unproven" }));
}

export function assessPersonalEmailCandidate(candidate: PersonalEmailCandidate, documents: ResearchDocument[],
  mx: PersonalEmailCandidate["mx"]): PersonalEmailCandidate {
  const domain = candidate.email.split("@")[1];
  const escaped = candidate.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`(?<![a-z0-9._%+\\-])${escaped}(?![a-z0-9.\\-])`, "i");
  const sources = documents.filter(doc => doc.kind === "page" && researchHost(doc.url) === domain && exact.test(doc.text));
  // Catch-all remains UNKNOWN without a supported verifier. MX/pattern alone never upgrades a hypothesis.
  const status = mx === "missing" ? "REJECTED" : mx === "present" && sources.length > 0 && candidate.patternSupport >= 2
    ? "HIGH_CONFIDENCE" : "PREDICTED";
  return { ...candidate, mx, status, sourceUrls: sources.map(doc => doc.url), reason: status === "REJECTED"
    ? "Domain has no usable MX" : status === "HIGH_CONFIDENCE"
      ? "Exact address published on official site; pattern independently linked to two named employees; MX present; target ownership inferred"
      : "No direct person/email proof; MX or an observed pattern alone cannot establish ownership" };
}
