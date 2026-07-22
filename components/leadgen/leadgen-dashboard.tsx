"use client";

import { useEffect, useState } from "react";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import { CampaignHistory } from "@/components/leadgen/campaign-history";
import { EmailOutreachQueue } from "@/components/leadgen/email-outreach-queue";
import type {
  CampaignInput,
  LeadgenCampaign,
  LeadgenCampaignDetails,
  LeadgenCampaignSummary,
  ProductionDiscoveryStats,
} from "@/lib/leadgen/types";
import { formatUnknownError } from "@/lib/leadgen/error-format";

type RunResponse =
  | { success: true; campaign: LeadgenCampaign; production_discovery_stats?: ProductionDiscoveryStats }
  | { success: false; error?: string };
type CampaignsResponse =
  | { success: true; campaigns: LeadgenCampaignSummary[] }
  | { success: false; error?: string };
type DetailsResponse =
  | { success: true; details: LeadgenCampaignDetails }
  | { success: false; error?: string };

function campaignStatusCopyForDashboard(status: LeadgenCampaignSummary["operational_status"]) {
  return {
    discovery_complete: "Поиск завершён",
    needs_review: "Есть письма для проверки",
    ready_to_send: "Одобренные письма готовы",
    queue_active: "Очередь отправки активна",
    sent: "Отправка завершена",
    needs_attention: "Есть ошибки, требующие внимания",
  }[status];
}

async function readJson<T>(response: Response): Promise<T> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error(`Некорректный ответ API (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

export function LeadgenDashboard() {
  const [campaigns, setCampaigns] = useState<LeadgenCampaignSummary[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [activeCampaignName, setActiveCampaignName] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<ProductionDiscoveryStats | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(selectLatest = false) {
    setIsHistoryLoading(true);
    try {
      const response = await fetch("/api/leadgen/campaigns");
      const data = await readJson<CampaignsResponse>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
      setCampaigns(data.campaigns);
      if (selectLatest && !activeCampaignId && data.campaigns[0]) {
        setActiveCampaignId(data.campaigns[0].id);
        setActiveCampaignName(data.campaigns[0].name);
      }
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/leadgen/campaigns")
      .then(async (response) => {
        const data = await readJson<CampaignsResponse>(response);
        if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
        if (!active) return;
        setCampaigns(data.campaigns);
        if (data.campaigns[0]) {
          setActiveCampaignId(data.campaigns[0].id);
          setActiveCampaignName(data.campaigns[0].name);
        }
      })
      .catch(() => active && setError("Не удалось загрузить кампании."))
      .finally(() => active && setIsHistoryLoading(false));
    return () => { active = false; };
  }, []);

  async function handleRun(input: CampaignInput) {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/leadgen/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await readJson<RunResponse>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
      setActiveCampaignId(data.campaign.id);
      setActiveCampaignName(data.campaign.name);
      setDiscovery(data.production_discovery_stats ?? null);
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось запустить поиск.");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleOpenCampaign(summary: LeadgenCampaignSummary) {
    setActiveCampaignId(summary.id);
    setActiveCampaignName(summary.name);
    setIsOpening(true);
    setError(null);
    try {
      const response = await fetch(
          `/api/leadgen/campaigns/details?pipelineRunId=${encodeURIComponent(summary.pipeline_run_id)}`,
      );
      const data = await readJson<DetailsResponse>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
      setDiscovery(data.details.campaign.production_discovery_stats ?? null);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось открыть кампанию.");
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="leadgen-console">
      <section className="leadgen-config panel">
        <div className="section-heading compact">
          <div><p className="eyebrow">Новая кампания</p><h2>Параметры поиска</h2></div>
          <div className="config-facts" aria-label="Активные ограничения">
            <span>Россия</span><span>Web search</span><span>20 лидов в день</span>
          </div>
        </div>
        <CampaignForm isRunning={isRunning} onRun={handleRun} />
        {error ? <p className="outreach-error" role="alert">{error}</p> : null}
      </section>

      {activeCampaignId ? (
        <section className="active-campaign-shell">
          <div className="active-campaign-heading">
            <div><p className="eyebrow">Текущая кампания</p><h2>{activeCampaignName}</h2>{campaigns.find((item) => item.id === activeCampaignId) ? <small className="muted">{campaignStatusCopyForDashboard(campaigns.find((item) => item.id === activeCampaignId)!.operational_status)}</small> : null}</div>
            {discovery ? (
              <div className="discovery-inline">
                <span>Проверено <strong>{discovery.results_received}</strong></span>
                <span>Новых <strong>{discovery.new_unique_companies}</strong></span>
                <span>Email <strong>{discovery.new_unique_emails ?? 0} из {discovery.email_target ?? 20}</strong></span>
              </div>
            ) : null}
          </div>
          <EmailOutreachQueue campaignId={activeCampaignId} discoveryStats={discovery} />
        </section>
      ) : (
        <section className="panel leadgen-empty-campaign">
          <h2>Нет активной кампании</h2>
          <p>Запустите поиск, чтобы найти новые компании.</p>
        </section>
      )}

      <CampaignHistory
        activeCampaignId={activeCampaignId}
        campaigns={campaigns}
        errorMessage={error}
        isLoading={isHistoryLoading}
        isOpeningCampaign={isOpening}
        onOpenCampaign={handleOpenCampaign}
      />
    </div>
  );
}
