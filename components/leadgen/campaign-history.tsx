import type { LeadgenCampaignSummary } from "@/lib/leadgen/types";

const statusLabels: Record<LeadgenCampaignSummary["status"], string> = {
  completed: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430",
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
          <p className="eyebrow">\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u0432</p>
          <h2>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439</h2>
        </div>
        <span className="table-meta">
          {isLoading
            ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..."
            : `${campaigns.length} \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439`}
        </span>
      </div>

      {errorMessage ? (
        <div className="empty-state">
          <h3>\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0438\u0441\u0442\u043e\u0440\u0438\u044e</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!errorMessage && campaigns.length === 0 ? (
        <div className="empty-state">
          <h3>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043e\u043a\u0430 \u043f\u0443\u0441\u0442\u0430\u044f</h3>
          <p>
            \u0417\u0430\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e, \u0447\u0442\u043e\u0431\u044b \u043e\u043d\u0430 \u043f\u043e\u044f\u0432\u0438\u043b\u0430\u0441\u044c \u0432 \u0438\u0441\u0442\u043e\u0440\u0438\u0438.
          </p>
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
                    <span className="field-label">\u0413\u043e\u0442\u043e\u0432\u044b\u0435 \u043b\u0438\u0434\u044b</span>
                    <strong>{campaign.leads_count}</strong>
                  </div>
                  <div>
                    <span className="field-label">\u041d\u0430\u0439\u0434\u0435\u043d\u043e \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0439</span>
                    <strong>{campaign.companies_count}</strong>
                  </div>
                  <div>
                    <span className="field-label">\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u044b</span>
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
                    ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430..."
                    : activeCampaignId === campaign.id
                      ? "\u041e\u0442\u043a\u0440\u044b\u0442\u043e"
                      : "\u041e\u0442\u043a\u0440\u044b\u0442\u044c"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
