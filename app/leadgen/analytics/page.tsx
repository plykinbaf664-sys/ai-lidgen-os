import Link from "next/link";
import { getLeadgenAnalyticsSnapshot } from "@/lib/leadgen/analytics-snapshot";
import { getLeadOriginLabel, leadOriginLabels } from "@/lib/leadgen/lead-origin-labels";
import { getRecentCampaigns } from "@/lib/leadgen/storage";
import type { LeadOrigin, LeadgenCampaignSummary } from "@/lib/leadgen/types";
import { getSignalLabel } from "@/lib/leadgen/ui-labels";
import { LEADGEN_VERTICALS } from "@/lib/leadgen/verticals";

export const dynamic = "force-dynamic";

type AnalyticsSearchParams = {
  period?: string;
  source?: string;
  segment?: string;
  campaign?: string;
  signal?: string;
};

function sumFunnel(campaigns: LeadgenCampaignSummary[]) {
  return campaigns.reduce(
    (sum, campaign) => ({
      candidates: sum.candidates + campaign.companies_count,
      qualified: sum.qualified + campaign.leads_count,
      contacts: sum.contacts + campaign.contacts_count,
      ready:
        sum.ready +
        campaign.needs_review_count +
        campaign.approved_count +
        campaign.queued_count +
        campaign.sending_count +
        campaign.initial_sent_count,
      sent: sum.sent + campaign.initial_sent_count,
      replied: sum.replied + (campaign.replied_count ?? 0),
    }),
    { candidates: 0, qualified: 0, contacts: 0, ready: 0, sent: 0, replied: 0 },
  );
}

function isLeadOrigin(value?: string): value is LeadOrigin {
  return value === "DISCOVERY" || value === "AI_HIRING" || value === "IMPORTED";
}

