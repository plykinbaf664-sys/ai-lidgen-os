import { LeadgenDashboard } from "@/components/leadgen/leadgen-dashboard";

const valueProps = [
  {
    title: "Находит повод написать",
    text: "Проверяет сигналы роста, найма, запусков и изменений в компании.",
  },
  {
    title: "Определяет нужного человека",
    text: "Ищет ЛПР и подтверждает его связь с найденной компанией.",
  },
  {
    title: "Готовит контакт и письмо",
    text: "Находит рабочий email, тему и текст для первого обращения.",
  },
];

const strategyTags = ["Россия и СНГ", "B2B", "Продажи", "Поддержка", "Автоматизация"];

export default function LeadgenPage() {
  return (
    <main className="shell">
      <section className="leadgen-hero">
        <div className="hero-copy">
          <span className="product-badge">AI-платформа для B2B-продаж</span>
          <h1>Leadgen OS</h1>
          <p className="hero-subtitle">
            Находит компании с реальным коммерческим поводом, определяет ЛПР,
            ищет рабочий email и готовит персональное письмо для первого контакта.
          </p>
          <p className="hero-positioning">
            От поиска компании до готового письма в одном рабочем процессе.
          </p>

          <div className="hero-value-grid">
            {valueProps.map((item) => (
              <article className="hero-value-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="strategy-card" aria-label="Текущая стратегия поиска">
          <p className="eyebrow">Текущая стратегия поиска</p>
          <h2>Компании с нагрузкой на продажи, поддержку и ручные процессы</h2>
          <div className="strategy-section">
            <span>Целевая аудитория</span>
            <p>
              Российские и СНГ-компании, где растут продажи, клиентские
              коммуникации или операционная нагрузка.
            </p>
          </div>
          <div className="strategy-section">
            <span>Предложение</span>
            <p>
              ИИ-автоматизация лидогенерации, квалификации, повторных касаний и
              клиентских коммуникаций.
            </p>
          </div>
          <div className="strategy-tags">
            {strategyTags.map((tag) => (
              <span className="mock-pill" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </aside>
      </section>

      <LeadgenDashboard />
    </main>
  );
}
