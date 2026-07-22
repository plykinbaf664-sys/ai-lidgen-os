export type CompanyIdentityInput = {
  company_name: string;
  company_domain?: string | null;
  website?: string | null;
  region?: string | null;
  legal_id?: string | null;
};

export type LeadCandidateIdentityInput = Pick<
  CompanyIdentityInput,
  "company_name" | "company_domain" | "region"
>;

export type CompanyIdentity = {
  identityKey: string;
  normalizedLegalId: string | null;
  normalizedDomain: string | null;
  normalizedWebsite: string | null;
  normalizedName: string;
  normalizedRegion: string | null;
};

const legalForms =
  /\b(?:ооо|ао|пао|зао|оао|ип|llc|ltd|inc|corp|corporation|company)\b/giu;

export function normalizeRecipientEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLegalId(value?: string | null): string | null {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length >= 8 ? normalized : null;
}

export function normalizeDomain(value?: string | null): string | null {
  const raw = value?.trim().toLowerCase();
  if (!raw) return null;

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`,
    );
    return url.hostname.replace(/^www\./, "").replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

export function normalizeWebsite(value?: string | null): string | null {
  const domain = normalizeDomain(value);
  return domain ? `https://${domain}` : null;
}

export function normalizeCompanyName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[«»„“”"'`]/g, " ")
    .replace(legalForms, " ")
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRegion(value?: string | null): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function getCompanyIdentity(
  company: CompanyIdentityInput,
): CompanyIdentity {
  const normalizedLegalId = normalizeLegalId(company.legal_id);
  const normalizedDomain = normalizeDomain(
    company.company_domain ?? company.website,
  );
  const normalizedWebsite = normalizeWebsite(company.website);
  const normalizedName = normalizeCompanyName(company.company_name);
  const normalizedRegion = normalizeRegion(company.region);

  const identityKey = normalizedLegalId
    ? `legal:${normalizedLegalId}`
    : normalizedDomain
      ? `domain:${normalizedDomain}`
      : normalizedWebsite
        ? `website:${normalizedWebsite}`
        : normalizedRegion && normalizedName
          ? `name-region:${normalizedName}:${normalizedRegion}`
          : `name:${normalizedName}`;

  return {
    identityKey,
    normalizedLegalId,
    normalizedDomain,
    normalizedWebsite,
    normalizedName,
    normalizedRegion,
  };
}

export function getLeadCandidateIdentity(
  candidate: LeadCandidateIdentityInput,
): CompanyIdentity {
  return getCompanyIdentity(candidate);
}

export function getDuplicateReason(
  identity: CompanyIdentity,
  existing: CompanyIdentity,
):
  | "duplicate_legal_id"
  | "duplicate_domain"
  | "duplicate_website"
  | "duplicate_name_region"
  | "already_discovered"
  | null {
  if (
    identity.normalizedLegalId &&
    identity.normalizedLegalId === existing.normalizedLegalId
  ) {
    return "duplicate_legal_id" as const;
  }
  if (
    identity.normalizedDomain &&
    identity.normalizedDomain === existing.normalizedDomain
  ) {
    return "duplicate_domain" as const;
  }
  if (
    identity.normalizedWebsite &&
    identity.normalizedWebsite === existing.normalizedWebsite
  ) {
    return "duplicate_website" as const;
  }
  if (
    identity.normalizedRegion &&
    identity.normalizedName === existing.normalizedName &&
    identity.normalizedRegion === existing.normalizedRegion
  ) {
    return "duplicate_name_region" as const;
  }
  return identity.identityKey === existing.identityKey
    ? "already_discovered"
    : null;
}
