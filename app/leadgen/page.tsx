import { LeadgenDashboard } from "@/components/leadgen/leadgen-dashboard";

export default function LeadgenPage() {
  return (
    <main className="leadgen-app">
      <header className="leadgen-product-header">
        <div>
          <span className="leadgen-product-name">Leadgen OS</span>
          <h1>Генерация клиентов</h1>
          <p>
            Находит компании по реальным коммерческим сигналам, определяет ЛПР,
            ищет рабочий email и подготавливает персонализированное первое касание.
          </p>
        </div>
        <div className="leadgen-pipeline" aria-label="Процесс Leadgen OS">
          <span>Компания</span><i>→</i><span>Сигнал</span><i>→</i><span>ЛПР</span>
          <i>→</i><span>Email</span><i>→</i><span>Письмо</span><i>→</i><span>Отправка</span>
        </div>
      </header>
      <LeadgenDashboard />
    </main>
  );
}
