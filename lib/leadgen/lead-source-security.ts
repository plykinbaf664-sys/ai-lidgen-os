import "server-only";

export function leadSourceContoursEnabled() {
  return process.env.LEADGEN_NEW_SOURCE_CONTOURS_ENABLED === "true";
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

