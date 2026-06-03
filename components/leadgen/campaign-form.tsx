"use client";

import { useState, type FormEvent } from "react";
import type { CampaignInput } from "@/lib/leadgen/types";

type CampaignFormProps = {
  isRunning?: boolean;
  onRun: (campaign: CampaignInput) => void | Promise<void>;
};

export function CampaignForm({ isRunning = false, onRun }: CampaignFormProps) {
  const [name, setName] = useState("Первая тестовая кампания");
  const [requestedBy, setRequestedBy] = useState("Оператор Leadgen OS");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onRun({ name: name.trim(), requestedBy: requestedBy.trim() });
  }

  return (
    <form className="campaign-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Название кампании</span>
        <input
          disabled={isRunning}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="form-field">
        <span>Инициатор запуска</span>
        <input
          disabled={isRunning}
          required
          value={requestedBy}
          onChange={(event) => setRequestedBy(event.target.value)}
        />
      </label>

      <button className="primary-button" disabled={isRunning} type="submit">
        {isRunning ? "Запускаю..." : "Запустить тестовый процесс"}
      </button>
    </form>
  );
}
