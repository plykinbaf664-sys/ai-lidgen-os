"use client";

import { useEffect, useMemo, useState } from "react";
import { CampaignHistory } from "@/components/leadgen/campaign-history";
import { CampaignDetails } from "@/components/leadgen/campaign-details";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import { LeadsTable } from "@/components/leadgen/leads-table";
import { TelegramCardPreview } from "@/components/leadgen/telegram-card-preview";
import { TelegramNotifications } from "@/components/leadgen/telegram-notifications";
import type {
  CampaignInput,
  DecisionMakerProfile,
  LeadgenCampaignDetails,
  LeadgenCampaignSummary,
  LeadgenCampaign,
  LeadgenCompany,
  LeadgenContact,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
  LeadStatus,
  PeopleDiscoveryResult,
  TelegramNotification,
} from "@/lib/leadgen/types";

type RunLeadgenResponse =
  | {
      success: true;
      campaign: LeadgenCampaign;
      companies: LeadgenCompany[];
      contacts: LeadgenContact[];
      leads: LeadgenLead[];
      signals: LeadgenSignal[];
      events: LeadgenEvent[];
      notifications: TelegramNotification[];
    }
  | {
      success: false;
      error?: string;
    };

type CampaignsResponse =
  | {
      success: true;
      campaigns: LeadgenCampaignSummary[];
    }
  | {
      success: false;
      error?: string;
    };

type CampaignDetailsResponse =
  | {
      success: true;
      details: LeadgenCampaignDetails;
    }
  | {
      success: false;
      error?: string;
    };

