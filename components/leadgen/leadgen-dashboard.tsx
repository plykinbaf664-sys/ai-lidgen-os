"use client";

import { useMemo, useState } from "react";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import { LeadsTable } from "@/components/leadgen/leads-table";
import { TelegramCardPreview } from "@/components/leadgen/telegram-card-preview";
import { runMockPipeline } from "@/lib/leadgen/mock-pipeline";
import type { CampaignInput, Lead, LeadStatus } from "@/lib/leadgen/types";

export function LeadgenDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lastCampaign, setLastCampaign] = useState<CampaignInput | null>(null);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );

  function handleRun(campaign: CampaignInput) {
    const generatedLeads = runMockPipeline(campaign);
    setLeads(generatedLeads);
    setSelectedLeadId(generatedLeads[0]?.id ?? null);
    setLastCampaign(campaign);
  }

  function handleStatusChange(leadId: string, status: LeadStatus) {
    setLeads((currentLeads) =>
      currentLeads.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)),
    );
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
              {lastCampaign
                ? `${leads.length} leads · ${lastCampaign.name}`
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