export default async function LeadgenAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsSearchParams>;
}) {
  const [snapshot, campaigns] = await Promise.all([
    getLeadgenAnalyticsSnapshot(),
    getRecentCampaigns(100).catch(() => []),
  ]);
  const filters = await searchParams;
  const periodDays = filters.period && filters.period !== "all" ? Number(filters.period) : null;
  const periodStart = periodDays && Number.isFinite(periodDays)
    ? Date.parse(snapshot.generatedAt) - periodDays * 24 * 60 * 60 * 1_000
    : null;
  const source = isLeadOrigin(filters.source) ? filters.source : null;
  const baseFiltered = campaigns.filter((campaign) => {
    if (periodStart && Date.parse(campaign.created_at) < periodStart) return false;
    if (filters.segment && filters.segment !== "all" && campaign.vertical_id !== filters.segment) return false;
    if (filters.campaign && filters.campaign !== "all" && campaign.id !== filters.campaign) return false;
    if (
      filters.signal &&
      filters.signal !== "all" &&
      !campaign.signal_types?.includes(filters.signal)
    ) return false;
    return true;
  });
  const filtered = source
    ? baseFiltered.filter((campaign) => (campaign.origin ?? "DISCOVERY") === source)
    : baseFiltered;
  const funnel = sumFunnel(filtered);
  const sourceFunnels = (Object.keys(leadOriginLabels) as LeadOrigin[]).map((origin) => ({
    origin,
    ...sumFunnel(baseFiltered.filter((campaign) => (campaign.origin ?? "DISCOVERY") === origin)),
  }));
  const signalTypes = [...new Set(campaigns.flatMap((campaign) => campaign.signal_types ?? []))];
  const hasEnoughData = funnel.sent >= 10 || funnel.candidates >= 20;
  const isGlobalView = !Object.values(filters).some((value) => value && value !== "all");

  return (
    <main className="leadgen-app analytics-page">
      <header className="leadgen-product-header analytics-hero">
        <div className="leadgen-hero-copy">
          <span className="leadgen-product-name">Leadgen OS · Аналитика</span>
          <h1>Аналитика и выводы</h1>
          <p>
            Воронка по кампаниям и источникам. Выводы обновляются раз в 48 часов
            и строятся только по агрегированным данным.
          </p>
        </div>
        <div className="leadgen-header-aside analytics-header-aside">
          <div className="leadgen-orbit" aria-hidden="true"><span /><span /><span /></div>
          <Link className="button secondary leadgen-analytics-link" href="/leadgen">Вернуться к кампаниям</Link>
        </div>
      </header>

      <form className="panel analytics-filters">
        <label><span>Период</span><select defaultValue={filters.period ?? "all"} name="period">
          <option value="all">За всё время</option><option value="7">7 дней</option>
          <option value="30">30 дней</option><option value="90">90 дней</option>
        </select></label>
        <label><span>Источник</span><select defaultValue={filters.source ?? "all"} name="source">
          <option value="all">Все</option>
          {(Object.keys(leadOriginLabels) as LeadOrigin[]).map((origin) => (
            <option key={origin} value={origin}>{getLeadOriginLabel(origin)}</option>
          ))}
        </select></label>
        <label><span>Сегмент</span><select defaultValue={filters.segment ?? "all"} name="segment">
          <option value="all">Все</option>
          {Object.values(LEADGEN_VERTICALS).map((vertical) => (
            <option key={vertical.id} value={vertical.id}>{vertical.label}</option>
          ))}
        </select></label>
        <label><span>Кампания</span><select defaultValue={filters.campaign ?? "all"} name="campaign">
          <option value="all">Все</option>
          {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select></label>
        <label><span>Тип сигнала</span><select defaultValue={filters.signal ?? "all"} name="signal">
          <option value="all">Все</option>
          {signalTypes.map((signal) => <option key={signal} value={signal}>{getSignalLabel(signal)}</option>)}
        </select></label>
        <div className="analytics-filter-actions">
          <button className="button primary" type="submit">Применить</button>
          <Link className="button secondary" href="/leadgen/analytics">Сбросить</Link>
        </div>
      </form>

      <section className="analytics-grid" aria-label="Воронка">
        {[
          ["Найдено", funnel.candidates],
          ["Квалифицировано", funnel.qualified],
          ["Найден контакт", funnel.contacts],
          ["Готово", funnel.ready],
          ["Отправлено", funnel.sent],
          ["Ответили", funnel.replied],
        ].map(([label, value]) => (
          <article className="analytics-stat" key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      <section className="analytics-columns">
        <article className="panel analytics-panel analytics-source-comparison">
          <p className="eyebrow">Сравнение источников</p>
          <h2>Единая воронка</h2>
          <div className="analytics-source-table">
            <div className="analytics-source-row heading">
              <span>Источник</span><span>Найдено</span><span>Квалифицировано</span>
              <span>Готово</span><span>Отправлено</span><span>Ответили</span>
            </div>
            {sourceFunnels.map((item) => (
              <div className="analytics-source-row" key={item.origin}>
                <strong>{getLeadOriginLabel(item.origin)}</strong><span>{item.candidates}</span>
                <span>{item.qualified}</span><span>{item.ready}</span><span>{item.sent}</span><span>{item.replied}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel analytics-panel">
          <p className="eyebrow">Следующие действия</p>
          <h2>Выводы</h2>
          {hasEnoughData && isGlobalView ? (
            <ol className="analytics-actions">
              {snapshot.recommendations.map((item) => (
                <li key={`${item.priority}-${item.action}`}>
                  <span>{item.priority}</span>
                  <div><strong>{item.action}</strong><p>{item.argument}</p></div>
                </li>
              ))}
            </ol>
          ) : <p className="analytics-insufficient">Недостаточно данных для обоснованных рекомендаций по выбранному срезу.</p>}
          <small>Следующее обновление выводов: {new Date(snapshot.nextRefreshAt).toLocaleString("ru-RU")}</small>
        </article>
      </section>
    </main>
  );
}
