import { getCompanyIdentity } from "@/lib/leadgen/company-identity";
import { createSupabaseServerClient } from "@/lib/supabase/client";
import type { LeadgenCompany } from "@/lib/leadgen/types";

export type RegisteredCompanyIdentity = ReturnType<typeof getCompanyIdentity>;

export async function getRegisteredCompanyIdentities(): Promise<
  RegisteredCompanyIdentity[]
> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leadgen_discovered_companies")
    .select(
      "normalized_domain,normalized_website,normalized_name,region,legal_id,legal_name",
    );

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new Error(
        "Global company registry is not installed. Apply supabase/production_outreach_launch.sql.",
      );
    }
    throw error;
  }

  return (data ?? []).map((row) =>
    getCompanyIdentity({
      company_name: row.legal_name || row.normalized_name,
      company_domain: row.normalized_domain,
      website: row.normalized_website,
      region: row.region,
      legal_id: row.legal_id,
    }),
  );
}

export async function registerDiscoveredCompanies(
  companies: LeadgenCompany[],
): Promise<void> {
  if (companies.length === 0) return;
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();

  for (const company of companies) {
    const identity = getCompanyIdentity({
      company_name: company.company_name,
      company_domain: company.company_domain,
      website:
        typeof company.metadata.official_website === "string"
          ? company.metadata.official_website
          : company.source_url,
      region: company.country,
      legal_id:
        typeof company.metadata.legal_id === "string"
          ? company.metadata.legal_id
          : null,
    });
    const { data: existing, error: readError } = await supabase
      .from("leadgen_discovered_companies")
      .select("id,times_seen,first_campaign_id")
      .eq("identity_key", identity.identityKey)
      .maybeSingle();
    if (readError) throw readError;

    const payload = {
      identity_key: identity.identityKey,
      canonical_company_id: company.id,
      normalized_domain: identity.normalizedDomain,
      normalized_website: identity.normalizedWebsite,
      normalized_name: identity.normalizedName,
      legal_name: company.company_name,
      region: identity.normalizedRegion,
      legal_id: identity.normalizedLegalId,
      first_campaign_id: existing?.first_campaign_id ?? company.campaign_id,
      last_campaign_id: company.campaign_id,
      first_seen_at: existing ? undefined : now,
      last_seen_at: now,
      times_seen: (existing?.times_seen ?? 0) + 1,
      contact_status: null,
      outreach_status: null,
      updated_at: now,
    };
    const { error } = await supabase
      .from("leadgen_discovered_companies")
      .upsert(payload, { onConflict: "identity_key" });
    if (error) throw error;
  }
}

export async function touchDiscoveredCompanies(
  identityKeys: string[],
  campaignId: string,
): Promise<void> {
  if (identityKeys.length === 0) return;
  const supabase = createSupabaseServerClient();
  const now = new Date().toISOString();
  for (const identityKey of new Set(identityKeys)) {
    const { data, error } = await supabase
      .from("leadgen_discovered_companies")
      .select("times_seen")
      .eq("identity_key", identityKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) continue;
    const update = await supabase
      .from("leadgen_discovered_companies")
      .update({
        last_seen_at: now,
        last_campaign_id: campaignId,
        times_seen: data.times_seen + 1,
        updated_at: now,
      })
      .eq("identity_key", identityKey);
    if (update.error) throw update.error;
  }
}
