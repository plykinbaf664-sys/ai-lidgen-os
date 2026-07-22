"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatUnknownError } from "@/lib/leadgen/error-format";
import { outreachStatusLabels } from "@/lib/leadgen/outreach-status";
import {
  getCommercialSignalTypeLabel,
  NO_VERIFIED_COMMERCIAL_SIGNAL,
  validateCommercialSignalCandidate,
} from "@/lib/leadgen/signals/commercial-signal-validator";
import type {
  OutreachOperationalState,
  OutreachQueueEntry,
  OutreachReadiness,
  ProductionDiscoveryStats,
} from "@/lib/leadgen/types";

type ApiError = { success: false; error?: unknown };
type QueueResponse =
  | {
      success: true;
      entries: OutreachQueueEntry[];
      operational: OutreachOperationalState;
      daily: {
        sent_today: number;
        daily_limit: number;
        daily_remaining: number;
      };
    }
  | ApiError;
type EntryResponse = { success: true; entry: OutreachQueueEntry } | ApiError;
type ReadinessResponse =
  | { success: true; readiness: OutreachReadiness; smtp_message: string }
  | ApiError;
type ImapDiagnostic = {
  status: string;
  message: string;
  dns_resolved: boolean;
  socket_connected: boolean;
  tls_connected: boolean;
  authenticated: boolean;
  mailbox_opened: boolean;
};
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
      processor: {
        status:
          | "sent"
          | "failed"
          | "idle"
          | "paused"
          | "daily_limit_reached"
          | "smtp_unavailable"
          | "error";
        entry: OutreachQueueEntry | null;
        error?: string;
      };
      daily: {
        sent_today: number;
        daily_limit: number;
        daily_remaining: number;
        queued_for_today: number;
      };
    }
  | ApiError;
type FollowupResponse =
  | {
      success: true;
      entries: OutreachQueueEntry[];
      summary: {
        pending_reply_check: number;
        reply_found: number;
        eligible: number;
        needs_review: number;
        approved: number;
        queued: number;
        sending: number;
        sent: number;
        skipped: number;
        failed: number;
        reply_checks_verified: number;
        queue_paused: boolean;
        eligibility_reasons: Record<string, number>;
        next_eligible_at: string | null;
        eligibility_diagnostics: Array<{
          parent_outreach_id: string;
          lead_id: string;
          campaign_id: string;
          company_name: string;
          eligible: boolean;
          reason: string | null;
          sent_at: string | null;
          smtp_message_id_present: boolean;
          reply_check_status: string;
          eligible_at: string | null;
          remaining_seconds: number;
        }>;
        min_interval_hours: number;
      };
      daily: { sent_today: number; daily_limit: number; daily_remaining: number };
    }
  | ApiError;

type QueueFilter =
  | "all"
  | "review"
  | "approved"
  | "queued"
  | "sent"
  | "failed"
  | "rejected";

const filters: Array<{ id: QueueFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "review", label: "Требуют проверки" },
  { id: "approved", label: "Одобрено" },
  { id: "queued", label: "В очереди" },
  { id: "sent", label: "Отправлено" },
  { id: "failed", label: "Ошибки" },
  { id: "rejected", label: "Отклонено" },
];

