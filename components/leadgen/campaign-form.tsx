"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignInput } from "@/lib/leadgen/types";

type CampaignFormProps = {
  isRunning?: boolean;
  onRun: (campaign: CampaignInput) => void | Promise<void>;
};

const defaultCampaignName = "Производственные компании — отдел продаж";
const defaultRequestedBy = "Оператор Leadgen OS";

export function CampaignForm({ isRunning = false, onRun }: CampaignFormProps) {
  const [name, setName] = useState(defaultCampaignName);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onRun({ name: name.trim(), requestedBy: defaultRequestedBy });
  }

  return (
    <form className="campaign-form campaign-form-compact" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Название кампании</span>
        <input
          disabled={isRunning}
          placeholder="Например: Производственные компании — отдел продаж"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <Button className="campaign-submit-button" loading={isRunning} type="submit" variant="primary">
        {isRunning ? "Идёт поиск..." : "Запустить поиск"}
      </Button>
    </form>
  );
}
