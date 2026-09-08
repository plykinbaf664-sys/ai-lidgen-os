"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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

export function LeadSourceIngestion() {
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
      if (!response.ok || !data.success) throw new Error(data.error ?? "Preview не создан.");
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
      if (!response.ok || !data.success) throw new Error(data.error ?? "Import не сохранён.");
      setMessage(`Сохранено строк для enrichment: ${data.imported ?? 0}. Автоотправка не запускалась.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import не сохранён.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel lead-source-panel" aria-labelledby="lead-source-title">
      <header>
        <div>
          <p className="eyebrow">Новые источники</p>
          <h2 id="lead-source-title">Импорт и прямой AI-hiring intent</h2>
        </div>
        <span className="dispatch-panel-badge warning">Review mode</span>
      </header>
      <div className="lead-source-grid">
        <div>
          <h3>Своя база</h3>
          <p className="muted">CSV/XLSX → проверка → preview → enrichment. Отправка автоматически не запускается.</p>
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
        <div>
          <h3>AI Automation Hiring</h3>
          <p className="muted">
            Отдельный сильный сигнал: вакансия должна подтверждать конкретную автоматизацию бизнеса,
            а не просто содержать AI/ML в названии.
          </p>
          <dl className="lead-source-state">
            <div><dt>Production</dt><dd>Выключен</dd></div>
            <div><dt>Отправка</dt><dd>Только existing queue</dd></div>
          </dl>
        </div>
      </div>
      {preview?.summary ? (
        <div className="lead-source-preview" role="status">
          <span>Строк: {preview.summary.rowsTotal}</span>
          <span>Валидных: {preview.summary.valid}</span>
          <span>Ошибок: {preview.summary.invalid}</span>
          <span>Дубликатов: {preview.summary.duplicates}</span>
          <span>Новых: {preview.summary.newLeads}</span>
          <span>Нужен enrichment: {preview.summary.requiringEnrichment}</span>
          {preview.alreadyImported ? <strong>Этот файл уже импортировался</strong> : null}
        </div>
      ) : null}
      {message ? <p className="dispatch-panel-note">{message}</p> : null}
    </section>
  );
}

