export function isDiscoveryV2Enabled(): boolean {
  return process.env.LEADGEN_DISCOVERY_V2_ENABLED?.trim().toLowerCase() !== "false";
}

export function normalizeDiscoverySourceKey(source: string): string {
  return source.trim().toLowerCase().replace(/^public-web:/, "");
}
