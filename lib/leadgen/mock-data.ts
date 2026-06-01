import type { MockCompany } from "@/lib/leadgen/types";

// Эти записи намеренно фиктивны и нужны только для проверки процесса.
export const mockCompanies: MockCompany[] = [
  {
    id: "northstar-cloud",
    name: "Northstar Cloud",
    domain: "northstar-cloud.example",
    segment: "B2B SaaS",
    contacts: [
      {
        channel: "department-head",
        label: "Руководитель направления роста",
        value: "growth@northstar-cloud.example",
      },
      {
        channel: "general-email",
        label: "Общая электронная почта",
        value: "hello@northstar-cloud.example",
      },
    ],
    signal: {
      title: "Найм специалистов по росту",
      detail: "Компания открыла три вакансии в направлениях роста и продаж.",
      sourceLabel: "Тестовая страница вакансий",
    },
  },
  {
    id: "orbit-analytics",
    name: "Orbit Analytics",
    domain: "orbit-analytics.example",
    segment: "Платформа данных",
    contacts: [
      {
        channel: "founder",
        label: "Основатель",
        value: "founder@orbit-analytics.example",
      },
      {
        channel: "linkedin",
        label: "LinkedIn компании",
        value: "linkedin.com/company/orbit-analytics-example",
      },
    ],
    signal: {
      title: "Запуск продукта",
      detail: "Компания представила новое аналитическое рабочее пространство.",
      sourceLabel: "Тестовый раздел новостей компании",
    },
  },
  {
    id: "vector-ops",
    name: "Vector Ops",
    domain: "vector-ops.example",
    segment: "ПО для управления операциями",
    contacts: [
      {
        channel: "general-email",
        label: "Общая электронная почта",
        value: "team@vector-ops.example",
      },
      {
        channel: "website-form",
        label: "Форма на сайте",
        value: "vector-ops.example/contact",
      },
    ],
    signal: {
      title: "Высокий темп публикаций",
      detail: "За месяц компания опубликовала пять обучающих материалов о продукте.",
      sourceLabel: "Тестовый блог компании",
    },
  },
];
