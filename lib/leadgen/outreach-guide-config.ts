// Bonuses are delivered as links in the email body. Stored legacy guide
// assignments remain readable, but SMTP must not resolve or attach files.
export const OUTREACH_GUIDE_ATTACHMENTS_ENABLED = false;

export const OUTREACH_BONUS_LINKS = [
  {
    title: "Диагностика отдела продаж — PRO продажи просто",
    url: "https://docs.google.com/spreadsheets/d/1FzDnl0I20FWO83IdaeT7Onqo227ON3imaP8HA7JbYJ8/edit?usp=sharing",
  },
  {
    title: "Бизнес-процессы — шаблон",
    url: "https://docs.google.com/spreadsheets/d/1hT-E7J1FGq0O9ls2oxcjatU4QsbwkDZJy2Q--XE5Y1o/edit?usp=sharing",
  },
] as const;
