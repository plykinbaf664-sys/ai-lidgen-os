import { mapSignalFirstResultToLeadReadyCandidates } from "@/lib/leadgen/lead-ready-candidate-mapper";
import type {
  LeadDiscoveryResult,
  LeadReadyCandidate,
  ProviderDiagnostic,
} from "@/lib/leadgen/types";

export type SignalFirstDiscoveryTrackResult = {
  candidates: LeadReadyCandidate[];
  diagnostics: ProviderDiagnostic[];
  providers_used: string[];
};

export function runSignalFirstDiscoveryTrack(
  result: LeadDiscoveryResult,
): SignalFirstDiscoveryTrackResult {
  const candidates = mapSignalFirstResultToLeadReadyCandidates(result);

  return {
    candidates,
    diagnostics: candidates.flatMap((candidate) => candidate.diagnostics),
    providers_used: ["Yandex", "RU public web"],
  };
}
