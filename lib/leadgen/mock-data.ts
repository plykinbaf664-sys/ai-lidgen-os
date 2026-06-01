import type { MockCompany } from "@/lib/leadgen/types";

// These records are intentionally fictional and exist only to test the pipeline.
export const mockCompanies: MockCompany[] = [
  {
    id: "northstar-cloud",
    name: "Northstar Cloud",
    domain: "northstar-cloud.example",
    segment: "B2B SaaS",
    contacts: [
      {
        channel: "department-head",
        label: "Head of Growth",
        value: "growth@northstar-cloud.example",
      },
      {
        channel: "general-email",
        label: "General email",
        value: "hello@northstar-cloud.example",
      },
    ],
    signal: {
      title: "Hiring growth roles",
      detail: "Three mock growth and sales vacancies are active.",
      sourceLabel: "Mock careers page",
    },
  },
  {
    id: "orbit-analytics",
    name: "Orbit Analytics",
    domain: "orbit-analytics.example",
    segment: "Data platform",
    contacts: [
      {
        channel: "founder",
        label: "Founder",
        value: "founder@orbit-analytics.example",
      },
      {
        channel: "linkedin",
        label: "Company LinkedIn",
        value: "linkedin.com/company/orbit-analytics-example",
      },
    ],
    signal: {
      title: "Product launch",
      detail: "A mock launch announcement introduces a new analytics workspace.",
      sourceLabel: "Mock company newsroom",
    },
  },
  {
    id: "vector-ops",
    name: "Vector Ops",
    domain: "vector-ops.example",
    segment: "Operations software",
    contacts: [
      {
        channel: "general-email",
        label: "General email",
        value: "team@vector-ops.example",
      },
      {
        channel: "website-form",
        label: "Website form",
        value: "vector-ops.example/contact",
      },
    ],
    signal: {
      title: "High content cadence",
      detail: "Five mock product education posts were published this month.",
      sourceLabel: "Mock company blog",
    },
  },
];
