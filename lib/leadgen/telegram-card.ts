import type { Lead } from "@/lib/leadgen/types";

export function formatTelegramCard(lead: Lead): string {
  const contact = lead.contact
    ? `${lead.contact.label}: ${lead.contact.value}`
    : "No verified contact found";

  return [
    `NEW LEAD: ${lead.company.name}`,
    "",
    `Segment: ${lead.company.segment}`,
    `Website: ${lead.company.domain}`,
    `Best available entry: ${contact}`,
    "",
    `Signal: ${lead.signal.title}`,
    `${lead.signal.detail}`,
    `Source: ${lead.signal.sourceLabel}`,
    "",
    `Hook: ${lead.hook}`,
    "",
    `Message: ${lead.message}`,
    "",
    `Follow-up: ${lead.followUp}`,
    "",
    `Status: ${lead.status}`,
  ].join("\n");
}
