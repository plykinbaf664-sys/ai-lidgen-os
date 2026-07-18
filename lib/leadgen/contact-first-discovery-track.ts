import type { LeadReadyCandidate, ProviderDiagnostic } from "@/lib/leadgen/types";

export type ContactFirstDiscoveryTrackResult = {
  candidates: LeadReadyCandidate[];
  diagnostics: ProviderDiagnostic[];
  providers_used: string[];
};

export async function runContactFirstDiscoveryTrack(): Promise<ContactFirstDiscoveryTrackResult> {
  return {
    candidates: [],
    diagnostics: [
      {
        provider_id: "ru_public_contact_first",
        provider_label: "RU public contact-first",
        level: "info",
        message:
          "External contact-first providers are disabled; RU signal-first public discovery is the active source.",
      },
    ],
    providers_used: ["ru_public"],
  };
}
