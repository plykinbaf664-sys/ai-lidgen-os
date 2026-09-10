"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignMode } from "@/components/leadgen/campaign-mode-selector";
import type { CampaignInput, LeadgenCampaign } from "@/lib/leadgen/types";
import { DEFAULT_VERTICAL_ID, LEADGEN_VERTICALS, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

type PreviewResponse = {
  success: boolean;
  error?: string;
  previewId?: string;
  alreadyImported?: boolean;
  productionEnabled?: boolean;
  summary?: {
    rowsTotal: number;
    valid: number;
    invalid: number;
    duplicates: number;
    newLeads: number;
    existingLeads: number;
    emailsValid: number;
    emailsInvalid: number;
    requiringEnrichment: number;
  };
};

type SourceRunResponse = {
  success?: boolean;
  error?: string;
  campaign?: LeadgenCampaign;
  campaignId?: string | null;
  imported?: number;
  duplicate?: boolean;
  companies?: number;
  ready?: number;
  metrics?: { jobsScanned?: number };
  summary?: { rows?: number; qualified?: number; contacts?: number; ready?: number };
};

type Props = {
  mode: Exclude<CampaignMode, "DISCOVERY">;
  onCampaignCreated?: (campaign: LeadgenCampaign, message: string) => void | Promise<void>;
};

const requestedBy = "Оператор Leadgen OS";

export function LeadSourceIngestion({ mode, onCampaignCreated }: Props) {
  const fileInputId = useId();
  const [verticalId, setVerticalId] = useState<LeadgenVerticalId>(DEFAULT_VERTICAL_ID);
  const [name, setName] = useState(
    mode === "AI_HIRING" ? "Компании с прямой потребностью в AI" : "Кампания из собственной базы",
  );
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [pending, setPending] = useState<"preview" | "confirm" | "search" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function campaignInput(): CampaignInput & { verticalId: LeadgenVerticalId } {
    return { name: name.trim(), requestedBy, verticalId };
  }

  async function runAiSearch() {
    setPending("search");
    setMessage("Ищем реальные вакансии и проверяем компании. Обычно это занимает несколько минут.");
    try {
      const response = await fetch("/api/leadgen/ai-hiring/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaignInput()),
      });
      const data = (await response.json()) as SourceRunResponse;
      if (!response.ok || !data.success || !data.campaign) throw new Error(data.error ?? "Поиск не завершён.");
      const status = `Проверено вакансий: ${data.metrics?.jobsScanned ?? 0}. Компаний в кампании: ${data.companies ?? 0}. Писем для проверки: ${data.ready ?? 0}.`;
      setMessage(status);
      await onCampaignCreated?.(data.campaign, status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось запустить поиск.");
    } finally {
      setPending(null);
    }
  }

  async function previewFile() {
    if (!file) return;
    setPending("preview");
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/leadgen/imports/preview", { method: "POST", body: form });
      const data = (await response.json()) as PreviewResponse;
      if (!response.ok || !data.success) throw new Error(data.error ?? "Предпросмотр не создан.");
      setPreview(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось проверить файл.");
    } finally {
      setPending(null);
    }
  }

  async function confirmImport() {
    if (!preview?.previewId || !preview.productionEnabled) return;
    setPending("confirm");
    setMessage("Дополняем данные и готовим кампанию. Автоматической отправки не будет.");
    try {
      const response = await fetch("/api/leadgen/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId: preview.previewId, ...campaignInput() }),
      });
      const data = (await response.json()) as SourceRunResponse;
      if (!response.ok || !data.success) throw new Error(data.error ?? "Не удалось загрузить базу.");
      if (data.duplicate) {
        setMessage("Этот файл уже был обработан. Повторные лиды и письма не создавались.");
        return;
      }
      if (!data.campaign) throw new Error("Кампания после импорта не создана.");
      const status = `Обработано строк: ${data.summary?.rows ?? data.imported ?? 0}. Квалифицировано: ${data.summary?.qualified ?? 0}. Писем для проверки: ${data.summary?.ready ?? 0}.`;
      setMessage(status);
      await onCampaignCreated?.(data.campaign, status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить базу.");
    } finally {
      setPending(null);
    }
  }

  const settings = (
    <div className="campaign-form campaign-form-compact">
      <label className="form-field">
        <span>Сегмент</span>
        <select disabled={pending !== null} value={verticalId} onChange={(event) => setVerticalId(event.target.value as LeadgenVerticalId)}>
          {Object.values(LEADGEN_VERTICALS).map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.label}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span>Название кампании</span>
        <input disabled={pending !== null} required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="muted campaign-vertical-note">{LEADGEN_VERTICALS[verticalId].offer}</p>
    </div>
  );

  if (mode === "AI_HIRING") {
    return (
      <div className="campaign-mode-settings" aria-live="polite">
        <h3>По прямой потребности в AI</h3>
        <p className="muted">Ищем реальные вакансии, проверяем практическую задачу автоматизации, работодателя и соответствие выбранному сегменту.</p>
        {settings}
        <Button disabled={!name.trim() || pending !== null} loading={pending === "search"} onClick={runAiSearch} variant="primary">
          {pending === "search" ? "Идёт поиск…" : "Найти компании"}
        </Button>
        {message ? <p className="dispatch-panel-note" role="status">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="campaign-mode-settings" aria-labelledby="lead-source-title">
      <div>
        <h3 id="lead-source-title">Загрузить свою базу</h3>
        <p className="muted">Выбор файла → проверка → предпросмотр → подтверждение → дополнение данных → подготовка.</p>
        {settings}
        <input
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="lead-source-file-input"
          disabled={pending !== null}
          id={fileInputId}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setMessage(null); }}
          type="file"
        />
        <label className="lead-source-upload" htmlFor={fileInputId}>
          <span className="lead-source-upload-mark" aria-hidden="true">↗</span>
          <span>
            <strong>{file ? file.name : "Загрузить файл"}</strong>
            <small>
              {file
                ? `${(file.size / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} КБ · готов к проверке`
                : "CSV или XLSX · до 5 МБ"}
            </small>
          </span>
        </label>
        <div className="lead-source-actions">
          <Button disabled={!file || pending !== null} loading={pending === "preview"} onClick={previewFile} variant="secondary">Проверить базу</Button>
          <Button disabled={!preview?.previewId || !preview.productionEnabled || !name.trim() || pending !== null} loading={pending === "confirm"} onClick={confirmImport} variant="primary">
            Подтвердить и подготовить
          </Button>
        </div>
      </div>
      {preview?.summary ? (
        <div className="lead-source-preview" role="status">
          <span>Строк: {preview.summary.rowsTotal}</span><span>Корректных: {preview.summary.valid}</span>
          <span>Ошибок: {preview.summary.invalid}</span><span>Дублей: {preview.summary.duplicates}</span>
          <span>Новых: {preview.summary.newLeads}</span><span>Требуют дополнения: {preview.summary.requiringEnrichment}</span>
          {preview.alreadyImported ? <strong>Этот файл уже был обработан</strong> : null}
        </div>
      ) : null}
      {preview && !preview.productionEnabled ? <p className="campaign-feature-note">Загрузка временно отключена администратором.</p> : null}
      {message ? <p className="dispatch-panel-note" role="status">{message}</p> : null}
    </div>
  );
}
