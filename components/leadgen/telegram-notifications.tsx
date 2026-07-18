"use client";

import { useState } from "react";
import type {
  LeadgenLead,
  TelegramNotification,
  TelegramNotificationStatus,
} from "@/lib/leadgen/types";
import { normalizeLeadgenText } from "@/lib/leadgen/text-normalization";

const statusLabels: Record<TelegramNotificationStatus, string> = {
  pending: "Ожидает подготовки",
  prepared: "Подготовлено",
  sent: "Отправлено",
  failed: "Ошибка",
};

const statusClasses: Record<TelegramNotificationStatus, string> = {
  pending: "status-new",
  prepared: "status-approved",
  sent: "status-approved",
  failed: "status-rejected",
};

type TelegramNotificationsProps = {
  leads: LeadgenLead[];
  notifications: TelegramNotification[];
};

export function TelegramNotifications({
  leads,
  notifications,
}: TelegramNotificationsProps) {
  const [expandedNotificationId, setExpandedNotificationId] = useState<
    string | null
  >(null);
  const companyNames = new Map(
    leads.map((lead) => [lead.id, normalizeLeadgenText(lead.company_name)]),
  );
  const preparedCount = notifications.filter(
    (notification) => notification.status === "prepared",
  ).length;

  function toggleDetails(notificationId: string) {
    setExpandedNotificationId((currentId) =>
      currentId === notificationId ? null : notificationId,
    );
  }

  return (
    <section className="panel notifications-panel">
      <div className="table-toolbar">
        <div>
          <p className="eyebrow">Уведомления для Телеграм</p>
          <h2>Подготовленные карточки</h2>
        </div>
        <span className="table-meta">
          {notifications.length === 0
            ? "Ожидание запуска кампании"
            : `${preparedCount} подготовлено · ${notifications.length} всего`}
        </span>
      </div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <h3>Уведомлений пока нет</h3>
          <p>
            После запуска кампании здесь появятся подготовленные карточки.
            Отправка сообщений отключена.
          </p>
        </div>
      ) : (
        <div className="notification-list">
          {notifications.map((notification) => (
            <article className="notification-item" key={notification.id}>
              <div className="notification-meta">
                <div>
                  <h3>{companyNames.get(notification.lead_id) ?? "Лид без названия"}</h3>
                  <p className="company-domain">
                    {new Date(notification.created_at).toLocaleString("ru-RU")}
                  </p>
                </div>
                <span
                  className={`status-pill ${statusClasses[notification.status]}`}
                >
                  {statusLabels[notification.status]}
                </span>
                <button
                  className="detail-button"
                  type="button"
                  onClick={() => toggleDetails(notification.id)}
                >
                  {expandedNotificationId === notification.id
                    ? "Скрыть детали"
                    : "Показать детали"}
                </button>
              </div>
              {expandedNotificationId === notification.id ? (
                <div className="notification-details">
                  <p>
                    <strong>Идентификатор уведомления:</strong> {notification.id}
                  </p>
                  <p>
                    <strong>Идентификатор лида:</strong> {notification.lead_id}
                  </p>
                  <p>
                    <strong>Идентификатор кампании:</strong> {notification.campaign_id}
                  </p>
                  <div className="telegram-card">
                    {normalizeLeadgenText(notification.telegram_card_text)}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
