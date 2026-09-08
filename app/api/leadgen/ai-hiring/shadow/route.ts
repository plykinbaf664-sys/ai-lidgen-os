import { NextResponse } from "next/server";
import {
  evaluateAiAutomationHiring,
  type AiHiringVacancy,
} from "@/lib/leadgen/ai-hiring-intent";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { isAuthorizedLeadSourceRequest } from "@/lib/leadgen/lead-source-security";
import {
  deduplicateUnifiedSourceCandidates,
  type UnifiedSourceCandidate,
} from "@/lib/leadgen/unified-source-dedup";

const MAX_SHADOW_JOBS = 100;

export async function POST(request: Request) {
  if (!isAuthorizedLeadSourceRequest(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      vacancies?: AiHiringVacancy[];
      dedupCandidates?: UnifiedSourceCandidate[];
    };
    if (!Array.isArray(body.vacancies)) {
      return NextResponse.json({ success: false, error: "vacancies обязателен." }, { status: 400 });
    }
    const vacancies = body.vacancies.slice(0, MAX_SHADOW_JOBS);
    const results = vacancies.map(evaluateAiAutomationHiring);
    const accepted = results.filter((result) => result.status === "SUCCESS");
    const deduplicated = Array.isArray(body.dedupCandidates)
      ? deduplicateUnifiedSourceCandidates(body.dedupCandidates.slice(0, 100))
      : [];
    return NextResponse.json({
      success: true,
      mutated: false,
      metrics: {
        jobsScanned: vacancies.length,
        aiRoleCandidates: results.filter((result) => result.roleMatched).length,
        automationIntentPass: accepted.length,
        companiesExtracted: new Set(
          accepted.map((result) => result.company?.domain ?? result.company?.name),
        ).size,
        qualified: 0,
        ready: 0,
        falsePositives: 0,
      },
      results,
      dedup: {
        input: body.dedupCandidates?.slice(0, 100).length ?? 0,
        output: deduplicated.length,
        candidates: deduplicated,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: formatUnknownError(error) },
      { status: 400 },
    );
  }
}
