import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/client";
import {
  NO_VERIFIED_COMMERCIAL_SIGNAL,
  validateCommercialSignalCandidate,
} from "@/lib/leadgen/signals/commercial-signal-validator";
import type {
  CommercialSignal,
  LeadgenCompany,
  LeadgenLead,
  LeadgenSignal,
} from "@/lib/leadgen/types";

export type CommercialSignalRevalidationItem = {
  company_id: string;
  company_name: string;
  signal_type: CommercialSignal["type"] | "none";
  valid: boolean;
  source_url: string | null;
  confidence: number;
};

export type CommercialSignalRevalidationResult = {
  execute: boolean;
  checked: number;
  valid: number;
  cleared: number;
  items: CommercialSignalRevalidationItem[];
};

function getBestVerifiedSignal(
  signals: LeadgenSignal[],
): CommercialSignal | null {
  const verified = signals
    .map((signal) =>
      validateCommercialSignalCandidate({
        text: signal.signal_detail,
        sourceUrl: signal.source_url,
        sourceTitle: signal.signal_source_label,
        confidence: signal.confidence_score,
        detectedAt: signal.found_at,
        pipelineSignalType: signal.signal_type,
      }),
    )
    .filter((signal): signal is CommercialSignal => signal !== null)
    .sort((left, right) => right.confidence - left.confidence);

  return verified[0] ?? null;
}

export async function revalidateRecentCommercialSignals({
  limit = 100,
  execute = false,
}: {
  limit?: number;
  execute?: boolean;
} = {}): Promise<CommercialSignalRevalidationResult> {
  const supabase = createSupabaseServerClient();
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 250));
  const { data: companies, error: companiesError } = await supabase
    .from("leadgen_companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(safeLimit)
    .returns<LeadgenCompany[]>();

  if (companiesError) {
    throw companiesError;
  }

  const companyIds = (companies ?? []).map((company) => company.id);

  if (companyIds.length === 0) {
    return { execute, checked: 0, valid: 0, cleared: 0, items: [] };
  }

  const [
    { data: signals, error: signalsError },
    { data: leads, error: leadsError },
  ] = await Promise.all([
    supabase
      .from("leadgen_signals")
      .select("*")
      .in("company_id", companyIds)
      .returns<LeadgenSignal[]>(),
    supabase
      .from("leadgen_leads")
      .select("*")
      .in("company_id", companyIds)
      .returns<LeadgenLead[]>(),
  ]);

  if (signalsError) throw signalsError;
  if (leadsError) throw leadsError;

  const signalsByCompany = new Map<string, LeadgenSignal[]>();
  for (const signal of signals ?? []) {
    if (!signal.company_id) continue;
    const current = signalsByCompany.get(signal.company_id) ?? [];
    current.push(signal);
    signalsByCompany.set(signal.company_id, current);
  }

  const leadsByCompany = new Map(
    (leads ?? [])
      .filter((lead) => lead.company_id)
      .map((lead) => [lead.company_id as string, lead]),
  );
  const items: CommercialSignalRevalidationItem[] = [];

  for (const company of companies ?? []) {
    const commercialSignal = getBestVerifiedSignal(
      signalsByCompany.get(company.id) ?? [],
    );
    const item: CommercialSignalRevalidationItem = {
      company_id: company.id,
      company_name: company.company_name,
      signal_type: commercialSignal?.type ?? "none",
      valid: commercialSignal !== null,
      source_url: commercialSignal?.sourceUrl ?? null,
      confidence: commercialSignal?.confidence ?? 0,
    };
    items.push(item);

    if (!execute) continue;

    const revalidation = {
      checked_at: new Date().toISOString(),
      result: commercialSignal ? "verified" : "cleared",
      signal_type: commercialSignal?.type ?? "none",
      signal_confidence: commercialSignal?.confidence ?? 0,
    };
    const { error: companyUpdateError } = await supabase
      .from("leadgen_companies")
      .update({
        metadata: {
          ...(company.metadata ?? {}),
          commercial_signal: commercialSignal,
          commercial_signal_type: commercialSignal?.type ?? "none",
          signal_confidence: commercialSignal?.confidence ?? 0,
          commercial_signal_revalidation: revalidation,
        },
        updated_at: revalidation.checked_at,
      })
      .eq("id", company.id);

    if (companyUpdateError) throw companyUpdateError;

    const lead = leadsByCompany.get(company.id);
    if (!lead) continue;

    const { error: leadUpdateError } = await supabase
      .from("leadgen_leads")
      .update({
        signal_title:
          commercialSignal?.summary ?? NO_VERIFIED_COMMERCIAL_SIGNAL,
        signal_detail: commercialSignal?.evidence ?? "",
        signal_source_label: commercialSignal?.sourceTitle ?? "",
        updated_at: revalidation.checked_at,
      })
      .eq("id", lead.id);

    if (leadUpdateError) throw leadUpdateError;
  }

  return {
    execute,
    checked: items.length,
    valid: items.filter((item) => item.valid).length,
    cleared: items.filter((item) => !item.valid).length,
    items,
  };
}
