import type { LeadgenCampaignSummary } from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignSummary["status"], string> = {
  completed: "Завершена",
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
  function handleOpenCampaign(campaign: LeadgenCampaignSummary) {
    onOpenCampaign?.(campaign);
  }

  return (
    <section className="panel table-panel">
      <div className="table-toolbar">
        <div>
          <p className="eyebrow">История запусков</p>
          <h2>История кампаний</h2>
        </div>
        <span className="table-meta">
          {isLoading ? "Загрузка..." : `${campaigns.length} кампаний`}
        </span>
      </div>

      {errorMessage ? (
        <div className="empty-state">
          <h3>Не удалось загрузить историю</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!errorMessage && campaigns.length === 0 ? (
        <div className="empty-state">
          <h3>История пока пустая</h3>
          <p>Запустите кампанию, чтобы она появилась в истории.</p>
        </div>
      ) : null}

      {!errorMessage && campaigns.length > 0 ? (
        <div className="campaign-history-list">
          {campaigns.map((campaign) => (
            <article className="campaign-history-card" key={campaign.id}>
              <div className="campaign-history-card-row">
                <div className="campaign-history-main">
                  <div>
                    <h3>{campaign.name}</h3>
                    <p className="company-domain">
                      {new Date(campaign.created_at).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <span className="status-pill status-approved">
                    {statusLabels[campaign.status]}
                  </span>
                </div>

                <div className="campaign-history-stats">
                  <div>
                    <span className="field-label">Компании</span>
                    <strong>{campaign.companies_count}</strong>
                  </div>
                  <div>
                    <span className="field-label">Контакты</span>
                    <strong>{campaign.contacts_count}</strong>
                  </div>
                </div>

                <button
                  className="detail-button"
                  disabled={isOpeningCampaign}
                  type="button"
                  onClick={() => handleOpenCampaign(campaign)}
                >
                  {isOpeningCampaign && activeCampaignId === campaign.id
                    ? "Загрузка..."
                    : activeCampaignId === campaign.id
                      ? "Открыто"
                      : "Открыть"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