export function LeadgenDashboard() {
  const [campaign, setCampaign] = useState<LeadgenCampaign | null>(null);
  const [leads, setLeads] = useState<LeadgenLead[]>([]);
  const [companies, setCompanies] = useState<LeadgenCompany[]>([]);
  const [contacts, setContacts] = useState<LeadgenContact[]>([]);
  const [events, setEvents] = useState<LeadgenEvent[]>([]);
  const [notifications, setNotifications] = useState<TelegramNotification[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [campaignHistory, setCampaignHistory] = useState<
    LeadgenCampaignSummary[]
  >([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyErrorMessage, setHistoryErrorMessage] = useState<string | null>(
    null,
  );
  const [selectedCampaignDetails, setSelectedCampaignDetails] =
    useState<LeadgenCampaignDetails | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null,
  );
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsErrorMessage, setDetailsErrorMessage] = useState<string | null>(
    null,
  );

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  );
  const selectedCompany = useMemo(
    () =>
      selectedLead?.company_id
        ? companies.find((company) => company.id === selectedLead.company_id) ??
          null
        : null,
    [companies, selectedLead],
  );
  const selectedBestContact = useMemo(() => {
    if (!selectedLead) {
      return null;
    }

    const leadContacts = contacts.filter(
      (contact) => contact.lead_id === selectedLead.id,
    );

    return (
      leadContacts.find((contact) => contact.is_primary) ??
      leadContacts[0] ??
      null
    );
  }, [contacts, selectedLead]);
  const selectedBestOutreachEntry = useMemo(() => {
    if (!selectedLead) {
      return null;
    }

    const leadContacts = contacts.filter(
      (contact) => contact.lead_id === selectedLead.id,
    );

    return (
      leadContacts.find(
        (contact) => contact.metadata.entry_role === "best_outreach_entry",
      ) ??
      leadContacts.find(
        (contact) =>
          contact.contact_type !== "company_website" &&
          contact.contact_type !== "no_contact_found" &&
          contact.is_primary,
      ) ??
      leadContacts.find(
        (contact) =>
          contact.contact_type !== "company_website" &&
          contact.contact_type !== "no_contact_found",
      ) ??
      null
    );
  }, [contacts, selectedLead]);
  const selectedFallbackEntry = useMemo(() => {
    if (!selectedLead) {
      return null;
    }

    const leadContacts = contacts.filter(
      (contact) => contact.lead_id === selectedLead.id,
    );

    return (
      leadContacts.find(
        (contact) => contact.metadata.entry_role === "fallback_entry",
      ) ??
      leadContacts.find((contact) => contact.contact_type === "company_website") ??
      null
    );
  }, [contacts, selectedLead]);
  const selectedDecisionMaker = useMemo(() => {
    const rawDecisionMaker = selectedCompany?.metadata.decision_maker;

    if (
      typeof rawDecisionMaker !== "object" ||
      rawDecisionMaker === null ||
      Array.isArray(rawDecisionMaker)
    ) {
      return null;
    }

    return rawDecisionMaker as DecisionMakerProfile;
  }, [selectedCompany]);
  const selectedPeopleDiscovery = useMemo(() => {
    const rawPeopleDiscovery = selectedCompany?.metadata.people_discovery;

    if (
      typeof rawPeopleDiscovery !== "object" ||
      rawPeopleDiscovery === null ||
      Array.isArray(rawPeopleDiscovery)
    ) {
      return null;
    }

    return rawPeopleDiscovery as PeopleDiscoveryResult;
  }, [selectedCompany]);

  async function loadCampaignHistory() {
    setIsHistoryLoading(true);
    setHistoryErrorMessage(null);

    try {
      const response = await fetch("/api/leadgen/campaigns");
      const data = (await response.json()) as CampaignsResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.success ? undefined : data.error);
      }

      setCampaignHistory(data.campaigns);
    } catch (error) {
      setHistoryErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить историю кампаний",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/leadgen/campaigns")
      .then(async (response) => {
        const data = (await response.json()) as CampaignsResponse;

        if (!response.ok || !data.success) {
          throw new Error(data.success ? undefined : data.error);
        }

        if (isMounted) {
          setCampaignHistory(data.campaigns);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setHistoryErrorMessage(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить историю кампаний",
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsHistoryLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleRun(campaignInput: CampaignInput) {
    setIsRunning(true);
    setErrorMessage(null);
    setDetailsErrorMessage(null);

    try {
      const response = await fetch("/api/leadgen/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(campaignInput),
      });
      const data = (await response.json()) as RunLeadgenResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.success ? undefined : data.error);
      }

      setCampaign(data.campaign);
      setCompanies(data.companies);
      setContacts(data.contacts);
      setLeads(data.leads);
      setEvents(data.events);
      setNotifications(data.notifications);
      setSelectedLeadId(data.leads[0]?.id ?? null);
      setSelectedCampaignDetails(null);
      setSelectedCampaignId(null);
      void loadCampaignHistory();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось запустить тестовый процесс",
      );
    } finally {
      setIsRunning(false);
    }
  }

  async function handleOpenCampaign(campaignSummary: LeadgenCampaignSummary) {
    setSelectedCampaignId(campaignSummary.id);
    setIsDetailsLoading(true);
    setDetailsErrorMessage(null);

    try {
      const response = await fetch(
        `/api/leadgen/campaigns/${campaignSummary.id}`,
      );
      const data = (await response.json()) as CampaignDetailsResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.success ? undefined : data.error);
      }

      setSelectedCampaignDetails(data.details);
    } catch (error) {
      setSelectedCampaignDetails(null);
      setDetailsErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось открыть детали кампании",
      );
    } finally {
      setIsDetailsLoading(false);
    }
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
        pipeline_run_id: campaign.pipeline_run_id,
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
            <p className="eyebrow">Управление кампанией</p>
            <h2>Создать тестовую выборку лидов</h2>
            <p className="muted">
              Запуск теперь идет через API route, сохраняет данные в Supabase и
              возвращает результат в интерфейс.
            </p>
          </div>
        </div>
        <CampaignForm isRunning={isRunning} onRun={handleRun} />
        {errorMessage ? (
          <p className="muted" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <div className="workspace-grid">
        <section className="panel table-panel">
          <div className="table-toolbar">
            <div>
              <p className="eyebrow">Результат процесса</p>
              <h2>Очередь лидов</h2>
            </div>
            <span className="table-meta">
              {campaign
                ? `${leads.length} лидов · ${campaign.name} · ${events.length} событий`
                : "Ожидание запуска кампании"}
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
          decisionMaker={selectedDecisionMaker}
          peopleDiscovery={selectedPeopleDiscovery}
          bestAvailableEntry={selectedBestContact}
          bestOutreachEntry={selectedBestOutreachEntry}
          fallbackEntry={selectedFallbackEntry}
          onStatusChange={handleStatusChange}
        />
      </div>

      <div style={{ height: 20 }} />
      <TelegramNotifications leads={leads} notifications={notifications} />

      <div style={{ height: 20 }} />
      <CampaignHistory
        activeCampaignId={selectedCampaignId}
        campaigns={campaignHistory}
        errorMessage={historyErrorMessage}
        isLoading={isHistoryLoading}
        isOpeningCampaign={isDetailsLoading}
        onOpenCampaign={handleOpenCampaign}
      />

      <div style={{ height: 20 }} />
      <CampaignDetails
        details={selectedCampaignDetails}
        errorMessage={detailsErrorMessage}
        isLoading={isDetailsLoading}
      />
    </>
  );
}
