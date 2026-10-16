// Process-local cooldown for billing failures. In-flight calls still settle;
// subsequent stages must not repeatedly spend requests on an exhausted account.
import { aiProvider } from "@/lib/leadgen/ai-runtime";
const creditBlockedUntil = new Map<string, number>();
export function llmAvailabilityError(provider: string = aiProvider()): string | null {
  return Date.now() < (creditBlockedUntil.get(provider) ?? 0) ? "provider_credit_exhausted" : null;
}
export async function recordLlmFailure(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code;
  if (code === "local_budget_exceeded") return "provider_budget_exceeded";
  const type = body?.error?.type;
  if (code === "credit_balance_exhausted" || code === "insufficient_quota" || type === "insufficient_quota") {
    creditBlockedUntil.set(response.headers.get("x-leadgen-provider") ?? aiProvider(), Date.now() + 5 * 60_000);
    return "provider_credit_exhausted";
  }
  return `provider_http_${response.status}`;
}
