import { LeadgenDashboard } from "@/components/leadgen/leadgen-dashboard";
import Link from "next/link";

export default function LeadgenPage() {
  return (
    <main className="leadgen-app">
      <header className="leadgen-product-header">
        <div className="leadgen-hero-copy">
          <span className="leadgen-product-name">Leadgen OS</span>
          <h1>Генерация клиентов</h1>
          <p>
            Находит компании по реальным коммерческим сигналам, определяет ЛПР,
            ищет рабочий email и подготавливает персонализированное первое касание.
          </p>
          <div className="leadgen-pipeline" aria-label="Процесс Leadgen OS">
            <span>Компания</span><i>→</i><span>Сигнал</span><i>→</i><span>Контакт</span>
            <i>→</i><span>Письмо</span><i>→</i><span>Отправка</span>
          </div>
        </div>
        <div className="leadgen-header-aside">
          <div className="leadgen-orbit" aria-hidden="true">
            <span /><span /><span />
          </div>
          <Link className="button secondary leadgen-analytics-link" href="/leadgen/analytics">
            Аналитика и выводы <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <LeadgenDashboard />
    </main>
  );
}
