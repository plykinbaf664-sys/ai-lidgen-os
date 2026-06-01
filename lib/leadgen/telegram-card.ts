import type { LeadgenLead } from "@/lib/leadgen/types";

export function formatTelegramCard(lead: LeadgenLead): string {
  const contact = lead.contact_label
    ? `${lead.contact_label}: ${lead.contact_value}`
    : "No verified contact found";

  return [
    `NEW LEAD: ${lead.company_name}`,
    "",
    `Segment: ${lead.company_segment}`,
    `Website: ${lead.company_domain}`,
    `Best available entry: ${contact}`,
    "",
    `Signal: ${lead.signal_title}`,
    `${lead.signal_detail}`,
    `Source: ${lead.signal_source_label}`,
    "",
    `Hook: ${lead.hook}`,
    "",
    `Message: ${lead.message}`,
    "",
    `Follow-up: ${lead.follow_up}`,
    "",
    `Status: ${lead.status}`,
  ].join("\n");
}
