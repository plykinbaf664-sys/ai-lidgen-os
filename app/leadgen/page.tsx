import { LeadgenDashboard } from "@/components/leadgen/leadgen-dashboard";
import { leadgenConfig } from "@/lib/leadgen/config";

export default function LeadgenPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Внутренняя панель управления</p>
          <h1>Leadgen OS</h1>
          <p className="muted">
            Тестовый процесс: компания → лучший вход → сигнал → зацепка →
            сообщение → повторное сообщение → предпросмотр Telegram-карточки.
          </p>
        </div>
        <span className="system-badge">Telegram-прототип</span>
      </header>

      <section className="panel campaign-panel">
        <p className="eyebrow">Временная фиксированная конфигурация</p>
        <h2>{leadgenConfig.icp.label}</h2>
        <p className="muted">{leadgenConfig.offer.label}</p>
      </section>

      <div style={{ height: 20 }} />
      <LeadgenDashboard />
    </main>
  );
}
