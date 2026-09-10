import "server-only";

import { readLocalTable, mutateLocalTable } from "@/lib/leadgen/local-database";
import { listLocalOutreachEntries } from "@/lib/leadgen/local-outreach-store";
import { getRecentCampaigns } from "@/lib/leadgen/storage";
import { getLatestSourceCanaryMetrics } from "@/lib/leadgen/source-canary-store";

const REFRESH_INTERVAL_MS = 48 * 60 * 60 * 1_000;
const SNAPSHOT_TABLE = "leadgen_analytics_snapshots";

export type LeadgenAnalyticsSnapshot = {
  schemaVersion: 2;
  id: string;
  generatedAt: string;
  nextRefreshAt: string;
  metrics: {
    campaigns: number;
    companies: number;
    leads: number;
    contacts: number;
    readyForReview: number;
    approved: number;
    queued: number;
    initialSent: number;
    followupSent: number;
    replied: number;
    replyRate: number;
    origins: {
      discovery: number;
      aiHiring: number;
      imported: number;
    };
  };
  sourceCanaries?: {
    aiHiring: {
      candidates: number;
      qualified: number;
      ready: number;
      sampleSize: number;
      confidence: "INSUFFICIENT_DATA" | "LOW" | "USABLE";
    } | null;
    imported: {
      candidates: number;
      qualified: number;
      ready: number;
      sampleSize: number;
      confidence: "INSUFFICIENT_DATA" | "LOW" | "USABLE";
    } | null;
  };
  recommendations: Array<{
    priority: "P0" | "P1" | "P2";
    action: string;
    argument: string;
  }>;
  analysisMode: "code" | "ai_compact";
};

function canaryConfidence(sampleSize: number, candidates: number) {
  if (sampleSize < 20 || candidates < 3) return "INSUFFICIENT_DATA" as const;
  if (sampleSize < 50 || candidates < 10) return "LOW" as const;
  return "USABLE" as const;
}

function snapshotPayload(snapshot: LeadgenAnalyticsSnapshot) {
  return JSON.stringify({
    metrics: snapshot.metrics,
    sourceCanaries: snapshot.sourceCanaries,
    recommendations: snapshot.recommendations,
    analysisMode: snapshot.analysisMode,
  });
}

function deterministicRecommendations(
  metrics: LeadgenAnalyticsSnapshot["metrics"],
) {
  const recommendations: LeadgenAnalyticsSnapshot["recommendations"] = [];
  if (metrics.readyForReview > 0) {
    recommendations.push({
      priority: "P0",
      action: `Проверить ${metrics.readyForReview} подготовленных писем.`,
      argument: "Без ручного одобрения готовые контакты не переходят в общую очередь.",
    });
  }
  if (metrics.approved > 0 && metrics.queued === 0) {
    recommendations.push({
      priority: "P0",
      action: `Поставить ${metrics.approved} одобренных писем в очередь.`,
      argument: "Письма уже прошли ручное решение, но доставка ещё не запланирована.",
    });
  }
  if (metrics.initialSent >= 10 && metrics.replyRate < 3) {
    recommendations.push({
      priority: "P1",
      action: "Проверить связь сигнала, предложения и призыва к ответу на выборке отправленных писем.",
      argument: `Текущая доля ответов ${metrics.replyRate.toFixed(1)}% ниже рабочего диагностического порога 3%.`,
    });
  }
  if (metrics.origins.aiHiring === 0) {
    recommendations.push({
      priority: "P2",
      action: "После проверки включить контролируемый запуск поиска по прямой потребности в AI.",
      argument: "Сейчас этот более сильный сигнал не участвует в рабочей воронке.",
    });
  }
  return recommendations.slice(0, 5);
}

async function generateAiRecommendations(
  metrics: LeadgenAnalyticsSnapshot["metrics"],
) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || process.env.LEADGEN_ANALYTICS_AI_ENABLED !== "true") return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LEADGEN_ANALYTICS_OPENAI_MODEL?.trim() || "gpt-5-mini",
      store: false,
      instructions:
        "Ты анализируешь только агрегированные метрики Leadgen OS. Верни максимум 5 конкретных действий. Не выдумывай данные, причины и проценты. Каждое действие должно иметь проверяемый аргумент из входных метрик.",
      input: JSON.stringify(metrics),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "leadgen_analytics_actions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              recommendations: {
                type: "array",
                maxItems: 5,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    priority: { type: "string", enum: ["P0", "P1", "P2"] },
                    action: { type: "string" },
                    argument: { type: "string" },
                  },
                  required: ["priority", "action", "argument"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      },
      max_output_tokens: 900,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) return null;
  const result = (await response.json()) as { output_text?: string };
  if (!result.output_text) return null;
  const parsed = JSON.parse(result.output_text) as {
    recommendations?: LeadgenAnalyticsSnapshot["recommendations"];
  };
  return Array.isArray(parsed.recommendations)
    ? parsed.recommendations.slice(0, 5)
    : null;
}

