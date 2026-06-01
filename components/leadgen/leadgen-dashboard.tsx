"use client";

import { useMemo, useState } from "react";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import { LeadsTable } from "@/components/leadgen/leads-table";
import { TelegramCardPreview } from "@/components/leadgen/telegram-card-preview";
import { runMockPipeline } from "@/lib/leadgen/mock-pipeline";
import type {
  CampaignInput,
  LeadgenCampaign,
  LeadgenEvent,
  LeadgenLead,
  LeadStatus,
} from "@/lib/leadgen/types";

export function LeadgenDashboard() {
  const [campaign, setCampaign] = useState<LeadgenCampaign | null>(null);
  const [leads, setLeads] = useState<LeadgenLead[]>([]);
  const [events, setEvents] = useState<LeadgenEvent[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  function handleRun(campaign: CampaignInput) {
    const result = runMockPipeline(campaign);
    setCampaign(result.campaign);
    setLeads(result.leads);
    setEvents(result.events);
    setSelectedLeadId(result.leads[0]?.id ?? null);
  }

  function handleStatusChange(leadId: string, status: LeadStatus) {
    const createdAt = new Date().toISOString();

    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId ? { ...lead, status, updated_at: createdAt } : lead,
      ),
    );

    if (!campaign) {
      return;
    }

    setEvents((currentEvents) => [
      ...currentEvents,
      {
        id: `event-${campaign.id}-${leadId}-lead-status-changed-${createdAt}`,
        campaign_id: campaign.id,
        lead_id: leadId,
        event_type: "lead_status_changed",
        payload: { status },
        created_at: createdAt,
      },
    ]);
  }

  return (
    <>
      <section className="panel campaign-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Campaign control</p>
            <h2>Generate a mock lead batch</h2>
            <p className="muted">
              This local-only flow creates three fictional leads. No external
              services are called.
            </p>
          </div>
        </div>
        <CampaignForm onRun={handleRun} />
      </section>

      <div className="workspace-grid">
        <section className="panel table-panel">
          <div className="table-toolbar">
            <div>
              <p className="eyebrow">Pipeline output</p>
              <h2>Lead queue</h2>
            </div>
            <span className="table-meta">
              {campaign
                ? `${leads.length} leads · ${campaign.name} · ${events.length} events`
                : "Waiting for a campaign"}
            </span>
          </div>
          <LeadsTable
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelectLead={setSelectedLeadId}
          />
        </section>

        <TelegramCardPreview
          lead={selectedLead}
          onStatusChange={handleStatusChange}
        />
      </div>
    </>
  );
}