async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Некорректный ответ сервера (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

function getError(data: ApiError) {
  return formatUnknownError(data.error, "Не удалось выполнить действие");
}

function matchesFilter(entry: OutreachQueueEntry, filter: QueueFilter) {
  if (filter === "all") return true;
  if (filter === "review") return ["draft", "needs_review"].includes(entry.status);
  if (filter === "approved") return entry.status === "approved";
  if (filter === "queued") return ["queued", "sending"].includes(entry.status);
  if (filter === "sent") return entry.status === "sent";
  if (filter === "failed") return entry.status === "failed";
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

function formatFollowupWait(value?: string | null) {
  if (!value) return null;
  const remainingMinutes = Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 60_000));
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

const followupReasonLabels: Record<string, string> = {
  interval_not_reached: "не прошёл интервал",
  reply_detected: "ответ уже получен",
  missing_parent_message_id: "нет Message-ID первого письма",
  already_followed_up: "дожим уже создан",
  stop_list: "адрес в stop-list",
  failed_parent: "ошибка первого письма",
  rejected: "лид отклонён",
  duplicate: "дубликат",
  missing_recipient: "нет получателя",
  reply_check_unavailable: "ответ не удалось проверить",
};

function isOverdue(
  entry: OutreachQueueEntry,
  operational: OutreachOperationalState | null,
) {
  const scheduledAt = entry.next_attempt_at ?? entry.scheduled_at;
  return Boolean(
    entry.status === "queued" &&
      scheduledAt &&
      operational?.state === "stalled" &&
      Date.parse(scheduledAt) < Date.parse(operational.checked_at),
  );
}

function getOperationalCopy(state: OutreachOperationalState | null) {
  if (!state) {
    return {
      title: "Проверяем очередь",
      detail: "Получаем актуальное состояние.",
    };
  }
  if (state.state === "stalled") {
    return {
      title: "Последние письма не отправлены",
      detail: `${state.overdue_count} ${
        state.overdue_count === 1 ? "письмо просрочено" : "письма просрочены"
      }. Обработчик очереди не запускается; самое раннее ожидало отправки ${formatDate(
        state.oldest_overdue_at,
      )}.`,
    };
  }
  if (state.state === "paused") {
    return {
      title: "Очередь на паузе",
      detail: "Новые письма не отправляются до продолжения очереди.",
    };
  }
  if (state.state === "sending") {
    return {
      title: "Письмо отправляется",
      detail: "Обработчик занят одним письмом. Статус обновится автоматически.",
    };
  }
  if (state.state === "waiting") {
    return {
      title: "Очередь работает по расписанию",
      detail: `Следующее письмо запланировано на ${formatDate(
        state.next_scheduled_at,
      )}.`,
    };
  }
  if (state.state === "ready") {
    return {
      title: "Есть одобренные письма",
      detail: "Выберите количество и запустите последовательную отправку.",
    };
  }
  return {
    title: "Очередь пуста",
    detail: "Нет писем, ожидающих отправки.",
  };
}

export function EmailOutreachQueue({
  campaignId,
  discoveryStats,
}: {
  campaignId: string | null;
  discoveryStats?: ProductionDiscoveryStats | null;
}) {
  const [entries, setEntries] = useState<OutreachQueueEntry[]>([]);
  const [readiness, setReadiness] = useState<OutreachReadiness | null>(null);
  const [operational, setOperational] =
    useState<OutreachOperationalState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
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
  const [followups, setFollowups] = useState<OutreachQueueEntry[]>([]);
  const [followupSummary, setFollowupSummary] = useState<Extract<FollowupResponse, { success: true }>["summary"] | null>(null);
  const [followupBatchSize, setFollowupBatchSize] = useState(1);
  const [imapDiagnostic, setImapDiagnostic] = useState<ImapDiagnostic | null>(null);

  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) => matchesFilter(entry, filter))
        .sort((left, right) => {
          const leftAt =
            left.status === "sent"
              ? left.sent_at
              : left.next_attempt_at ?? left.scheduled_at ?? left.updated_at;
          const rightAt =
            right.status === "sent"
              ? right.sent_at
              : right.next_attempt_at ?? right.scheduled_at ?? right.updated_at;
          const direction = filter === "queued" ? 1 : -1;
          return (
            (Date.parse(leftAt ?? left.created_at) -
              Date.parse(rightAt ?? right.created_at)) *
            direction
          );
        }),
    [entries, filter],
  );
  const selectedEntry = useMemo(
    () => [...visibleEntries, ...followups].find((entry) => entry.id === selectedId) ?? null,
    [selectedId, visibleEntries, followups],
  );
  const selectedCommercialSignal = useMemo(
    () =>
      selectedEntry
        ? validateCommercialSignalCandidate({
            text: selectedEntry.signal.detail,
            sourceUrl: selectedEntry.signal.source_url,
            sourceTitle: selectedEntry.signal.title,
            confidence: selectedEntry.signal.confidence_score,
            pipelineSignalType: selectedEntry.signal.type,
          })
        : null,
    [selectedEntry],
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
      rejected: entries.filter((entry) => entry.status === "rejected").length,
    }),
    [entries],
  );

  const selectEntry = useCallback((entry: OutreachQueueEntry) => {
    setSelectedId(entry.id);
    setSubject(entry.subject);
    setBody(entry.body);
    setEmail(entry.email);
  }, []);

  const loadFollowups = useCallback(async () => {
    const url = campaignId
      ? `/api/leadgen/followups?campaignId=${encodeURIComponent(campaignId)}`
      : "/api/leadgen/followups";
    const response = await fetch(url);
    const data = await readJson<FollowupResponse>(response);
    if (!response.ok || !data.success) throw new Error(getError(data as ApiError));
    setFollowups(data.entries);
    setFollowupSummary(data.summary);
    setFollowupBatchSize((value) => Math.max(1, Math.min(value, data.summary.approved || 1, data.daily.daily_remaining || 1)));
  }, [campaignId]);

  const load = useCallback(async () => {
    setError(null);
    const queueUrl = campaignId
      ? `/api/leadgen/outreach?campaignId=${encodeURIComponent(campaignId)}`
      : "/api/leadgen/outreach";
    const [queueResponse, readinessResponse] = await Promise.all([
      fetch(queueUrl),
      fetch("/api/leadgen/outreach/readiness"),
    ]);
    const queue = await readJson<QueueResponse>(queueResponse);
    const ready = await readJson<ReadinessResponse>(readinessResponse);
    if (!queueResponse.ok || !queue.success) {
      throw new Error(getError(queue as ApiError));
    }
    setEntries(queue.entries);
    setOperational(queue.operational);
    setLastUpdated(new Date().toISOString());
    if (ready.success) {
      setReadiness({
        ...ready.readiness,
        sent_today: queue.daily.sent_today,
        daily_limit: queue.daily.daily_limit,
        daily_remaining: queue.daily.daily_remaining,
      });
    }
    if (selectedId && !queue.entries.some((entry) => entry.id === selectedId)) {
      // Follow-up entries are loaded separately and may own the editor selection.
    }
    await loadFollowups();
  }, [campaignId, selectedId, loadFollowups]);

  useEffect(() => {
    let active = true;
    const queueRequest = campaignId
      ? fetch("/api/leadgen/outreach/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId }),
        })
      : fetch("/api/leadgen/outreach");
    const followupUrl = campaignId
      ? `/api/leadgen/followups?campaignId=${encodeURIComponent(campaignId)}`
      : "/api/leadgen/followups";
    Promise.all([
      queueRequest,
      fetch("/api/leadgen/outreach/readiness"),
      fetch(followupUrl),
    ])
      .then(async ([queueResponse, readinessResponse, followupResponse]) => {
        const queue = await readJson<QueueResponse>(queueResponse);
        const ready = await readJson<ReadinessResponse>(readinessResponse);
        const followup = await readJson<FollowupResponse>(followupResponse);
        if (!queue.success) throw new Error(getError(queue));
        if (!followup.success) throw new Error(getError(followup));
        if (!active) return;
        setEntries(queue.entries);
        setFollowups(followup.entries);
        setFollowupSummary(followup.summary);
        setOperational(queue.operational);
        setLastUpdated(new Date().toISOString());
        if (ready.success) {
          setReadiness({
            ...ready.readiness,
            sent_today: queue.daily.sent_today,
            daily_limit: queue.daily.daily_limit,
            daily_remaining: queue.daily.daily_remaining,
          });
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Ошибка загрузки очереди");
      });
    return () => {
      active = false;
    };
  }, [campaignId, selectEntry]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const queueUrl = campaignId
          ? `/api/leadgen/outreach?campaignId=${encodeURIComponent(campaignId)}`
          : "/api/leadgen/outreach";
        const response = await fetch(queueUrl);
        const data = await readJson<QueueResponse>(response);
        if (!response.ok || !data.success) {
          throw new Error(getError(data as ApiError));
        }
        if (!active) return;
        setEntries(data.entries);
        setOperational(data.operational);
        setLastUpdated(new Date().toISOString());
        setReadiness((current) =>
          current
            ? {
                ...current,
                sent_today: data.daily.sent_today,
                daily_limit: data.daily.daily_limit,
                daily_remaining: data.daily.daily_remaining,
              }
            : current,
        );
        await loadFollowups();
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Не удалось обновить состояние очереди",
          );
        }
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [campaignId, loadFollowups]);

  async function runFollowupAction(
    action: "scan" | "generate" | "bulk-approve" | "batch",
    payload: Record<string, unknown> = {},
  ) {
    setPending(`followup-${action}`);
    setError(null);
    try {
      const response = await fetch(`/api/leadgen/followups/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ success: boolean; error?: string; generated?: number; approved?: number; queued?: unknown[]; reply_found?: number }>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.error, "Действие не выполнено"));
      setMessage(
        action === "scan" ? `Ответы проверены. Найдено ответов: ${data.reply_found ?? 0}.` :
        action === "generate" ? `Сгенерировано дожимов: ${data.generated ?? 0}.` :
        action === "bulk-approve" ? `Одобрено дожимов: ${data.approved ?? 0}.` :
        `В очередь поставлено: ${data.queued?.length ?? 0}.`,
      );
      await loadFollowups();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка Follow-up Engine");
    } finally {
      setPending(null);
    }
  }

  async function checkImapConnection() {
    setPending("imap-check");
    setError(null);
    try {
      const response = await fetch("/api/leadgen/imap/check", { method: "POST" });
      const data = await readJson<{
        success: boolean;
        diagnostic?: ImapDiagnostic;
        error?: unknown;
      }>(response);
      if (!data.diagnostic) {
        throw new Error(formatUnknownError(data.error, "Не удалось проверить IMAP."));
      }
      setImapDiagnostic(data.diagnostic);
      if (data.success) setMessage("IMAP подключён: DNS, TLS, авторизация и INBOX доступны.");
      else setError(data.diagnostic.message);
      await load();
    } catch (caught) {
      setError(formatUnknownError(caught, "Не удалось проверить IMAP."));
    } finally {
      setPending(null);
    }
  }

  async function approveFollowup(entry: OutreachQueueEntry) {
    setPending(entry.id);
    try {
      const response = await fetch(`/api/leadgen/followups/${entry.id}/approve`, { method: "POST" });
      const data = await readJson<{ success: boolean; approved?: number; error?: string }>(response);
      if (!response.ok || !data.success || !data.approved) throw new Error(formatUnknownError(data.error, "Дожим не прошёл quality gate"));
      setMessage("Дожим одобрен.");
      await loadFollowups();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось одобрить дожим");
    } finally { setPending(null); }
  }

  async function controlFollowup(id: string, action: "cancel" | "retry" | "unapprove" | "skip") {
    setPending(id);
    try {
      const response = await fetch("/api/leadgen/followups/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await readJson<{ success: boolean; error?: string }>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.error, "Действие не выполнено"));
      await loadFollowups();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить follow-up");
    } finally { setPending(null); }
  }

  async function controlFollowupQueue(action: "pause" | "resume" | "cancel" | "retry") {
    setPending(`followup-${action}`);
    try {
      const response = await fetch("/api/leadgen/followups/control", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const data = await readJson<{ success: boolean; error?: string }>(response);
      if (!response.ok || !data.success) throw new Error(formatUnknownError(data.error, "Действие не выполнено"));
      await loadFollowups();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ошибка управления очередью"); }
    finally { setPending(null); }
  }

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

  async function runEntryAction(
    id: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) {
    if (pending) return;
    setPending(id);
    setError(null);
    try {
      await action();
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие");
    } finally {
      setPending(null);
    }
  }

  async function saveEdit() {
    if (!selectedEntry) return;
    setPending(selectedEntry.id);
    setError(null);
    try {
      if (selectedEntry.message_kind === "follow_up") {
        const response = await fetch(`/api/leadgen/followups/${selectedEntry.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, body, email }),
        });
        const data = await readJson<EntryResponse>(response);
        if (!response.ok || !data.success) throw new Error(getError(data as ApiError));
        await loadFollowups();
      } else {
        await patchEntry(selectedEntry.id, { subject, body, email });
      }
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
    if (batchSize < 1 || batchSize > maxBatch) return;
    setPending("batch");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/leadgen/outreach/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, count: batchSize }),
      });
      const data = await readJson<BatchResponse>(response);
      if (!response.ok || !data.success) throw new Error(getError(data as ApiError));
      setShowBatchConfirm(false);
      if (data.processor.status === "sent") {
        setMessage(
          `Отправка запущена. Первое письмо отправлено, в очереди осталось ${Math.max(
            0,
            data.queued.length - 1,
          )}.`,
        );
      } else if (
        data.processor.status === "failed" ||
        data.processor.status === "smtp_unavailable" ||
        data.processor.status === "error"
      ) {
        setError(
          data.processor.error ||
            data.processor.entry?.last_error ||
            "Первое письмо не отправлено. Проверьте статус ошибки; остальные письма сохранены в очереди.",
        );
      } else {
        setMessage(
          `Отправка запущена. В постоянной очереди: ${data.queued.length}.`,
        );
      }
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
      if (!data.success) throw new Error(formatUnknownError(data.error));
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
  const operationCopy = getOperationalCopy(operational);
  const activeFilter =
    filters.find((item) => item.id === filter) ?? filters[0];
  const nextQueued = entries
    .filter((entry) => entry.status === "queued")
    .sort(
      (left, right) =>
        Date.parse(left.next_attempt_at ?? left.scheduled_at ?? left.created_at) -
        Date.parse(
          right.next_attempt_at ?? right.scheduled_at ?? right.created_at,
        ),
    )[0];
  const dailyProgress = Math.min(
    100,
    Math.round(
      ((readiness?.sent_today ?? 0) /
        Math.max(1, readiness?.daily_limit ?? 20)) *
        100,
    ),
  );
  const filterCounts: Record<QueueFilter, number> = {
    all: metrics.total,
    review: metrics.review,
    approved: metrics.approved,
    queued: metrics.queued + metrics.sending,
    sent: metrics.sent,
    failed: metrics.failed,
    rejected: metrics.rejected,
  };

  return (
    <section className="panel outreach-queue-panel">
      <div className="table-toolbar outreach-operations-header">
        <div>
          <p className="eyebrow">Email outreach</p>
          <div className="outreach-title-row">
            <h2>Письма</h2>
            {readiness ? (
              <span
                className={`outreach-mode-badge ${
                  readiness.email_test_mode ? "test" : "production"
                }`}
              >
                {readiness.email_test_mode
                  ? "Тестовый режим"
                  : "Реальная отправка"}
              </span>
            ) : null}
          </div>
          <p className="muted">
            Проверка, очередь и результат отправки в одном месте.
          </p>
        </div>
        <div className="outreach-toolbar-actions">
          <Button
            disabled={!campaignId || metrics.review === 0 || pending !== null}
            loading={pending === "bulk-preview" || pending === "bulk-execute"}
            onClick={previewBulkApprove}
            variant="success"
          >
            Одобрить все корректные
          </Button>
        </div>
      </div>

      {(metrics.queued > 0 ||
        metrics.sending > 0 ||
        metrics.failed > 0 ||
        readiness?.queue_paused) && (
        <div className="outreach-queue-actions">
          {(metrics.queued > 0 ||
            metrics.sending > 0 ||
            readiness?.queue_paused) && (
            <Button
              disabled={pending !== null}
              loading={pending === "pause" || pending === "resume"}
              onClick={() =>
                control(readiness?.queue_paused ? "resume" : "pause")
              }
              variant="secondary"
            >
              {readiness?.queue_paused ? "Продолжить" : "Пауза"}
            </Button>
          )}
          {metrics.queued > 0 ? (
            <Button
              disabled={pending !== null}
              loading={pending === "cancel"}
              onClick={() => control("cancel")}
              variant="danger"
            >
              Отменить очередь
            </Button>
          ) : null}
          {metrics.failed > 0 ? (
            <Button
              disabled={pending !== null}
              loading={pending === "retry"}
              onClick={() => control("retry")}
              variant="success"
            >
              Повторить ошибки
            </Button>
          ) : null}
        </div>
      )}

      {readiness && !readiness.smtp_connected ? (
        <p className="outreach-error" role="alert">
          SMTP недоступен. Постановка новых писем в очередь заблокирована.
        </p>
      ) : null}
      {readiness &&
      !readiness.email_test_mode &&
      (showBatchConfirm || maxBatch > 0) ? (
        <p className="outreach-production-note">
          Реальный режим: при запуске письма уйдут указанным получателям.
        </p>
      ) : null}

      {message ? (
        <p className="outreach-message" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="outreach-error" role="alert">
          {error}
        </p>
      ) : null}

      {bulkPreview ? (
        <div className="outreach-confirm">
          <h3>Подтверждение массового одобрения</h3>
          <p><strong>Будет одобрено: {bulkPreview.eligible_count}</strong></p>
          <p>Без корректного письма: {bulkPreview.skipped.invalid_message ?? 0}</p>
          <p>Уже писали раньше: {bulkPreview.skipped.already_contacted ?? 0}</p>
          <p>Stop-list: {bulkPreview.skipped.stop_list ?? 0}</p>
          <p>Не прошли quality gate: {bulkPreview.skipped.quality_gate ?? 0}</p>
          <div>
            <Button onClick={() => setBulkPreview(null)} variant="ghost">Отмена</Button>
            <Button disabled={pending !== null} loading={pending === "bulk-approve"} onClick={executeBulkApprove} variant="primary">
              Одобрить {bulkPreview.eligible_count}
            </Button>
          </div>
        </div>
      ) : null}

      {showBatchConfirm && readiness ? (
        <div className="outreach-confirm production-confirm">
          <h3>{readiness.email_test_mode ? "ТЕСТОВАЯ ОТПРАВКА" : "РЕАЛЬНАЯ ОТПРАВКА"}</h3>
          <p>Одобрено писем: {metrics.approved}</p>
          <p>Отправлено сегодня: {readiness.sent_today}</p>
          <p>Дневной лимит: {readiness.daily_limit}</p>
          <p>Доступно к отправке сейчас: {maxBatch}</p>
          <p>Останется одобренными: {Math.max(0, metrics.approved - Math.min(batchSize, maxBatch))}</p>
          <p>Письма будут обработаны по одному с паузой 5–10 минут.</p>
          <label className="batch-slider">
            <span>
              Отправить сейчас: <strong>{batchSize}</strong>
            </span>
            <input
              aria-label="Количество писем для запуска"
              max={Math.max(1, maxBatch)}
              min="1"
              onChange={(event) => setBatchSize(Number(event.target.value))}
              step="1"
              type="range"
              value={batchSize}
            />
            <span className="batch-slider-scale">
              <small>1</small>
              <small>{maxBatch}</small>
            </span>
            {batchSize > maxBatch ? (
              <small className="batch-slider-error">
                Сейчас можно отправить максимум {maxBatch}.
              </small>
            ) : null}
          </label>
          <div>
            <Button onClick={() => setShowBatchConfirm(false)} variant="ghost">Отмена</Button>
            <Button
              disabled={
                pending !== null ||
                batchSize < 1 ||
                batchSize > maxBatch
              }
              loading={pending === "batch"}
              onClick={scheduleBatch}
              variant="primary"
            >
              {pending === "batch"
                ? "Запускаем…"
                : `Запустить отправку: ${batchSize}`}
            </Button>
          </div>
        </div>
      ) : null}

      <section className="followup-console" aria-labelledby="followup-title">
        <div className="followup-console-heading">
          <div>
            <p className="eyebrow">Follow-up Engine</p>
            <h3 id="followup-title">Дожимные письма</h3>
          </div>
          <span className={`outreach-mode-badge ${readiness?.imap_connected ? "production" : "test"}`}>
            IMAP {readiness?.imap_connected ? "подключён" : readiness?.imap_configured ? "ошибка" : "не настроен"}
          </span>
        </div>
        <dl className="followup-metrics">
          <div><dt>Проверить ответы</dt><dd>{followupSummary?.pending_reply_check ?? 0}</dd></div>
          <div><dt>Ответ найден</dt><dd>{followupSummary?.reply_found ?? 0}</dd></div>
          <div><dt>Готовы к генерации</dt><dd>{followupSummary?.eligible ?? 0}</dd></div>
          <div><dt>Требуют проверки</dt><dd>{followupSummary?.needs_review ?? 0}</dd></div>
          <div><dt>Одобрено</dt><dd>{followupSummary?.approved ?? 0}</dd></div>
          <div><dt>В очереди</dt><dd>{followupSummary?.queued ?? 0}</dd></div>
          <div><dt>Отправляется</dt><dd>{followupSummary?.sending ?? 0}</dd></div>
          <div><dt>Отправлено</dt><dd>{followupSummary?.sent ?? 0}</dd></div>
          <div><dt>Ошибки</dt><dd>{followupSummary?.failed ?? 0}</dd></div>
        </dl>
        {followupSummary?.eligible === 0 && followupSummary.next_eligible_at ? (
          <p className="muted">
            Дожимы станут доступны через {formatFollowupWait(followupSummary.next_eligible_at)}.
          </p>
        ) : null}
        {followupSummary?.eligibility_diagnostics.some((item) => !item.eligible) ? (
          <details className="followup-eligibility-details">
            <summary>Почему письма пока не готовы</summary>
            <ul>
              {followupSummary!.eligibility_diagnostics
                .filter((item) => !item.eligible)
                .map((item) => (
                  <li key={item.parent_outreach_id}>
                    {item.company_name}: {followupReasonLabels[item.reason ?? ""] ?? item.reason}
                    {item.reason === "interval_not_reached" && item.eligible_at
                      ? ` · через ${formatFollowupWait(item.eligible_at)}`
                      : ""}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
        {!readiness?.imap_connected ? (
          <p className="copy-quality-warning">{readiness?.imap_message || "Ответы не проверены: реальная отправка follow-up заблокирована."}</p>
        ) : null}
        {imapDiagnostic ? (
          <p className="muted">
            DNS {imapDiagnostic.dns_resolved ? "✓" : "—"} · TCP {imapDiagnostic.socket_connected ? "✓" : "—"} · TLS {imapDiagnostic.tls_connected ? "✓" : "—"} · Авторизация {imapDiagnostic.authenticated ? "✓" : "—"} · INBOX {imapDiagnostic.mailbox_opened ? "✓" : "—"}
          </p>
        ) : null}
        <div className="followup-actions">
          <Button disabled={pending !== null} loading={pending === "imap-check"} onClick={checkImapConnection} variant="secondary">Проверить IMAP-подключение</Button>
          <Button disabled={pending !== null} loading={pending === "followup-scan"} onClick={() => runFollowupAction("scan")} variant="secondary">Проверить входящие ответы</Button>
          <Button disabled={pending !== null || !followupSummary?.eligible} loading={pending === "followup-generate"} onClick={() => runFollowupAction("generate")} variant="secondary">Сгенерировать дожимы</Button>
          <Button disabled={pending !== null || !followupSummary?.needs_review} loading={pending === "followup-bulk-approve"} onClick={() => runFollowupAction("bulk-approve")} variant="success">Одобрить все корректные</Button>
          <Button disabled={pending !== null} onClick={() => controlFollowupQueue(followupSummary?.queue_paused ? "resume" : "pause")} variant="ghost">{followupSummary?.queue_paused ? "Продолжить очередь" : "Поставить очередь на паузу"}</Button>
          {(followupSummary?.queued ?? 0) > 0 ? <Button disabled={pending !== null} onClick={() => controlFollowupQueue("cancel")} variant="danger">Отменить неотправленные</Button> : null}
          {(followupSummary?.failed ?? 0) > 0 ? <Button disabled={pending !== null} onClick={() => controlFollowupQueue("retry")} variant="secondary">Повторить ошибочные</Button> : null}
        </div>
        {(followupSummary?.approved ?? 0) > 0 ? (
          <div className="followup-send-control">
            <label><span>Отправить одобренные</span><strong>{followupBatchSize}</strong></label>
            <input aria-label="Количество follow-up писем" min="1" max={Math.max(1, Math.min(followupSummary?.approved ?? 1, readiness?.daily_remaining ?? 1))} type="range" value={followupBatchSize} onChange={(event) => setFollowupBatchSize(Number(event.target.value))} />
            <div className="delivery-quick-values">
              {[5].filter((value) => value <= Math.min(followupSummary?.approved ?? 0, readiness?.daily_remaining ?? 0)).map((value) => <Button key={value} onClick={() => setFollowupBatchSize(value)} variant="ghost">{value}</Button>)}
              <Button onClick={() => setFollowupBatchSize(Math.max(1, Math.min(followupSummary?.approved ?? 1, readiness?.daily_remaining ?? 1)))} variant="ghost">Все доступные</Button>
            </div>
            <Button disabled={pending !== null || !readiness?.imap_connected || (readiness?.daily_remaining ?? 0) < 1} loading={pending === "followup-batch"} onClick={() => runFollowupAction("batch", { count: followupBatchSize })} variant="primary">Отправить одобренные дожимы</Button>
          </div>
        ) : null}
      </section>

      {entries.length === 0 ? (
        <p className="empty-state">Писем пока нет.</p>
      ) : (
        <div className="outreach-queue-layout">
          <div className="outreach-list-column">
            <div className="outreach-list-heading">
              <h3>{activeFilter.label}</h3>
              <span>{visibleEntries.length}</span>
            </div>
            {visibleEntries.length === 0 ? (
              <p className="empty-state">В этом разделе писем нет.</p>
            ) : (
              <div className="outreach-lead-cards">
                {visibleEntries.map((entry) => (
                  <article
                    className={`outreach-lead-card outreach-card-${entry.status} ${
                      entry.id === selectedEntry?.id ? "selected" : ""
                    }`}
                    key={entry.id}
                  >
                    <div className="outreach-card-main">
                      <span className="outreach-card-heading">
                        <strong>{entry.company_name}</strong>
                        <span className={`outreach-status outreach-status-${entry.status}`}>
                          {outreachStatusLabels[entry.status]}
                        </span>
                      </span>
                      {entry.company_website ? <a href={entry.company_website} rel="noreferrer" target="_blank">{entry.company_website}</a> : null}
                      <dl className="lead-card-summary">
                        <div><dt>Коммерческий сигнал</dt><dd>{validateCommercialSignalCandidate({ text: entry.signal.detail, sourceUrl: entry.signal.source_url, sourceTitle: entry.signal.title, confidence: entry.signal.confidence_score, pipelineSignalType: entry.signal.type })?.summary ?? NO_VERIFIED_COMMERCIAL_SIGNAL}</dd></div>
                        <div><dt>Контакт</dt><dd>{entry.recipient_name || entry.recipient_role || "Общий вход"} · {entry.email || "email не найден"}</dd></div>
                        <div><dt>Тема</dt><dd>{entry.subject || "Не подготовлена"}</dd></div>
                        <div><dt>Письмо</dt><dd className="lead-copy-preview">{entry.body || "Не подготовлено"}</dd></div>
                      </dl>
                      {entry.status === "queued" ? (
                        <span className={isOverdue(entry, operational) ? "outreach-row-error" : undefined}>
                          {isOverdue(entry, operational) ? "Не отправлено" : "Запланировано"}:{" "}
                          {formatDate(entry.next_attempt_at ?? entry.scheduled_at)} · позиция{" "}
                          {entry.queue_position ?? "—"}
                        </span>
                      ) : null}
                      {entry.status === "sending" ? <span>SMTP-отправка выполняется сейчас</span> : null}
                      {entry.status === "sent" ? (
                        <span>
                          Отправлено: {formatDate(entry.sent_at)} ·{" "}
                          {entry.sent_copy_saved_at
                            ? "копия есть в Яндекс.Почте"
                            : "копия в Яндекс.Почте не сохранена"}
                        </span>
                      ) : null}
                      {entry.sent_copy_error ? (
                        <span className="outreach-row-error">
                          Архив отправленных: {entry.sent_copy_error}
                        </span>
                      ) : null}
                      {entry.last_error ? <span className="outreach-row-error">{entry.last_error}</span> : null}
                      {entry.status === "sent" ? (
                        <div className="followup-timeline">
                          <h4>История касаний</h4>
                          <div className="timeline-event completed"><strong>Первое письмо</strong><span>Отправлено: {formatDate(entry.sent_at)}</span><small>Message-ID: {entry.provider_message_id || "—"}</small></div>
                          <div className={`timeline-event ${entry.reply_detected_at ? "blocked" : entry.reply_check_status === "verified" ? "completed" : "pending"}`}>
                            <strong>Проверка ответа</strong>
                            <span>{entry.reply_detected_at ? `Ответ получен: ${formatDate(entry.reply_detected_at)}` : entry.reply_check_status === "verified" ? `Ответ не найден: ${formatDate(entry.reply_checked_at)}` : "Ответ ещё не проверен"}</span>
                          </div>
                          {followups.filter((item) => item.parent_outreach_id === entry.id).map((followup) => (
                            <div className={`timeline-event timeline-${followup.status}`} key={followup.id}>
                              <strong>Дожим №{followup.followup_number ?? 1} · {outreachStatusLabels[followup.status]}</strong>
                              <span>{followup.subject}</span>
                              <small>{followup.sent_at ? `Отправлено: ${formatDate(followup.sent_at)}` : followup.scheduled_at ? `Запланировано: ${formatDate(followup.scheduled_at)}` : followup.last_error || "Ожидает действия"}</small>
                              {followup.provider_message_id ? <small>Message-ID: {followup.provider_message_id}</small> : null}
                              <div className="lead-card-actions">
                                {followup.status === "needs_review" ? <><Button onClick={() => selectEntry(followup)} variant="secondary">Открыть</Button><Button disabled={pending !== null} loading={pending === followup.id} onClick={() => approveFollowup(followup)} variant="primary">Одобрить</Button><Button disabled={pending !== null} onClick={() => controlFollowup(followup.id, "skip")} variant="danger">Пропустить</Button></> : null}
                                {followup.status === "approved" ? <><Button onClick={() => selectEntry(followup)} variant="secondary">Редактировать</Button><Button disabled={pending !== null} onClick={() => controlFollowup(followup.id, "unapprove")} variant="danger">Отменить одобрение</Button></> : null}
                                {followup.status === "queued" ? <Button disabled={pending !== null} onClick={() => controlFollowup(followup.id, "cancel")} variant="danger">Отменить до отправки</Button> : null}
                                {followup.status === "failed" ? <Button disabled={pending !== null} onClick={() => controlFollowup(followup.id, "retry")} variant="success">Повторить</Button> : null}
                              </div>
                            </div>
                          ))}
                          {entry.reply_detected_at ? <div className="timeline-event blocked"><strong>Follow-up заблокирован</strong><span>Получатель уже ответил.</span></div> : null}
                        </div>
                      ) : null}
                    </div>
                    {["draft", "needs_review", "paused"].includes(entry.status) ? (
                      <div className="lead-card-actions">
                        <Button onClick={() => selectEntry(entry)} variant="secondary">Открыть письмо</Button>
                        <Button disabled={pending !== null} loading={pending === entry.id} onClick={() => approve(entry)} variant="primary">Одобрить</Button>
                        <Button disabled={pending !== null} loading={pending === entry.id} onClick={() => runEntryAction(entry.id, () => patchEntry(entry.id, { status: "rejected" }), "Письмо отклонено.")} variant="danger">Отклонить</Button>
                      </div>
                    ) : null}
                    {entry.status === "approved" ? (
                      <div className="lead-card-actions"><span className="action-confirmed">✓ Одобрено</span><Button onClick={() => selectEntry(entry)} variant="secondary">Редактировать</Button><Button disabled={pending !== null} loading={pending === entry.id} onClick={() => runEntryAction(entry.id, () => patchEntry(entry.id, { status: "needs_review", note: "Одобрение отменено пользователем" }), "Одобрение отменено.")} variant="danger">Отменить одобрение</Button></div>
                    ) : null}
                    {entry.status === "queued" ? <div className="lead-card-actions"><Button disabled={pending !== null} loading={pending === entry.id} onClick={() => runEntryAction(entry.id, () => patchEntry(entry.id, {}, `/api/leadgen/outreach/${entry.id}/cancel`), "Письмо снято с очереди и осталось одобренным.")} variant="danger">Отменить до отправки</Button></div> : null}
                    {entry.status === "failed" ? <div className="lead-card-actions"><Button disabled={pending !== null} loading={pending === entry.id} onClick={() => runEntryAction(entry.id, () => patchEntry(entry.id, {}, `/api/leadgen/outreach/${entry.id}/retry`), "Ошибка сброшена. Письмо снова одобрено.")} variant="success">Повторить</Button></div> : null}
                    {entry.quality_gate_passed !== true && ["draft", "needs_review"].includes(entry.status) ? <p className="copy-quality-warning">Требуется ручная проверка текста: quality gate не пройден.</p> : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="outreach-delivery-dashboard">
            <div className="delivery-dashboard-heading">
              <div>
                <p className="eyebrow">Текущая картина</p>
                <h3>Отправки</h3>
              </div>
              <span className={`delivery-live-state delivery-live-${operational?.state ?? "empty"}`}>
                {operationCopy.title}
              </span>
            </div>

            <div className="delivery-today">
              <div>
                <strong>{readiness?.sent_today ?? 0}</strong>
                <span>из {readiness?.daily_limit ?? 20} отправлено сегодня</span>
              </div>
              <div className="delivery-progress" aria-label={`Выполнено ${dailyProgress}% дневного лимита`}>
                <span style={{ width: `${dailyProgress}%` }} />
              </div>
            </div>

            <dl className="delivery-summary-grid">
              <div><dt>Найдено</dt><dd>{discoveryStats?.new_unique_companies ?? entries.length}</dd></div>
              <div><dt>С email</dt><dd>{entries.length}</dd></div>
              <div><dt>К проверке</dt><dd>{metrics.review}</dd></div>
              <div><dt>Одобрено</dt><dd>{metrics.approved}</dd></div>
              <div><dt>В очереди</dt><dd>{metrics.queued}</dd></div>
              <div><dt>Отправляется</dt><dd>{metrics.sending}</dd></div>
              <div><dt>Ошибки</dt><dd>{metrics.failed}</dd></div>
              <div><dt>Запланировано сегодня</dt><dd>{readiness?.queued_for_today ?? 0}</dd></div>
              <div><dt>Можно поставить ещё</dt><dd>{readiness?.daily_remaining ?? 0}</dd></div>
            </dl>

            {metrics.approved > 0 ? (
              <div className="delivery-launch-control">
                <label><span>Отправить сейчас</span><strong>{Math.min(batchSize, maxBatch)}</strong></label>
                <input aria-label="Количество писем" max={Math.max(1, maxBatch)} min="1" onChange={(event) => setBatchSize(Number(event.target.value))} type="range" value={Math.min(Math.max(1, batchSize), Math.max(1, maxBatch))} />
                <div className="delivery-quick-values">
                  {[5, 10].filter((value) => value <= maxBatch).map((value) => <Button key={value} onClick={() => setBatchSize(value)} variant="ghost">{value}</Button>)}
                  <Button onClick={() => setBatchSize(maxBatch)} variant="ghost">Все доступные</Button>
                </div>
                <Button disabled={maxBatch < 1 || pending !== null || readiness?.queue_paused || !readiness?.smtp_connected} onClick={() => setShowBatchConfirm(true)} variant="primary">Запустить отправку</Button>
              </div>
            ) : null}

            <label className="delivery-filter">
              <span>Показать письма</span>
              <select
                value={filter}
                onChange={(event) => {
                  const nextFilter = event.target.value as QueueFilter;
                  const nextEntry = entries.find((entry) =>
                    matchesFilter(entry, nextFilter),
                  );
                  setFilter(nextFilter);
                  if (nextEntry) selectEntry(nextEntry);
                }}
              >
                {filters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} — {filterCounts[item.id]}
                  </option>
                ))}
              </select>
            </label>

            <div className="delivery-next">
              <span>Следующее письмо</span>
              {nextQueued ? (
                <>
                  <strong>{nextQueued.company_name}</strong>
                  <small>{formatDate(nextQueued.next_attempt_at ?? nextQueued.scheduled_at)}</small>
                </>
              ) : (
                <strong>Очередь пуста</strong>
              )}
            </div>

            <p className={`delivery-operation-note delivery-note-${operational?.state ?? "empty"}`}>
              {operationCopy.detail}
            </p>
            <div className="delivery-system-line">
              <span className={readiness?.smtp_connected ? "connected" : "disconnected"} />
              SMTP {readiness?.smtp_connected ? "подключён" : "недоступен"} · обновлено{" "}
              {lastUpdated ? formatDate(lastUpdated) : "—"}
            </div>
            <div className="delivery-system-line">
              <span className={readiness?.imap_connected ? "connected" : "disconnected"} />
              IMAP {readiness?.imap_connected ? "подключён" : readiness?.imap_configured ? "недоступен" : "не настроен"} · follow-up {readiness?.followup_send_blocked ? "заблокирован" : "готов"}
            </div>
            <div className="delivery-system-line">
              <span className={readiness?.consistency_healthy ? "connected" : "disconnected"} />
              Данные {readiness?.consistency_healthy ? "согласованы" : `требуют восстановления: ${readiness?.consistency_issue_count ?? 0}`}
            </div>
          </aside>

          {selectedEntry ? (
            <div className="outreach-editor-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}>
            <aside aria-label="Редактор письма" aria-modal="true" className="outreach-editor" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
              <div>
                <p className="eyebrow">Карточка лида</p>
                <h3>{selectedEntry.company_name}</h3>
                <p className="muted">Текущий этап: {outreachStatusLabels[selectedEntry.status]}</p>
                <Button aria-label="Закрыть" className="editor-close" iconOnly onClick={() => setSelectedId(null)} variant="ghost">×</Button>
              </div>
              <dl className="outreach-card-details">
                <div>
                  <dt>Коммерческий сигнал</dt>
                  <dd>
                    {selectedCommercialSignal?.summary ??
                      NO_VERIFIED_COMMERCIAL_SIGNAL}
                  </dd>
                </div>
                <div>
                  <dt>Тип сигнала</dt>
                  <dd>
                    {getCommercialSignalTypeLabel(
                      selectedCommercialSignal?.type ?? "none",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Источник сигнала</dt>
                  <dd>
                    {selectedCommercialSignal?.sourceUrl ? (
                      <a
                        href={selectedCommercialSignal.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {selectedCommercialSignal.sourceUrl}
                      </a>
                    ) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Уверенность</dt>
                  <dd>
                    {selectedCommercialSignal
                      ? `${selectedCommercialSignal.confidence}%`
                      : "0%"}
                  </dd>
                </div>
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
                <div><dt>Источник контакта</dt><dd>{selectedEntry.email_source_url || "—"}</dd></div>
                <div><dt>Качество email</dt><dd>{selectedEntry.readiness}</dd></div>
                <div><dt>Последнее изменение</dt><dd>{formatDate(selectedEntry.updated_at)}</dd></div>
                <div><dt>Отправлено</dt><dd>{formatDate(selectedEntry.sent_at)}</dd></div>
                <div><dt>Message-ID</dt><dd>{selectedEntry.provider_message_id || "—"}</dd></div>
                <div>
                  <dt>Копия в Яндекс.Почте</dt>
                  <dd>
                    {selectedEntry.sent_copy_saved_at
                      ? `Сохранена ${formatDate(selectedEntry.sent_copy_saved_at)}`
                      : selectedEntry.sent_copy_error || "Не сохранена"}
                  </dd>
                </div>
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
                <Button disabled={pending !== null} loading={pending === selectedEntry.id} onClick={saveEdit} variant="primary">Сохранить изменения</Button>
              ) : null}
            </aside>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
