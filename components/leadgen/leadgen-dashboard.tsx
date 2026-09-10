"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CampaignForm } from "@/components/leadgen/campaign-form";
import {
  CampaignModeSelector,
  type CampaignMode,
} from "@/components/leadgen/campaign-mode-selector";
import { CampaignHistory } from "@/components/leadgen/campaign-history";
import { EmailOutreachQueue } from "@/components/leadgen/email-outreach-queue";
import { LeadSourceIngestion } from "@/components/leadgen/lead-source-ingestion";
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
  | { success: false; error?: string; code?: string };
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
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("DISCOVERY");
  const activeCampaignRef = useRef<HTMLElement | null>(null);

  const loadHistory = useCallback(async (selectLatest = false) => {
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
  }, [activeCampaignId]);

  useEffect(() => {
    let active = true;
    const requestedCampaignId = new URLSearchParams(window.location.search).get("campaign");
    fetch("/api/leadgen/campaigns")
      .then(async (response) => {
        const data = await readJson<CampaignsResponse>(response);
        if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
        if (!active) return;
        setCampaigns(data.campaigns);
        const selectedCampaign = data.campaigns.find((item) => item.id === requestedCampaignId) ?? data.campaigns[0];
        if (selectedCampaign) {
          setActiveCampaignId(selectedCampaign.id);
          setActiveCampaignName(selectedCampaign.name);
          const detailsResponse = await fetch(
            `/api/leadgen/campaigns/details?id=${encodeURIComponent(selectedCampaign.id)}`,
          );
          const details = await readJson<DetailsResponse>(detailsResponse);
          if (detailsResponse.ok && details.success && active) {
            setCampaignDetails(details.details);
            setDiscovery(
              details.details.campaign.production_discovery_stats ?? null,
            );
          }
        }
      })
      .catch(() => active && setError("Не удалось загрузить кампании."))
      .finally(() => active && setIsHistoryLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const reloadFromHistory = () => window.location.reload();
    window.addEventListener("popstate", reloadFromHistory);
    return () => window.removeEventListener("popstate", reloadFromHistory);
  }, []);

  const runCampaignUntilComplete = useCallback(async (
    input: CampaignInput,
    startingCampaignId: string | null = null,
  ) => {
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
      let pass = 1;
      let transientFailures = 0;
      while (pass <= DISCOVERY_MAX_PASSES) {
        setRunProgress(
          campaignId
            ? `Продолжаем поиск: проход ${pass}, готово ${finalFound} из 50 компаний с подтверждённым email`
            : "Первый проход поиска: цель — до 50 новых компаний с подтверждённым email",
        );
        let response: Response | null = null;
        let data: RunResponse;
        try {
          response = await fetch("/api/leadgen/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...input, campaignId }),
          });
          data = await readJson<RunResponse>(response);
          if (!response.ok || !data.success) {
            throw new Error(formatUnknownError(data.success ? null : data.error));
          }
          transientFailures = 0;
        } catch (caught) {
          if (
            response &&
            response.status >= 400 &&
            response.status < 500 &&
            response.status !== 409
          ) {
            throw caught;
          }
          transientFailures += 1;
          const retryDelay = Math.min(30_000, transientFailures * 3_000);
          setRunProgress(
            `Поиск временно прерван сетью. Прогресс сохранён; повтор через ${Math.ceil(retryDelay / 1_000)} сек.`,
          );
          await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
          continue;
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
        pass += 1;
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
        setRunProgress(
          `Найдено ${finalFound} из ${finalTarget} качественных лидов. Поиск остановлен: дальнейшие стратегии перестали давать достаточно новых релевантных компаний.`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось запустить поиск.");
    } finally {
      setIsRunning(false);
    }
  }, [loadHistory]);

  async function handleRun(input: CampaignInput) {
    await runCampaignUntilComplete(input);
  }

  async function handleSourceCampaignCreated(
    campaign: LeadgenCampaign,
    message: string,
  ) {
    setActiveCampaignId(campaign.id);
    setActiveCampaignName(campaign.name);
    setRunProgress(message);
    await loadHistory();
    const response = await fetch(
      `/api/leadgen/campaigns/details?id=${encodeURIComponent(campaign.id)}`,
      { cache: "no-store" },
    );
    const data = await readJson<DetailsResponse>(response);
    if (!response.ok || !data.success) {
      throw new Error(formatUnknownError(data.success ? null : data.error));
    }
    setCampaignDetails(data.details);
    setDiscovery(data.details.campaign.production_discovery_stats ?? null);
    window.history.pushState(null, "", `/leadgen?campaign=${encodeURIComponent(campaign.id)}`);
    window.requestAnimationFrame(() => activeCampaignRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        activeCampaignRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
    try {
      const response = await fetch(
        `/api/leadgen/campaigns/details?id=${encodeURIComponent(summary.id)}`,
        { cache: "no-store" },
      );
      const data = await readJson<DetailsResponse>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.success ? null : data.error));
      setDiscovery(data.details.campaign.production_discovery_stats ?? null);
      setCampaignDetails(data.details);
      window.history.pushState(null, "", `/leadgen?campaign=${encodeURIComponent(summary.id)}`);
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
  const autoResumeCampaignRef = useRef<string | null>(null);

  const operationalTotals = campaigns.reduce(
    (totals, campaign) => ({
      companies: totals.companies + campaign.companies_count,
      needsReview: totals.needsReview + campaign.needs_review_count,
      approved: totals.approved + campaign.approved_count,
      queued: totals.queued + campaign.queued_count + campaign.sending_count,
      sent: totals.sent + campaign.initial_sent_count,
      sentToday: totals.sentToday + (campaign.sent_today_count ?? 0),
      replied: totals.replied + (campaign.replied_count ?? 0),
    }),
    { companies: 0, needsReview: 0, approved: 0, queued: 0, sent: 0, sentToday: 0, replied: 0 },
  );

  useEffect(() => {
    if (
      !activeCampaignId ||
      !activeCampaignName ||
      !campaignDetails ||
      campaignDetails.campaign.status !== "running" ||
      !discoveryIncomplete ||
      isRunning ||
      autoResumeCampaignRef.current === activeCampaignId
    ) {
      return;
    }
    autoResumeCampaignRef.current = activeCampaignId;
    void runCampaignUntilComplete(
      {
        name: activeCampaignName,
        requestedBy: campaignDetails.campaign.requested_by,
        verticalId: campaignDetails.campaign.vertical_id,
      },
      activeCampaignId,
    );
  }, [
    activeCampaignId,
    activeCampaignName,
    campaignDetails,
    discoveryIncomplete,
    isRunning,
    runCampaignUntilComplete,
  ]);

  return (
    <div className="leadgen-console">
      <section className="leadgen-config campaign-launch-panel panel">
        <div className="section-heading compact">
          <div><p className="eyebrow">Новая кампания</p><h2>Выберите способ поиска</h2></div>
          {campaignMode === "DISCOVERY" ? (
            <div className="config-facts" aria-label="Активные ограничения">
              <span>Россия</span><span>Поиск в интернете</span><span>До 50 компаний с подтверждённым email за запуск</span>
            </div>
          ) : null}
        </div>
        <CampaignModeSelector
          disabled={isRunning}
          onChange={setCampaignMode}
          value={campaignMode}
        />
        {campaignMode === "DISCOVERY" ? (
          <CampaignForm isRunning={isRunning} onRun={handleRun} />
        ) : (
          <LeadSourceIngestion
            key={campaignMode}
            mode={campaignMode}
            onCampaignCreated={handleSourceCampaignCreated}
          />
        )}
        {runProgress ? <p className="muted">{runProgress}</p> : null}
        {error ? <p className="outreach-error" role="alert">{error}</p> : null}
      </section>

      <section className="operational-summary" aria-label="Оперативная сводка">
        {[
          ["Кампаний", campaigns.length],
          ["Компаний", operationalTotals.companies],
          ["Ожидают проверки", operationalTotals.needsReview],
          ["Одобрено", operationalTotals.approved],
          ["В очереди", operationalTotals.queued],
          ["Отправлено сегодня", operationalTotals.sentToday],
          ["Отправлено всего", operationalTotals.sent],
          ["Ответов", operationalTotals.replied],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{isHistoryLoading ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <CampaignHistory
        activeCampaignId={activeCampaignId}
        campaigns={campaigns}
        errorMessage={error}
        isLoading={isHistoryLoading}
        isOpeningCampaign={isOpening}
        onOpenCampaign={handleOpenCampaign}
      />

      {activeCampaignId ? (
        <section className="active-campaign-shell" ref={activeCampaignRef}>
          <div className="active-campaign-heading">
            <div><p className="eyebrow">Текущая кампания</p><h2>{activeCampaignName}</h2>{campaigns.find((item) => item.id === activeCampaignId) ? <small className="muted">{campaignStatusCopyForDashboard(campaigns.find((item) => item.id === activeCampaignId)!.operational_status)}</small> : null}</div>
            <Link className="button secondary" href={`/leadgen/analytics?campaign=${encodeURIComponent(activeCampaignId)}`}>
              Аналитика кампании
            </Link>
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
                <span>
                  Персональных контактов / ЛПР{" "}
                  <strong>
                    {discovery.contact_ready_people ?? 0} из{" "}
                    {discovery.contact_ready_target ?? discovery.email_ready_target ?? 50}
                  </strong>
                </span>
                <span>Найдено кандидатов <strong>{discovery.raw_candidates ?? discovery.results_received}</strong></span>
                <span>Уникальных <strong>{discovery.unique_candidates ?? discovery.new_unique_companies}</strong></span>
                <span>
                  Прошли первичный отбор{" "}
                  <strong>{discovery.prefiltered_candidates ?? discovery.qualified_candidates_found ?? discovery.new_unique_companies}</strong>
                </span>
              </div>
            ) : null}
          </div>
          {isRunning && !campaignDetails ? (
            <section className="panel leadgen-empty-campaign" aria-live="polite">
              <h2>Формируем полный набор</h2>
              <p>
                Найдено: {discovery?.raw_candidates ?? 0}. Уникальных: {discovery?.unique_candidates ?? 0}.
                Прошли фильтр: {discovery?.prefiltered_candidates ?? 0}. Готово: {discoveryFound} / {discoveryTarget}.
              </p>
            </section>
          ) : (
            <EmailOutreachQueue
              campaignDetails={campaignDetails}
              campaignId={activeCampaignId}
              key={activeCampaignId}
            />
          )}
        </section>
      ) : (
        <section className="panel leadgen-empty-campaign">
          <h2>Нет активной кампании</h2>
          <p>Запустите поиск, чтобы найти новые компании.</p>
        </section>
      )}

    </div>
  );
}
