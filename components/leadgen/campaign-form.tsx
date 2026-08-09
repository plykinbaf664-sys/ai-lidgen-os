"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { CampaignInput } from "@/lib/leadgen/types";
import { DEFAULT_VERTICAL_ID, LEADGEN_VERTICALS, type LeadgenVerticalId } from "@/lib/leadgen/verticals";

type CampaignFormProps = {
  isRunning?: boolean;
  onRun: (campaign: CampaignInput) => void | Promise<void>;
};

const defaultRequestedBy = "Оператор Leadgen OS";

export function CampaignForm({ isRunning = false, onRun }: CampaignFormProps) {
  const [verticalId, setVerticalId] = useState<LeadgenVerticalId>(DEFAULT_VERTICAL_ID);
  const [name, setName] = useState("Производственные компании — отдел продаж");

  function handleVerticalChange(value: LeadgenVerticalId) {
    setVerticalId(value);
    setName(`${LEADGEN_VERTICALS[value].label} — новые лиды`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onRun({ name: name.trim(), requestedBy: defaultRequestedBy, verticalId });
  }

  return (
    <form className="campaign-form campaign-form-compact" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Сегмент</span>
        <select disabled={isRunning} value={verticalId} onChange={(event) => handleVerticalChange(event.target.value as LeadgenVerticalId)}>
          {Object.values(LEADGEN_VERTICALS).map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.label}</option>)}
        </select>
      </label>
      <label className="form-field">
        <span>Название кампании</span>
        <input disabled={isRunning} required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <p className="muted campaign-vertical-note">{LEADGEN_VERTICALS[verticalId].offer}</p>
      <Button className="campaign-submit-button" loading={isRunning} type="submit" variant="primary">
        {isRunning ? "Идёт поиск…" : "Запустить поиск"}
      </Button>
    </form>
  );
}
