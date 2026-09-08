"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignMode } from "@/components/leadgen/campaign-mode-selector";

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

export function LeadSourceIngestion({ mode }: { mode: Exclude<CampaignMode, "DISCOVERY"> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [pending, setPending] = useState<"preview" | "confirm" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function previewFile() {
    if (!file) return;
    setPending("preview");
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/leadgen/imports/preview", {
        method: "POST",
        body: form,
      });
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
    try {
      const response = await fetch("/api/leadgen/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previewId: preview.previewId }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string; imported?: number };
      if (!response.ok || !data.success) throw new Error(data.error ?? "Не удалось загрузить базу.");
      setMessage(`Принято строк для дополнения данных: ${data.imported ?? 0}. Автоматическая отправка не запускалась.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить базу.");
    } finally {
      setPending(null);
    }
  }

  if (mode === "AI_HIRING") {
    return (
      <div className="campaign-mode-settings" aria-live="polite">
        <h3>По прямой потребности в AI</h3>
        <p className="muted">
          Проверяем реальные вакансии и отбираем компании, которым нужны AI-агенты,
          LLM/RAG или автоматизация продаж, маркетинга и внутренних процессов.
        </p>
        <p className="campaign-feature-note">Функция пока доступна только для проверки.</p>
      </div>
    );
  }

  return (
    <div className="campaign-mode-settings" aria-labelledby="lead-source-title">
      <div>
          <h3 id="lead-source-title">Загрузить свою базу</h3>
          <p className="muted">Выбор файла → проверка → предпросмотр → подтверждение → дополнение данных → подготовка.</p>
          <input
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMessage(null);
            }}
            type="file"
          />
          <div className="lead-source-actions">
            <Button disabled={!file || pending !== null} loading={pending === "preview"} onClick={previewFile} variant="secondary">
              Проверить файл
            </Button>
            <Button
              disabled={!preview?.previewId || !preview.productionEnabled || pending !== null}
              loading={pending === "confirm"}
              onClick={confirmImport}
              variant="primary"
            >
              Подтвердить импорт
            </Button>
          </div>
      </div>
      {preview?.summary ? (
        <div className="lead-source-preview" role="status">
          <span>Строк: {preview.summary.rowsTotal}</span>
          <span>Валидных: {preview.summary.valid}</span>
          <span>Ошибок: {preview.summary.invalid}</span>
          <span>Дубликатов: {preview.summary.duplicates}</span>
          <span>Новых: {preview.summary.newLeads}</span>
          <span>Требуют дополнения: {preview.summary.requiringEnrichment}</span>
          {preview.alreadyImported ? <strong>Этот файл уже импортировался</strong> : null}
        </div>
      ) : null}
      {preview && !preview.productionEnabled ? (
        <p className="campaign-feature-note">Функция пока доступна только для проверки.</p>
      ) : null}
      {message ? <p className="dispatch-panel-note">{message}</p> : null}
    </div>
  );
}
