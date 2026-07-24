export function selectCampaignLeadIds({
  emailReadyLeadIds,
  target,
}: {
  orderedLeadIds: string[];
  emailReadyLeadIds: string[];
  target: number;
}) {
  return new Set(emailReadyLeadIds.slice(0, Math.max(0, target)));
}
