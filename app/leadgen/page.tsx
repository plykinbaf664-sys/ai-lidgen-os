import { LeadgenDashboard } from "@/components/leadgen/leadgen-dashboard";
import { leadgenConfig } from "@/lib/leadgen/config";

export default function LeadgenPage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal operations panel</p>
          <h1>Leadgen OS</h1>
          <p className="muted">
            Mock pipeline: company → best entry → signal → hook → message →
            follow-up → Telegram preview.
          </p>
        </div>
        <span className="system-badge">Telegram-first mock</span>
      </header>

      <section className="panel campaign-panel">
        <p className="eyebrow">Temporary fixed configuration</p>
        <h2>{leadgenConfig.icp.label}</h2>
        <p className="muted">{leadgenConfig.offer.label}</p>
      </section>

      <div style={{ height: 20 }} />
      <LeadgenDashboard />
    </main>
  );
}
