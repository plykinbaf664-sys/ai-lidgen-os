import Link from "next/link";
import { getLeadgenAnalyticsSnapshot } from "@/lib/leadgen/analytics-snapshot";

export const dynamic = "force-dynamic";

export default async function LeadgenAnalyticsPage() {
  const snapshot = await getLeadgenAnalyticsSnapshot();
  const metrics = snapshot.metrics;
  return (
    <main className="leadgen-app analytics-page">
      <header className="leadgen-product-header analytics-hero">
        <div>
          <span className="leadgen-product-name">Leadgen OS · Command Center</span>
          <h1>Аналитика и решения</h1>
          <p>
            Код собирает агрегаты из рабочих контуров. ИИ получает только компактные
            метрики и формирует аргументированные действия раз в 48 часов.
          </p>
        </div>
        <Link className="button secondary" href="/leadgen">Вернуться к кампаниям</Link>
      </header>

      <section className="analytics-grid" aria-label="Ключевые метрики">
        {[
          ["Кампании", metrics.campaigns],
          ["Компании", metrics.companies],
          ["Контакты", metrics.contacts],
          ["К проверке", metrics.readyForReview],
          ["Одобрено", metrics.approved],
          ["В очереди", metrics.queued],
          ["Первичных отправлено", metrics.initialSent],
          ["Reply rate", `${metrics.replyRate}%`],
        ].map(([label, value]) => (
          <article className="analytics-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="analytics-columns">
        <article className="panel analytics-panel">
          <p className="eyebrow">Источники</p>
          <h2>Origin funnel</h2>
          <dl>
            <div><dt>Discovery</dt><dd>{metrics.origins.discovery}</dd></div>
            <div><dt>AI Hiring</dt><dd>{metrics.origins.aiHiring}</dd></div>
            <div><dt>Imported</dt><dd>{metrics.origins.imported}</dd></div>
          </dl>
        </article>
        <article className="panel analytics-panel">
          <p className="eyebrow">Следующие действия</p>
          <h2>Выводы</h2>
          <ol className="analytics-actions">
            {snapshot.recommendations.map((item) => (
              <li key={`${item.priority}-${item.action}`}>
                <span>{item.priority}</span>
                <div><strong>{item.action}</strong><p>{item.argument}</p></div>
              </li>
            ))}
          </ol>
          <small>
            Режим: {snapshot.analysisMode === "ai_compact" ? "AI по агрегатам" : "кодовые правила"} ·
            следующее обновление: {new Date(snapshot.nextRefreshAt).toLocaleString("ru-RU")}
          </small>
        </article>
      </section>
    </main>
  );
}

