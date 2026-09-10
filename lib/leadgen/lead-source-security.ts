import "server-only";

import type { LeadOrigin } from "@/lib/leadgen/types";

export function leadSourceContoursEnabled() {
  return leadSourceOriginEnabled("AI_HIRING") && leadSourceOriginEnabled("IMPORTED");
}

export function leadSourceOriginEnabled(origin: Extract<LeadOrigin, "AI_HIRING" | "IMPORTED">) {
  const legacy = process.env.LEADGEN_NEW_SOURCE_CONTOURS_ENABLED?.trim().toLowerCase();
  const dedicated = process.env[
    origin === "AI_HIRING" ? "LEADGEN_AI_HIRING_ENABLED" : "LEADGEN_IMPORT_ENABLED"
  ]?.trim().toLowerCase();

  // New source contours are production-safe by default: they only prepare
  // outreach for review and still use the existing approval/queue path.
  // Either dedicated flag, or the legacy shared flag, remains a kill switch.
  if (dedicated === "false" || legacy === "false") return false;
  return dedicated === "true" || legacy === "true" || dedicated === undefined;
}

export function isAuthorizedLeadSourceRequest(request: Request) {
  const secret = process.env.LEADGEN_ADMIN_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  if (secret) return authorization === `Bearer ${secret}`;

  const host = request.headers.get("host") ?? "";
  const origin = request.headers.get("origin") ?? "";
  const fetchSite = request.headers.get("sec-fetch-site");
  const isLoopback = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(host);
  return isLoopback && fetchSite === "same-origin" && origin.includes(host);
}
