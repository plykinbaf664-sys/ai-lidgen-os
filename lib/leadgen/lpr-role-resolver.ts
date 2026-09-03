import type { DecisionMakerProfile } from "@/lib/leadgen/types";

export type LprRole = {
  label: string;
  normalizedRole: string;
  aliases: string[];
};

export type LprRolePlan = {
  primary: LprRole;
  alternatives: LprRole[];
  responsibility: string;
  reasoning: string;
};

const roleFamilies: Array<{ pattern: RegExp; role: LprRole }> = [
  {
    pattern: /(?:vp sales|head of sales|sales director|cro|revenue|продаж|коммерческ)/i,
    role: {
      label: "Руководитель продаж",
      normalizedRole: "sales_leadership",
      aliases: ["руководитель отдела продаж", "директор по продажам", "коммерческий директор"],
    },
  },
  {
    pattern: /(?:cmo|head of marketing|marketing director|маркетинг|digital)/i,
    role: {
      label: "Руководитель маркетинга",
      normalizedRole: "marketing_leadership",
      aliases: ["директор по маркетингу", "руководитель маркетинга", "директор по digital"],
    },
  },
  {
    pattern: /(?:coo|operations|операцион|исполнительн)/i,
    role: {
      label: "Операционный руководитель",
      normalizedRole: "operations_leadership",
      aliases: ["операционный директор", "исполнительный директор", "директор по операциям"],
    },
  },
  {
    pattern: /(?:главн(?:ый|ого) врач|медицинск(?:ий|ого) директор|управляющ(?:ий|его) клиник)/i,
    role: {
      label: "Медицинский руководитель",
      normalizedRole: "medical_leadership",
      aliases: ["главный врач", "медицинский директор", "управляющий клиникой"],
    },
  },
  {
    pattern: /(?:cto|cio|it director|digital transformation|автоматизац|информацион|трансформац)/i,
    role: {
      label: "Руководитель цифровизации",
      normalizedRole: "digital_transformation_leadership",
      aliases: ["директор по цифровой трансформации", "ИТ-директор", "директор по автоматизации"],
    },
  },
  {
    pattern: /(?:ceo|founder|owner|генеральн|собственник|основатель)/i,
    role: {
      label: "Генеральный директор",
      normalizedRole: "executive_leadership",
      aliases: [
        "генеральный директор",
        "заместитель генерального директора",
        "основатель",
        "собственник",
      ],
    },
  },
];

function roleByName(normalizedRole: string): LprRole | null {
  const match = roleFamilies.find((family) => family.role.normalizedRole === normalizedRole);
  return match ? { ...match.role, aliases: [...match.role.aliases] } : null;
}

const alternativePriority: Record<string, string[]> = {
  sales_leadership: ["executive_leadership", "operations_leadership"],
  marketing_leadership: ["executive_leadership", "sales_leadership"],
  operations_leadership: ["executive_leadership", "digital_transformation_leadership"],
  digital_transformation_leadership: ["executive_leadership", "operations_leadership"],
  medical_leadership: ["executive_leadership", "operations_leadership"],
};

function resolveRole(value: string): LprRole | null {
  const match = roleFamilies.find((family) => family.pattern.test(value));
  return match ? { ...match.role, aliases: [...match.role.aliases] } : null;
}

export function resolveBoundedLprRoles(
  profile: DecisionMakerProfile,
): LprRolePlan {
  const context = [
    profile.primary_persona,
    profile.business_problem_owner,
    profile.expected_pain,
    profile.reasoning,
  ].join(" ");
  const primary = resolveRole(context) ?? {
    label: profile.primary_persona,
    normalizedRole: "business_problem_owner",
    aliases: [profile.primary_persona].filter(Boolean),
  };
  const profileAlternatives = profile.alternative_personas
    .map(resolveRole)
    .filter((role): role is LprRole => Boolean(role))
    .filter((role, index, roles) =>
      role.normalizedRole !== primary.normalizedRole &&
      roles.findIndex((candidate) => candidate.normalizedRole === role.normalizedRole) === index,
    )
  const preferredAlternatives = (alternativePriority[primary.normalizedRole] ?? [])
    .map(roleByName)
    .filter((role): role is LprRole => Boolean(role));
  const alternatives = [...preferredAlternatives, ...profileAlternatives]
    .filter((role) => role.normalizedRole !== primary.normalizedRole)
    .filter((role, index, roles) =>
      roles.findIndex((candidate) => candidate.normalizedRole === role.normalizedRole) === index,
    )
    .slice(0, 2);

  return {
    primary,
    alternatives,
    responsibility: profile.business_problem_owner,
    reasoning: profile.reasoning,
  };
}

export function applyLprRolePlan(
  profile: DecisionMakerProfile,
  plan: LprRolePlan,
): DecisionMakerProfile {
  return {
    ...profile,
    primary_persona: plan.primary.label,
    alternative_personas: plan.alternatives.map((role) => role.label),
    search_keywords: [
      ...plan.primary.aliases,
      ...plan.alternatives.flatMap((role) => role.aliases),
    ],
  };
}
