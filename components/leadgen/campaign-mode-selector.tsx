"use client";

export type CampaignMode = "DISCOVERY" | "AI_HIRING" | "IMPORTED";

const campaignModes: Array<{
  id: CampaignMode;
  title: string;
  description: string;
}> = [
  {
    id: "DISCOVERY",
    title: "По бизнес-сигналам",
    description:
      "Ищем компании по событиям роста, найма, расширения и другим коммерческим признакам.",
  },
  {
    id: "AI_HIRING",
    title: "По прямой потребности в AI",
    description:
      "Ищем компании, которые уже нанимают специалистов для внедрения AI и автоматизации бизнес-процессов.",
  },
  {
    id: "IMPORTED",
    title: "Загрузить свою базу",
    description:
      "Загрузите CSV или XLSX. Система проверит данные, удалит дубли, дополнит недостающую информацию и подготовит контакты.",
  },
];

type CampaignModeSelectorProps = {
  disabled?: boolean;
  onChange: (mode: CampaignMode) => void;
  value: CampaignMode;
};

export function CampaignModeSelector({
  disabled = false,
  onChange,
  value,
}: CampaignModeSelectorProps) {
  return (
    <fieldset className="campaign-mode-selector" disabled={disabled}>
      <legend>Как искать лидов?</legend>
      <div className="campaign-mode-grid">
        {campaignModes.map((mode, index) => (
          <label
            className={`campaign-mode-card ${value === mode.id ? "selected" : ""}`}
            key={mode.id}
          >
            <input
              checked={value === mode.id}
              name="campaign-mode"
              onChange={() => onChange(mode.id)}
              type="radio"
              value={mode.id}
            />
            <span className="campaign-mode-index" aria-hidden="true">
              0{index + 1}
            </span>
            <span className="campaign-mode-copy">
              <strong>{mode.title}</strong>
              <small>{mode.description}</small>
            </span>
            <span className="campaign-mode-indicator" aria-hidden="true" />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
