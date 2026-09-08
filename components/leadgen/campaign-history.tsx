import type { LeadgenCampaignSummary } from "@/lib/leadgen/types";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";
import { Button } from "@/components/ui/button";
import type { CampaignOperationalStatus } from "@/lib/leadgen/types";
import { getLeadOriginLabel } from "@/lib/leadgen/lead-origin-labels";

const campaignStatusCopy: Record<CampaignOperationalStatus, { label: string; tone: string }> = {
  discovery_complete: { label: "Поиск завершён", tone: "paused" },
  needs_review: { label: "Требует проверки", tone: "needs_review" },
  ready_to_send: { label: "Готова к отправке", tone: "approved" },
  queue_active: { label: "Очередь активна", tone: "queued" },
  sent: { label: "Отправка завершена", tone: "sent" },
  needs_attention: { label: "Требует внимания", tone: "failed" },
};

type CampaignHistoryProps = {
  activeCampaignId?: string | null;
  campaigns: LeadgenCampaignSummary[];
  errorMessage: string | null;
  isLoading: boolean;
  isOpeningCampaign?: boolean;
  onOpenCampaign?: (campaign: LeadgenCampaignSummary) => void;
};

export function CampaignHistory({
  activeCampaignId,
  campaigns,
  errorMessage,
  isLoading,
  isOpeningCampaign = false,
  onOpenCampaign,
}: CampaignHistoryProps) {
  return (
    <details className="panel campaign-history-disclosure">
      <summary>
        <span><strong>История кампаний</strong><small>{isLoading ? "Загрузка…" : `${campaigns.length} запусков`}</small></span>
        <span className="disclosure-icon" aria-hidden="true">⌄</span>
      </summary>
      <div className="campaign-history-content">
        {errorMessage && campaigns.length === 0 ? <p className="outreach-error">{errorMessage}</p> : null}
        {!errorMessage && !isLoading && campaigns.length === 0 ? <p className="empty-state">История пока пуста.</p> : null}
        {campaigns.map((campaign) => {
          const status = campaignStatusCopy[campaign.operational_status];
          const notSent = Math.max(
            0,
            (campaign.email_count ?? campaign.leads_count) -
              campaign.initial_sent_count,
          );
          return (
          <article className={`campaign-history-row ${activeCampaignId === campaign.id ? "active" : ""}`} key={campaign.id}>
            <div className="campaign-history-identity">
              <strong title={normalizeLeadgenText(campaign.name)}>{normalizeLeadgenText(campaign.name)}</strong>
              <small>{new Date(campaign.created_at).toLocaleString("ru-RU")}</small>
              <small>Источник: {getLeadOriginLabel(campaign.origin)}</small>
            </div>
            <dl>
              <div><dt>Компании</dt><dd>{campaign.companies_count}</dd></div>
              <div><dt>Лиды</dt><dd>{campaign.leads_count}</dd></div>
              <div><dt>Email</dt><dd>{campaign.email_count ?? campaign.contacts_count}</dd></div>
              <div><dt>Отправлено</dt><dd>{campaign.initial_sent_count}{campaign.followup_sent_count ? ` + ${campaign.followup_sent_count} дожимов` : ""}</dd></div>
              <div><dt>Одобрено</dt><dd>{campaign.approved_count}</dd></div>
              <div><dt>В очереди</dt><dd>{campaign.queued_count + campaign.sending_count}</dd></div>
              <div><dt>Ошибки</dt><dd>{campaign.failed_count}</dd></div>
            </dl>
            <span className={`outreach-status outreach-status-${status.tone}`}>{status.label}</span>
            <Button
              disabled={isOpeningCampaign}
              loading={isOpeningCampaign && activeCampaignId === campaign.id}
              onClick={() => onOpenCampaign?.(campaign)}
              variant={activeCampaignId === campaign.id ? "success" : "secondary"}
            >
              {isOpeningCampaign && activeCampaignId === campaign.id
                ? "Загрузка…"
                : activeCampaignId === campaign.id
                  ? notSent > 0
                    ? `Открыта · не отправлено ${notSent}`
                    : "Все сообщения отправлены"
                  : notSent > 0
                    ? `Открыть · не отправлено ${notSent}`
                    : "Открыть · всё отправлено"}
            </Button>
          </article>
        );})}
      </div>
    </details>
  );
}