export async function getLeadgenAnalyticsSnapshot(force = false) {
  const stored = await readLocalTable<LeadgenAnalyticsSnapshot & Record<string, unknown>>(
    SNAPSHOT_TABLE,
  );
  const latest = [...stored].sort(
    (left, right) => Date.parse(right.generatedAt) - Date.parse(left.generatedAt),
  )[0];
  if (
    !force &&
    latest?.schemaVersion === 2 &&
    Date.parse(latest.nextRefreshAt) > Date.now()
  ) return latest;

  const [campaigns, outreach, canaries] = await Promise.all([
    getRecentCampaigns(100).catch(() => []),
    listLocalOutreachEntries().catch(() => []),
    getLatestSourceCanaryMetrics().catch(() => ({ aiHiring: null, imported: null })),
  ]);
  const initialSent = outreach.filter(
    (entry) => entry.message_kind !== "follow_up" && entry.status === "sent",
  ).length;
  const replied = outreach.filter((entry) => Boolean(entry.reply_detected_at)).length;
  const metrics: LeadgenAnalyticsSnapshot["metrics"] = {
    campaigns: campaigns.length,
    companies: campaigns.reduce((sum, campaign) => sum + campaign.companies_count, 0),
    leads: campaigns.reduce((sum, campaign) => sum + campaign.leads_count, 0),
    contacts: campaigns.reduce((sum, campaign) => sum + campaign.contacts_count, 0),
    readyForReview: campaigns.reduce((sum, campaign) => sum + campaign.needs_review_count, 0),
    approved: outreach.filter((entry) => entry.status === "approved").length,
    queued: outreach.filter((entry) => ["queued", "sending"].includes(entry.status)).length,
    initialSent,
    followupSent: outreach.filter(
      (entry) => entry.message_kind === "follow_up" && entry.status === "sent",
    ).length,
    replied,
    replyRate: initialSent > 0 ? Math.round((replied / initialSent) * 1_000) / 10 : 0,
    origins: {
      discovery: campaigns
        .filter((campaign) => (campaign.origin ?? "DISCOVERY") === "DISCOVERY")
        .reduce((sum, campaign) => sum + campaign.companies_count, 0),
      aiHiring: campaigns
        .filter((campaign) => campaign.origin === "AI_HIRING")
        .reduce((sum, campaign) => sum + campaign.companies_count, 0),
      imported: campaigns
        .filter((campaign) => campaign.origin === "IMPORTED")
        .reduce((sum, campaign) => sum + campaign.companies_count, 0),
    },
  };
  const aiRecommendations = await generateAiRecommendations(metrics).catch(() => null);
  const generatedAt = new Date();
  const snapshot: LeadgenAnalyticsSnapshot = {
    schemaVersion: 2,
    id: `analytics-${generatedAt.toISOString()}`,
    generatedAt: generatedAt.toISOString(),
    nextRefreshAt: new Date(generatedAt.getTime() + REFRESH_INTERVAL_MS).toISOString(),
    metrics,
    sourceCanaries: {
      aiHiring: canaries.aiHiring ? {
        candidates: canaries.aiHiring.candidates,
        qualified: canaries.aiHiring.qualified,
        ready: canaries.aiHiring.ready,
        sampleSize: canaries.aiHiring.sampleSize,
        confidence: canaryConfidence(canaries.aiHiring.sampleSize, canaries.aiHiring.candidates),
      } : null,
      imported: canaries.imported ? {
        candidates: canaries.imported.candidates,
        qualified: canaries.imported.qualified,
        ready: canaries.imported.ready,
        sampleSize: canaries.imported.sampleSize,
        confidence: canaryConfidence(canaries.imported.sampleSize, canaries.imported.candidates),
      } : null,
    },
    recommendations: aiRecommendations ?? deterministicRecommendations(metrics),
    analysisMode: aiRecommendations ? "ai_compact" : "code",
  };
  await mutateLocalTable(SNAPSHOT_TABLE, (rows) => {
    rows.splice(
      0,
      rows.length,
      ...rows.filter((row) => row.schemaVersion === 2),
    );
    const latestIndex = rows.reduce(
      (best, row, index) => Date.parse(String(row.generatedAt)) > Date.parse(String(rows[best]?.generatedAt ?? 0)) ? index : best,
      0,
    );
    const latestStored = rows[latestIndex] as LeadgenAnalyticsSnapshot | undefined;
    if (latestStored && snapshotPayload(latestStored) === snapshotPayload(snapshot)) {
      rows[latestIndex] = snapshot;
      return;
    }
    rows.push(snapshot);
    rows.sort(
      (left, right) => Date.parse(String(right.generatedAt)) - Date.parse(String(left.generatedAt)),
    );
    rows.splice(30);
  });
  return snapshot;
}
