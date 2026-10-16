// Keep reproducible public evidence and outcomes, not repeated internal graphs.
export function formatLiveReport(report) {
  return JSON.stringify(report, (key, value) => {
    if (key === "metadata" && value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).filter(([field]) =>
        field === "company_research" || field === "outreach_selected" || field === "normalized_email_classification" ||
        /^email_(?:subject|body|generation_source|generation_fallback_reason|quality_gate_passed|status|mx_verified|domain_match_reason)$/.test(field)));
    }
    if (key === "queueBefore") return value.map(item => ({ id: item.id, company_name: item.company_name,
      recipient_email: item.recipient_email, status: item.status, quality_gate_passed: item.quality_gate_passed }));
    return value;
  }, 2);
}
