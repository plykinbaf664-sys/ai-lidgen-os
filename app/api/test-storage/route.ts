import { NextResponse } from "next/server";
import { savePipelineResult } from "@/lib/leadgen/storage";
import type {
  LeadgenCampaign,
  LeadgenEvent,
  LeadgenLead,
  LeadgenSignal,
  MockPipelineResult,
  TelegramNotification,
} from "@/lib/leadgen/types";

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };

    return JSON.stringify({
      message: maybeError.message,
      code: maybeError.code,
      details: maybeError.details,
      hint: maybeError.hint,
    });
  }

  return String(error);
}

export async function GET() {
  try {
    const createdAt = new Date().toISOString();
    const pipelineRunId = `test-storage-${Date.now()}`;
    const campaignId = `campaign-${pipelineRunId}`;
    const leadId = `lead-${pipelineRunId}`;
    const signalId = `signal-${pipelineRunId}`;
    const eventId = `event-${pipelineRunId}`;
    const notificationId = `telegram-notification-${pipelineRunId}`;

    const campaign: LeadgenCampaign = {
      id: campaignId,
      pipeline_run_id: pipelineRunId,
      name: "Тестовая проверка storage",
      requested_by: "test-storage route",
      status: "completed",
      icp_label: "Тестовый ICP для проверки сохранения",
      offer_label: "Тестовый оффер для проверки сохранения",
      created_at: createdAt,
    };

    const lead: LeadgenLead = {
      id: leadId,
      pipeline_run_id: pipelineRunId,
      campaign_id: campaignId,
      company_name: "Storage Test Company",
      company_domain: "storage-test.example",
      company_segment: "Тестовый сегмент",
      contact_channel: "general-email",
      contact_label: "Общая электронная почта",
      contact_value: "hello@storage-test.example",
      company_source_url: "https://storage-test.example",
      lead_score: 80,
      signal_title: "Тестовый сигнал",
      signal_detail: "Создана тестовая запись для проверки storage layer.",
      signal_source_label: "test-storage route",
      hook: "Storage Test Company: создана тестовая запись.",
      message: "Тестовое сообщение для проверки сохранения в Supabase.",
      follow_up: "Тестовое повторное сообщение.",
      status: "new",
      created_at: createdAt,
      updated_at: createdAt,
    };

    const signal: LeadgenSignal = {
      id: signalId,
      pipeline_run_id: pipelineRunId,
      campaign_id: campaignId,
      lead_id: leadId,
      signal_type: "TECH_SIGNAL",
      signal_title: "Тестовый сигнал",
      signal_detail: "Создана тестовая запись для проверки storage layer.",
      signal_source_label: "test-storage route",
      source_url: "https://storage-test.example/signal",
      confidence_score: 80,
      found_at: createdAt,
      created_at: createdAt,
    };

    const event: LeadgenEvent = {
      id: eventId,
      pipeline_run_id: pipelineRunId,
      campaign_id: campaignId,
      lead_id: leadId,
      event_type: "lead_generated",
      payload: { company_name: lead.company_name },
      created_at: createdAt,
    };

    const notification: TelegramNotification = {
      id: notificationId,
      pipeline_run_id: pipelineRunId,
      lead_id: leadId,
      campaign_id: campaignId,
      telegram_card_text: "Тестовая Telegram-карточка для проверки storage layer.",
      status: "prepared",
      created_at: createdAt,
    };

    const result: MockPipelineResult = {
      campaign,
      leads: [lead],
      signals: [signal],
      events: [event],
    };

    await savePipelineResult({
      result,
      notifications: [notification],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: formatRouteError(error),
      },
      { status: 500 },
    );
  }
}
