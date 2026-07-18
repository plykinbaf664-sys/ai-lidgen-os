"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { outreachStatusLabels } from "@/lib/leadgen/outreach-status";
import type {
  OutreachQueueEntry,
  OutreachReadiness,
} from "@/lib/leadgen/types";

type ApiError = { success: false; error?: string };
type QueueResponse = { success: true; entries: OutreachQueueEntry[] } | ApiError;
type EntryResponse = { success: true; entry: OutreachQueueEntry } | ApiError;
type ReadinessResponse =
  | { success: true; readiness: OutreachReadiness; smtp_message: string }
  | ApiError;
type BulkPreview = {
  eligible_count: number;
  approved: number;
  skipped: Record<string, number>;
};
type BulkResponse = ({ success: true } & BulkPreview) | ApiError;
type BatchResponse =
  | {
      success: true;
      queued: OutreachQueueEntry[];
      stats: { sentToday: number; dailyLimit: number; remaining: number };
      remaining_approved: number;
    }
  | ApiError;

type QueueFilter =
  | "all"
  | "review"
  | "approved"
  | "queued"
  | "sent"
  | "failed"
  | "missing"
  | "skipped";

const filters: Array<{ id: QueueFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "review", label: "Требуют проверки" },
  { id: "approved", label: "Одобрено" },
  { id: "queued", label: "В очереди" },
  { id: "sent", label: "Отправлено" },
  { id: "failed", label: "Ошибки" },
  { id: "missing", label: "Без email" },
  { id: "skipped", label: "Пропущенные" },
];

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Некорректный ответ сервера (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

function getError(data: ApiError) {
  return data.error || "Не удалось выполнить действие";
}

function matchesFilter(entry: OutreachQueueEntry, filter: QueueFilter) {
  if (filter === "all") return true;
  if (filter === "review") return ["draft", "needs_review"].includes(entry.status);
  if (filter === "approved") return entry.status === "approved";
  if (filter === "queued") return ["queued", "sending"].includes(entry.status);
  if (filter === "sent") return entry.status === "sent";
  if (filter === "failed") return entry.status === "failed";
  if (filter === "missing") return !entry.email;
  return entry.status === "rejected";
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

export function EmailOutreachQueue({
  campaignId,
}: {
  campaignId: string | null;
}) {
  const [entries, setEntries] = useState<OutreachQueueEntry[]>([]);
  const [readiness, setReadiness] = useState<OutreachReadiness | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchSize, setBatchSize] = useState(5);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null,
    [entries, selectedId],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => matchesFilter(entry, filter)),
    [entries, filter],
  );
  const metrics = useMemo(
    () => ({
      total: entries.length,
      review: entries.filter((entry) =>
        ["draft", "needs_review"].includes(entry.status),
      ).length,
      approved: entries.filter((entry) => entry.status === "approved").length,
      queued: entries.filter((entry) => entry.status === "queued").length,
      sending: entries.filter((entry) => entry.status === "sending").length,
      sent: entries.filter((entry) => entry.status === "sent").length,
      failed: entries.filter((entry) => entry.status === "failed").length,
    }),
    [entries],
  );

  const selectEntry = useCallback((entry: OutreachQueueEntry) => {
    setSelectedId(entry.id);
    setSubject(entry.subject);
    setBody(entry.body);
    setEmail(entry.email);
  }, []);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setError(null);
    const [queueResponse, readinessResponse] = await Promise.all([
      fetch(`/api/leadgen/outreach?campaignId=${encodeURIComponent(campaignId)}`),
      fetch("/api/leadgen/outreach/readiness"),
    ]);
    const queue = await readJson<QueueResponse>(queueResponse);
    const ready = await readJson<ReadinessResponse>(readinessResponse);
    if (!queueResponse.ok || !queue.success) {
      throw new Error(getError(queue as ApiError));
    }
    setEntries(queue.entries);
    if (ready.success) setReadiness(ready.readiness);
    const current = queue.entries.find((entry) => entry.id === selectedId);
    const next = current ?? queue.entries[0] ?? null;
    if (next) selectEntry(next);
  }, [campaignId, selectEntry, selectedId]);

  useEffect(() => {
    if (!campaignId) return;
    let active = true;
    Promise.all([
      fetch("/api/leadgen/outreach/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      }),
      fetch("/api/leadgen/outreach/readiness"),
    ])
      .then(async ([queueResponse, readinessResponse]) => {
        const queue = await readJson<QueueResponse>(queueResponse);
        const ready = await readJson<ReadinessResponse>(readinessResponse);
        if (!queue.success) throw new Error(getError(queue));
        if (!active) return;
        setEntries(queue.entries);
        if (ready.success) setReadiness(ready.readiness);
        if (queue.entries[0]) selectEntry(queue.entries[0]);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Ошибка загрузки очереди");
      });
    return () => {
      active = false;
    };
  }, [campaignId, selectEntry]);

  async function patchEntry(
    id: string,
    payload: Record<string, unknown>,
    endpoint?: string,
  ) {
    const response = await fetch(endpoint ?? `/api/leadgen/outreach/${id}`, {
      method: endpoint ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: endpoint ? undefined : JSON.stringify(payload),
    });
    const data = await readJson<EntryResponse>(response);
    if (!response.ok || !data.success) throw new Error(getError(data as ApiError));
    setEntries((current) =>
      current.map((entry) => (entry.id === id ? data.entry : entry)),
    );
    selectEntry(data.entry);
    return data.entry;
  }

  async function approve(entry: OutreachQueueEntry) {
    const previous = entry;
    const optimistic = {
      ...entry,
      status: "approved" as const,
      approved_at: new Date().toISOString(),
    };
    setEntries((current) =>
      current.map((item) => (item.id === entry.id ? optimistic : item)),
    );
    setPending(entry.id);
    setError(null);
    try {
      await patchEntry(entry.id, {}, `/api/leadgen/outreach/${entry.id}/approve`);
      setMessage("Письмо одобрено и готово к отправке.");
    } catch (caught) {
      setEntries((current) =>
        current.map((item) => (item.id === entry.id ? previous : item)),
      );
      setError(caught instanceof Error ? caught.message : "Не удалось одобрить письмо");
    } finally {
      setPending(null);
    }
  }

  async function saveEdit() {
    if (!selectedEntry) return;
    setPending(selectedEntry.id);
    setError(null);
    try {
      await patchEntry(selectedEntry.id, { subject, body, email });
      setMessage(
        selectedEntry.status === "approved"
          ? "Изменения сохранены. Одобрение отменено — письмо требует проверки."
          : "Изменения сохранены.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить");
    } finally {
      setPending(null);
    }
  }

  async function previewBulkApprove() {
    if (!campaignId) return;
    setPending("bulk-preview");
    try {
      const response = await fetch("/api/leadgen/outreach/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, execute: false }),
      });
      const data = await readJson<BulkResponse>(response);
      if (!data.success) throw new Error(getError(data));
      setBulkPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка проверки");
    } finally {
      setPending(null);
    }
  }

  async function executeBulkApprove() {
    if (!campaignId) return;
    setPending("bulk-approve");
    try {
      const response = await fetch("/api/leadgen/outreach/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, execute: true }),
      });
      const data = await readJson<BulkResponse>(response);
      if (!data.success) throw new Error(getError(data));
      setBulkPreview(null);
      setMessage(`Одобрено: ${data.approved}. Пропущено: ${
        Object.values(data.skipped).reduce((sum, count) => sum + count, 0)
      }.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка массового одобрения");
    } finally {
      setPending(null);
    }
  }

  async function scheduleBatch() {
    if (!campaignId) return;
    setPending("batch");
    try {
      const response = await fetch("/api/leadgen/outreach/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, count: batchSize }),
      });
      const data = await readJson<BatchResponse>(response);
      if (!data.success) throw new Error(getError(data));
      setShowBatchConfirm(false);
      setMessage(
        `В постоянную очередь поставлено: ${data.queued.length}. Письма будут обработаны по одному.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка постановки в очередь");
    } finally {
      setPending(null);
    }
  }

  async function control(action: "pause" | "resume" | "cancel" | "retry") {
    setPending(action);
    try {
      const response = await fetch("/api/leadgen/outreach/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, campaignId }),
      });
      const data = await readJson<{ success: boolean; error?: string }>(response);
      if (!data.success) throw new Error(data.error);
      setMessage("Состояние очереди обновлено.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка управления очередью");
    } finally {
      setPending(null);
    }
  }

  const maxBatch = Math.min(
    readiness?.daily_remaining ?? 0,
    readiness?.batch_limit ?? 20,
    metrics.approved,
  );
  const batchOptions = [5, 10, 15, 20].filter((value) => value <= maxBatch);
  if (maxBatch > 0 && batchOptions.length === 0) batchOptions.push(maxBatch);

  return (
    <section className="panel outreach-queue-panel">
      <div className="table-toolbar">
        <div>
          <p className="eyebrow">Production outreach</p>
          <h2>Проверка и постоянная очередь писем</h2>
          <p className="muted">
            Одобрение выполняется вручную. Отправка — последовательно через защищённый processor.
          </p>
        </div>
        <div className="outreach-toolbar-actions">
          <button disabled={!campaignId || pending !== null} onClick={previewBulkApprove} type="button">
            Одобрить всё
          </button>
          <button
            className="primary-button"
            disabled={maxBatch === 0 || pending !== null || readiness?.queue_paused}
            onClick={() => {
              setBatchSize(batchOptions[0] ?? maxBatch);
              setShowBatchConfirm(true);
            }}
            type="button"
          >
            Отправить всем одобренным
          </button>
        </div>
      </div>

      {readiness && !readiness.email_test_mode ? (
        <div className="production-send-warning" role="alert">
          <strong>РЕАЛЬНАЯ ОТПРАВКА ВКЛЮЧЕНА</strong>
          <span>Письма будут отправлены фактическим получателям.</span>
        </div>
      ) : null}

      {readiness ? (
        <div className="outreach-readiness">
          <h3>Готовность кампании</h3>
          <div className="outreach-metrics">
            <div><span>SMTP</span><strong>{readiness.smtp_connected ? "Подключён" : "Недоступен"}</strong></div>
            <div><span>Режим</span><strong>{readiness.mode_label}</strong></div>
            <div><span>Одобрено</span><strong>{readiness.approved}</strong></div>
            <div><span>В очереди</span><strong>{readiness.queued}</strong></div>
            <div><span>Отправлено сегодня</span><strong>{readiness.sent_today} из {readiness.daily_limit}</strong></div>
            <div><span>Доступно сейчас</span><strong>{readiness.daily_remaining}</strong></div>
            <div><span>Уже запланировано</span><strong>{readiness.queued_for_today}</strong></div>
          </div>
          {readiness.blockers.length ? (
            <p className="outreach-warning">{readiness.blockers.join(" · ")}</p>
          ) : (
            <p className="outreach-message">Очередь готова к постановке писем.</p>
          )}
        </div>
      ) : null}

      <div className="outreach-metrics">
        <div><span>Всего</span><strong>{metrics.total}</strong></div>
        <div><span>Требуют проверки</span><strong>{metrics.review}</strong></div>
        <div><span>Одобрено</span><strong>{metrics.approved}</strong></div>
        <div><span>В очереди</span><strong>{metrics.queued}</strong></div>
        <div><span>Отправляется</span><strong>{metrics.sending}</strong></div>
        <div><span>Отправлено</span><strong>{metrics.sent}</strong></div>
        <div><span>Ошибки</span><strong>{metrics.failed}</strong></div>
      </div>

      <div className="outreach-filter-row">
        {filters.map((item) => (
          <button
            className={filter === item.id ? "active" : undefined}
            key={item.id}
            onClick={() => setFilter(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="outreach-toolbar-actions">
        <button disabled={pending !== null} onClick={() => control(readiness?.queue_paused ? "resume" : "pause")} type="button">
          {readiness?.queue_paused ? "Продолжить отправку" : "Поставить очередь на паузу"}
        </button>
        <button disabled={metrics.queued === 0 || pending !== null} onClick={() => control("cancel")} type="button">
          Отменить неотправленные
        </button>
        <button disabled={metrics.failed === 0 || pending !== null} onClick={() => control("retry")} type="button">
          Повторить ошибочные
        </button>
      </div>

      {message ? <p className="outreach-message" role="status">{message}</p> : null}
      {error ? <p className="outreach-error" role="alert">{error}</p> : null}

      {bulkPreview ? (
        <div className="outreach-confirm">
          <h3>Подтверждение массового одобрения</h3>
          <p><strong>Будет одобрено: {bulkPreview.eligible_count}</strong></p>
          <p>Без корректного письма: {bulkPreview.skipped.invalid_message ?? 0}</p>
          <p>Уже писали раньше: {bulkPreview.skipped.already_contacted ?? 0}</p>
          <p>Stop-list: {bulkPreview.skipped.stop_list ?? 0}</p>
          <div>
            <button onClick={() => setBulkPreview(null)} type="button">Отмена</button>
            <button className="primary-button" disabled={pending !== null} onClick={executeBulkApprove} type="button">
              Одобрить {bulkPreview.eligible_count}
            </button>
          </div>
        </div>
      ) : null}

      {showBatchConfirm && readiness ? (
        <div className="outreach-confirm production-confirm">
          <h3>{readiness.email_test_mode ? "ТЕСТОВАЯ ОТПРАВКА" : "РЕАЛЬНАЯ ОТПРАВКА"}</h3>
          <p>Одобрено писем: {metrics.approved}</p>
          <p>Отправлено сегодня: {readiness.sent_today}</p>
          <p>Дневной лимит: {readiness.daily_limit}</p>
          <p>Останется одобренными: {Math.max(0, metrics.approved - batchSize)}</p>
          <p>Письма будут обработаны по одному с паузой 5–10 минут.</p>
          <div className="batch-options">
            {batchOptions.map((value) => (
              <button className={batchSize === value ? "active" : undefined} key={value} onClick={() => setBatchSize(value)} type="button">
                {value}
              </button>
            ))}
          </div>
          <div>
            <button onClick={() => setShowBatchConfirm(false)} type="button">Отмена</button>
            <button className="primary-button" disabled={pending !== null || batchSize < 1} onClick={scheduleBatch} type="button">
              Поставить в очередь: {batchSize}
            </button>
          </div>
        </div>
      ) : null}

      {!campaignId ? (
        <p className="empty-state">Откройте или запустите кампанию.</p>
      ) : visibleEntries.length === 0 ? (
        <p className="empty-state">В этом разделе писем нет.</p>
      ) : (
        <div className="outreach-queue-layout">
          <div className="outreach-lead-cards">
            {visibleEntries.map((entry) => (
              <article
                className={`outreach-lead-card outreach-card-${entry.status} ${
                  entry.id === selectedEntry?.id ? "selected" : ""
                }`}
                key={entry.id}
              >
                <button className="outreach-card-main" onClick={() => selectEntry(entry)} type="button">
                  <span className="outreach-card-heading">
                    <strong>{entry.company_name}</strong>
                    <span className={`outreach-status outreach-status-${entry.status}`}>
                      {outreachStatusLabels[entry.status]}
                    </span>
                  </span>
                  <span>Email: {entry.email || "не найден"}</span>
                  <span>Сигнал: {entry.signal.title || "сохранён"}</span>
                  {entry.status === "queued" ? (
                    <span>Запланировано: {formatDate(entry.scheduled_at)} · позиция {entry.queue_position ?? "—"}</span>
                  ) : null}
                  {entry.status === "sent" ? <span>Отправлено: {formatDate(entry.sent_at)}</span> : null}
                  {entry.last_error ? <span className="outreach-row-error">{entry.last_error}</span> : null}
                </button>
                {["draft", "needs_review", "paused", "failed"].includes(entry.status) ? (
                  <button disabled={pending === entry.id} onClick={() => approve(entry)} type="button">Одобрить</button>
                ) : null}
                {entry.status === "approved" ? (
                  <button
                    disabled={pending === entry.id}
                    onClick={() => patchEntry(entry.id, { status: "needs_review", note: "Одобрение отменено пользователем" }).then(() => setMessage("Одобрение отменено."))}
                    type="button"
                  >
                    Отменить одобрение
                  </button>
                ) : null}
              </article>
            ))}
          </div>

          {selectedEntry ? (
            <aside className="outreach-editor">
              <div>
                <p className="eyebrow">Карточка лида</p>
                <h3>{selectedEntry.company_name}</h3>
                <p className="muted">Текущий этап: {outreachStatusLabels[selectedEntry.status]}</p>
              </div>
              <dl className="outreach-card-details">
                <div><dt>Коммерческий сигнал</dt><dd>{selectedEntry.signal.detail || selectedEntry.signal.title || "—"}</dd></div>
                <div>
                  <dt>Официальный сайт</dt>
                  <dd>
                    {selectedEntry.company_website ? (
                      <a href={selectedEntry.company_website} rel="noreferrer" target="_blank">
                        {selectedEntry.company_website}
                      </a>
                    ) : "—"}
                  </dd>
                </div>
                <div><dt>Контакт</dt><dd>{selectedEntry.recipient_name || selectedEntry.recipient_role || "Persona / общий вход"}</dd></div>
                <div><dt>Качество email</dt><dd>{selectedEntry.readiness}</dd></div>
                <div><dt>Последнее изменение</dt><dd>{formatDate(selectedEntry.updated_at)}</dd></div>
                <div><dt>Отправлено</dt><dd>{formatDate(selectedEntry.sent_at)}</dd></div>
                <div><dt>SMTP ID</dt><dd>{selectedEntry.provider_message_id || "—"}</dd></div>
              </dl>
              <label>
                <span>Email</span>
                <input disabled={["queued", "sending", "sent"].includes(selectedEntry.status)} value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                <span>Тема письма</span>
                <input disabled={["queued", "sending", "sent"].includes(selectedEntry.status)} value={subject} onChange={(event) => setSubject(event.target.value)} />
              </label>
              <label>
                <span>Текст письма</span>
                <textarea disabled={["queued", "sending", "sent"].includes(selectedEntry.status)} rows={12} value={body} onChange={(event) => setBody(event.target.value)} />
              </label>
              {!["queued", "sending", "sent"].includes(selectedEntry.status) ? (
                <button disabled={pending === selectedEntry.id} onClick={saveEdit} type="button">Сохранить изменения</button>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}
