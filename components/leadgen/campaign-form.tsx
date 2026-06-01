"use client";

import { useState, type FormEvent } from "react";
import type { CampaignInput } from "@/lib/leadgen/types";

type CampaignFormProps = {
  onRun: (campaign: CampaignInput) => void;
};

export function CampaignForm({ onRun }: CampaignFormProps) {
  const [name, setName] = useState("Первая тестовая кампания");
  const [requestedBy, setRequestedBy] = useState("Оператор Leadgen OS");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRun({ name: name.trim(), requestedBy: requestedBy.trim() });
  }

  return (
    <form className="campaign-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Название кампании</span>
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="form-field">
        <span>Инициатор запуска</span>
        <input
          required
          value={requestedBy}
          onChange={(event) => setRequestedBy(event.target.value)}
        />
      </label>

      <button className="primary-button" type="submit">
        Запустить тестовый процесс
      </button>
    </form>
  );
}
