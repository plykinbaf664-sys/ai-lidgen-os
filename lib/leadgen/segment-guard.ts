import { getVerticalProfile, type LeadgenVerticalId } from "@/lib/leadgen/verticals";
import { isDiscoveryV2Enabled } from "@/lib/leadgen/discovery-v2-config";

export type SegmentMatch = "MATCH" | "UNCERTAIN" | "MISMATCH";

export type SegmentVerification = {
  selectedSegment: LeadgenVerticalId;
  detectedSegment: LeadgenVerticalId | null;
  match: SegmentMatch;
  confidence: number;
  evidence: string[];
};

export type SegmentGuardInput = {
  selectedSegment: LeadgenVerticalId;
  companyName: string;
  companySegment?: string | null;
  industry?: string | null;
  officialWebsite?: string | null;
  signalSummary?: string | null;
  signalEvidence?: string | null;
  signalTitle?: string | null;
  discoveryQuery?: string | null;
};

const semanticAliases: Record<LeadgenVerticalId, string[]> = {
  real_estate: ["недвижим", "риелтор", "риэлтор", "девелоп", "жилой комплекс", "жк ", "брокер недвиж", "estate"],
  manufacturing: ["производ", "завод", "фабрик", "промышлен", "оборудован", "станк", "manufactur"],
  medicine: ["медицин", "клиник", "поликлиник", "пациент", "врач", "диагност", "здоров", "стоматолог"],
  dentistry: ["стоматолог", "дентал", "зуб", "ортодонт", "имплант"],
  legal: ["юрид", "адвокат", "правов", "legal", "арбитраж"],
  insurance: ["страхов", "страхован", "insurtech", "полис"],
  it: ["разработчик по", "it-компан", "ит-компан", "интегратор", "saas", "software", "цифровой продукт"],
  marketing_agencies: ["маркетинговое агент", "digital-агент", "рекламное агент", "performance", "медиабаинг"],
  logistics: ["логист", "перевоз", "транспортная компан", "3pl", "груз", "складской оператор"],
  education: ["образован", "онлайн-школ", "учебн", "университет", "институт", "курс", "абитуриент"],
  construction: ["строитель", "генподряд", "подрядчик", "инжиниринг", "стройматериал", "стройинтех"],
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsFor(verticalId: LeadgenVerticalId) {
  const profile = getVerticalProfile(verticalId);
  return [...profile.industries, ...profile.companyTypes, ...profile.vocabulary, ...semanticAliases[verticalId]]
    .map(normalize)
    .filter((value, index, values) => value.length >= 3 && values.indexOf(value) === index);
}

function scoreText(text: string, terms: string[], weight: number) {
  const matches = terms.filter((term) => text.includes(term));
  return {
    score: Math.min(weight * 3, matches.length * weight),
    matches: matches.slice(0, 3),
  };
}

export function verifyCompanySegment(input: SegmentGuardInput): SegmentVerification {
  const zones = [
    { label: "company segment", value: input.companySegment, weight: 4 },
    { label: "industry", value: input.industry, weight: 4 },
    { label: "company name", value: input.companyName, weight: 2 },
    { label: "signal", value: [input.signalTitle, input.signalSummary, input.signalEvidence].filter(Boolean).join(" "), weight: 2 },
    // A discovery query is weak evidence: it can be stale or overly broad.
    { label: "discovery query", value: input.discoveryQuery, weight: 0.25 },
  ];
  const scores = Object.fromEntries(
    (Object.keys(semanticAliases) as LeadgenVerticalId[]).map((verticalId) => {
      const terms = termsFor(verticalId);
      let score = 0;
      const evidence: string[] = [];
      for (const zone of zones) {
        const result = scoreText(normalize(zone.value), terms, zone.weight);
        score += result.score;
        if (result.matches.length) evidence.push(`${zone.label}: ${result.matches.join(", ")}`);
      }
      return [verticalId, { score, evidence }];
    }),
  ) as Record<LeadgenVerticalId, { score: number; evidence: string[] }>;

  // Dentistry is a valid medical business, while the inverse is intentionally strict.
  if (input.selectedSegment === "medicine") {
    scores.medicine.score += scores.dentistry.score * 0.8;
    scores.medicine.evidence.push(...scores.dentistry.evidence.map((item) => `medical subtype; ${item}`));
  }

  const ranked = (Object.entries(scores) as Array<[LeadgenVerticalId, { score: number; evidence: string[] }]>)
    .sort((left, right) => right[1].score - left[1].score);
  const selected = scores[input.selectedSegment];
  const strongest = ranked[0];
  const selectedIdentityTerms = termsFor(input.selectedSegment);
  const identityText = normalize([
    input.companyName,
    input.companySegment,
    input.industry,
  ].filter(Boolean).join(" "));
  const hasIdentitySegmentEvidence = selectedIdentityTerms.some((term) =>
    identityText.includes(term),
  );
  const selectedIsStrong = selected.score >= 2 &&
    (!isDiscoveryV2Enabled() || hasIdentitySegmentEvidence);
  const competitorIsStrong = strongest[0] !== input.selectedSegment && strongest[1].score >= 3;
  const mismatch = competitorIsStrong && strongest[1].score >= selected.score + 1.5;
  const match: SegmentMatch = mismatch ? "MISMATCH" : selectedIsStrong ? "MATCH" : "UNCERTAIN";
  const confidence = Math.max(0, Math.min(100, Math.round(
    match === "MATCH"
      ? 55 + selected.score * 8
      : match === "MISMATCH"
        ? 55 + (strongest[1].score - selected.score) * 8
        : 35 + selected.score * 8,
  )));
  const detectedSegment = strongest[1].score >= 2 ? strongest[0] : null;
  const evidence = (match === "MISMATCH" ? strongest[1].evidence : selected.evidence).slice(0, 5);
  if (input.officialWebsite) evidence.unshift(`official website: ${input.officialWebsite}`);

  return {
    selectedSegment: input.selectedSegment,
    detectedSegment,
    match,
    confidence,
    evidence: evidence.slice(0, 5),
  };
}
