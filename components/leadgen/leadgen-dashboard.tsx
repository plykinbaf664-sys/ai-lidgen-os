"use client";

import { useEffect, useRef, useState } from "react";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import { CampaignHistory } from "@/components/leadgen/campaign-history";
import { EmailOutreachQueue } from "@/components/leadgen/email-outreach-queue";
import { Button } from "@/components/ui/button";
import type {
  CampaignInput,
  LeadgenCampaign,
  LeadgenCampaignDetails,
  LeadgenCampaignSummary,
  ProductionDiscoveryStats,
} from "@/lib/leadgen/types";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import {
  canContinueDiscovery,
  DISCOVERY_MAX_PASSES,
} from "@/lib/leadgen/discovery-continuation";

type RunResponse =
  | {
      success: true;
      campaign: LeadgenCampaign;
      production_discovery_stats?: ProductionDiscoveryStats;
      continuation?: {
        available: boolean;
        target: number;
        found: number;
        passes_completed: number;
        next_page_offset: number | null;
        search_exhausted: boolean;
      };
    }
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
  const [campaignDetails, setCampaignDetails] = useState<LeadgenCampaignDetails | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeCampaignRef = useRef<HTMLElement | null>(null);

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

  async function runCampaignUntilComplete(
    input: CampaignInput,
    startingCampaignId: string | null = null,
  ) {
    setIsRunning(true);
    if (!startingCampaignId) {
      setCampaignDetails(null);
      setDiscovery(null);
    }
    setError(null);
    try {
      let campaignId = startingCampaignId;
      let finalCampaign: LeadgenCampaign | null = null;
      let completedTarget = false;
      let finalFound = 0;
      let finalTarget = 50;
      for (let pass = 1; pass <= DISCOVERY_MAX_PASSES; pass += 1) {
        setRunProgress(
          campaignId
            ? `Продолжаем поиск: проход ${pass}, готово ${discovery?.email_ready_companies ?? discovery?.new_unique_emails ?? 0} из 50 компаний с подтверждённым email`
            : "Первый проход поиска: цель — до 50 новых компаний с подтверждённым email",
        );
        const response = await fetch("/api/leadgen/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, campaignId }),
        });
        const data = await readJson<RunResponse>(response);
        if (!response.ok || !data.success) {
          throw new Error(formatUnknownError(data.success ? null : data.error));
        }
        campaignId = data.campaign.id;
        finalCampaign = data.campaign;
        setActiveCampaignId(data.campaign.id);
        setActiveCampaignName(data.campaign.name);
        setDiscovery(data.production_discovery_stats ?? null);
        finalFound =
          data.continuation?.found ??
          data.production_discovery_stats?.email_ready_companies ??
          data.production_discovery_stats?.new_unique_emails ??
          0;
        finalTarget = data.continuation?.target ?? 50;
        completedTarget = finalFound >= finalTarget;
        setRunProgress(
          `Готово ${finalFound} из ${finalTarget} компаний с подтверждённым email. Проходов: ${data.continuation?.passes_completed ?? pass}.`,
        );
        if (completedTarget || !data.continuation?.available) break;
      }
      await loadHistory();
      if (campaignId) {
        const detailsResponse = await fetch(
          `/api/leadgen/campaigns/details?id=${encodeURIComponent(campaignId)}`,
        );
        const details = await readJson<DetailsResponse>(detailsResponse);
        if (detailsResponse.ok && details.success) {
          setCampaignDetails(details.details);
          setDiscovery(
            details.details.campaign.production_discovery_stats ?? null,
          );
        }
      }
      if (finalCampaign) setActiveCampaignName(finalCampaign.name);
      if (!completedTarget) {
        throw new Error(
          `Поиск не завершён: готово ${finalFound} из ${finalTarget}. Промежуточный результат сохранён; продолжите поиск до 50.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось запустить поиск.");
    } finally {
      setIsRunning(false);
      setRunProgress(null);
    }
  }

  async function handleRun(input: CampaignInput) {
    await runCampaignUntilComplete(input);
  }

  async function handleContinueSearch() {
    if (!activeCampaignId || !activeCampaignName) return;
    await runCampaignUntilComplete(
      {
        name: activeCampaignName,
        requestedBy:
          campaignDetails?.campaign.requested_by ?? "Оператор Leadgen OS",
      },
      activeCampaignId,
    );
  }

  async function handleOpenCampaign(summary: LeadgenCampaignSummary) {
    setActiveCampaignId(summary.id);
    setActiveCampaignName(summary.name);
    setIsOpening(true);
    setCampaignDetails(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/leadgen/campaigns/details?id=${encodeURIComponent(summary.id)}`,
      );
      const data = await readJson<DetailsResponse>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
      setDiscovery(data.details.campaign.production_discovery_stats ?? null);
      setCampaignDetails(data.details);
      window.requestAnimationFrame(() => {
        activeCampaignRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось открыть кампанию.");
    } finally {
      setIsOpening(false);
    }
  }

  const discoveryFound =
    discovery?.email_ready_companies ?? discovery?.new_unique_emails ?? 0;
  const discoveryTarget =
    discovery?.email_ready_target ?? discovery?.email_target ?? 50;
  const discoveryIncomplete = Boolean(
    discovery &&
      discovery.target_reached !== true &&
      discoveryFound < discoveryTarget,
  );

  return (
    <div className="leadgen-console">
      <section className="leadgen-config panel">
        <div className="section-heading compact">
          <div><p className="eyebrow">Новая кампания</p><h2>Параметры поиска</h2></div>
          <div className="config-facts" aria-label="Активные ограничения">
            <span>Россия</span><span>Web search</span><span>До 50 компаний с подтверждённым email за запуск</span>
          </div>
        </div>
        <CampaignForm isRunning={isRunning} onRun={handleRun} />
        {runProgress ? <p className="muted">{runProgress}</p> : null}
        {error ? <p className="outreach-error" role="alert">{error}</p> : null}
      </section>

      {activeCampaignId ? (
        <section className="active-campaign-shell" ref={activeCampaignRef}>
          <div className="active-campaign-heading">
            <div><p className="eyebrow">Текущая кампания</p><h2>{activeCampaignName}</h2>{campaigns.find((item) => item.id === activeCampaignId) ? <small className="muted">{campaignStatusCopyForDashboard(campaigns.find((item) => item.id === activeCampaignId)!.operational_status)}</small> : null}</div>
            {canContinueDiscovery(discovery) ? (
              <Button
                disabled={isRunning}
                loading={isRunning}
                onClick={handleContinueSearch}
                variant="secondary"
              >
                Продолжить поиск до 50 компаний
              </Button>
            ) : null}
            {discovery ? (
              <div className="discovery-inline">
                <span>
                  Готовые компании{" "}
                  <strong>
                    {discovery.email_ready_companies ?? discovery.new_unique_emails ?? 0} из{" "}
                    {discovery.email_ready_target ?? discovery.email_target ?? 50}
                  </strong>
                </span>
                <span>Персональных ЛПР <strong>{discovery.contact_ready_people ?? 0}</strong></span>
                <span>Проверено результатов <strong>{discovery.results_received}</strong></span>
                <span>
                  Прошли первичный отбор{" "}
                  <strong>{discovery.qualified_candidates_found ?? discovery.new_unique_companies}</strong>
                </span>
              </div>
            ) : null}
          </div>
          {isRunning || discoveryIncomplete ? (
            <section className="panel leadgen-empty-campaign" aria-live="polite">
              <h2>Формируем полный набор</h2>
              <p>
                Готово {discoveryFound} из {discoveryTarget}. Промежуточные
                карточки появятся только после завершения поиска 50/50.
              </p>
            </section>
          ) : (
            <EmailOutreachQueue
              campaignDetails={campaignDetails}
              campaignId={activeCampaignId}
              key={`${activeCampaignId}:${campaignDetails?.leads.length ?? "stored"}`}
            />
          )}
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
